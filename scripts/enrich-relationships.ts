// =============================================================================
// enrich-relationships.ts — 批量构建人物关系图谱
//
// 功能:
//   1. 对所有 Person 调用 S2 API，下载论文 → 创建 Paper 节点 + AUTHORED 边
//   2. 从 S2 论文的 authors 字段提取合作者 → 创建 COAUTHOR_WITH 边
//   3. 从 Wikidata 获取导师/学生/教育经历 → 创建 ADVISOR_OF 边 + Timeline
//   4. 更新时间线（教育/职业履历）
//
// 用法: npx ts-node --project apps/api/tsconfig.json scripts/enrich-relationships.ts
// =============================================================================

import 'dotenv/config';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD || 'password';

const S2_AUTHOR_SEARCH = 'https://api.semanticscholar.org/graph/v1/author/search';
const S2_AUTHOR = 'https://api.semanticscholar.org/graph/v1/author';
const S2_PAPERS = 'https://api.semanticscholar.org/graph/v1/author';

// 动态导入 neo4j-driver
async function getDriver() {
  const neo4j = require('neo4j-driver');
  return neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface S2Author {
  authorId: string; name: string; hIndex?: number; paperCount?: number;
  citationCount?: number; affiliations?: string[]; homepage?: string;
}

interface S2Paper {
  paperId: string; title: string; year?: number; citationCount?: number;
  externalIds?: { DOI?: string };
  authors?: { authorId?: string; name: string }[];
  journal?: { name?: string };
}

// ================================================================
// S2 API 调用
// ================================================================

async function fetchJson(url: string, timeout = 15_000): Promise<any> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'TargonNexus/1.0 (enrichment)' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function searchS2Author(name: string): Promise<S2Author | null> {
  const url = `${S2_AUTHOR_SEARCH}?query=${encodeURIComponent(name)}&limit=3`;
  const data = await fetchJson(url, 10_000);
  if (!data?.data?.length) return null;
  // 找名字最匹配的
  const best = data.data.find((a: any) =>
    a.name?.toLowerCase() === name.toLowerCase()) || data.data[0];
  return best;
}

async function getS2AuthorDetail(authorId: string): Promise<S2Author | null> {
  const url = `${S2_AUTHOR}/${authorId}?fields=name,hIndex,paperCount,citationCount,affiliations,homepage`;
  return fetchJson(url, 10_000);
}

async function getS2AuthorPapers(authorId: string, offset = 0): Promise<S2Paper[]> {
  const url = `${S2_PAPERS}/${authorId}/papers?limit=100&offset=${offset}&fields=title,year,citationCount,externalIds,authors,journal`;
  const data = await fetchJson(url, 20_000);
  return data?.data ?? [];
}

// ================================================================
// Wikidata 查询
// ================================================================

async function fetchWikidata(name: string): Promise<{
  advisorName?: string; almaMater?: string; birthDate?: string;
} | null> {
  try {
    const query = `
      SELECT ?person ?advisorLabel ?almaMaterLabel ?birthDate WHERE {
        ?person wdt:P31 wd:Q5; rdfs:label ?personLabel.
        FILTER(CONTAINS(LCASE(?personLabel), LCASE("${name.replace(/"/g, '\\"')}")))
        FILTER(LANG(?personLabel) = "en")
        OPTIONAL { ?person wdt:P184 ?advisor. ?advisor rdfs:label ?advisorLabel. FILTER(LANG(?advisorLabel) = "en") }
        OPTIONAL { ?person wdt:P69 ?almaMater. ?almaMater rdfs:label ?almaMaterLabel. FILTER(LANG(?almaMaterLabel) = "en") }
        OPTIONAL { ?person wdt:P569 ?birthDate. }
      } LIMIT 5
    `;
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    const data = await fetchJson(url, 15_000);
    const bindings = data?.results?.bindings;
    if (!bindings?.length) return null;
    const best = bindings.find((b: any) =>
      b.personLabel?.value?.toLowerCase() === name.toLowerCase()) || bindings[0];
    return {
      advisorName: best?.advisorLabel?.value,
      almaMater: best?.almaMaterLabel?.value,
      birthDate: best?.birthDate?.value,
    };
  } catch { return null; }
}

// ================================================================
// Neo4j 写入
// ================================================================

async function savePapers(session: any, personUuid: string, papers: S2Paper[]) {
  if (!papers.length) return 0;
  const batch = papers.map(pp => ({
    doi: pp.externalIds?.DOI || `s2:${pp.paperId}`,
    paperId: pp.paperId,
    title: pp.title || '',
    year: pp.year ?? 0,
    citationCount: pp.citationCount ?? 0,
    journal: pp.journal?.name || '',
  }));

  await session.run(
    `UNWIND $papers AS pp
     MERGE (paper:Paper {doi: pp.doi})
     ON CREATE SET paper.uuid = randomUUID(),
                   paper.title = pp.title,
                   paper.year = pp.year,
                   paper.citationCount = pp.citationCount,
                   paper.journal = pp.journal,
                   paper.sourceTier = 'TIER_2_ACADEMIC',
                   paper.createdAt = datetime()
     WITH paper, pp
     MATCH (p:Person {uuid: $personUuid})
     MERGE (p)-[:AUTHORED]->(paper)
     RETURN count(paper) AS c`,
    { personUuid, papers: batch },
  );
  return batch.length;
}

async function saveCoAuthors(session: any, personUuid: string, personName: string, papers: S2Paper[]) {
  // 从论文作者列表提取合作者，建立 COAUTHOR_WITH 关系
  const coAuthorMap = new Map<string, { name: string; count: number }>();
  for (const pp of papers) {
    const authors = pp.authors ?? [];
    for (const a of authors) {
      if (!a.name || a.name.toLowerCase() === personName.toLowerCase()) continue;
      const key = a.name.toLowerCase().replace(/[^a-z]/g, '');
      const existing = coAuthorMap.get(key);
      if (existing) { existing.count++; }
      else { coAuthorMap.set(key, { name: a.name, count: 1 }); }
    }
  }

  let created = 0;
  for (const [, info] of coAuthorMap) {
    if (info.count < 2) continue; // 至少合作 2 篇论文才算合作者
    await session.run(
      `MERGE (co:Person {englishName: $name})
       ON CREATE SET co.uuid = randomUUID(), co.createdAt = datetime(), co.sourceTier = 'TIER_2_ACADEMIC'
       WITH co
       MATCH (p:Person {uuid: $personUuid})
       MERGE (p)-[:COAUTHOR_WITH {papers: $count}]-(co)
       RETURN co.uuid`,
      { personUuid, name: info.name, count: info.count },
    );
    created++;
  }
  return created;
}

async function saveAdvisorFromWikidata(session: any, personUuid: string, wikidata: { advisorName?: string; almaMater?: string; birthDate?: string }) {
  if (wikidata.advisorName) {
    await session.run(
      `MERGE (adv:Person {englishName: $advName})
       ON CREATE SET adv.uuid = randomUUID(), adv.createdAt = datetime(), adv.sourceTier = 'TIER_2_ACADEMIC'
       WITH adv
       MATCH (p:Person {uuid: $uuid})
       MERGE (adv)-[:ADVISOR_OF]->(p)
       SET p.advisorName = $advName`,
      { uuid: personUuid, advName: wikidata.advisorName },
    );
  }
  if (wikidata.almaMater) {
    await session.run(
      `MATCH (p:Person {uuid: $uuid})
       MERGE (u:University {name: $alma})
       ON CREATE SET u.uuid = randomUUID(), u.englishName = $alma, u.createdAt = datetime()
       WITH p, u
       MERGE (p)-[:AFFILIATED_WITH {type: 'alumni'}]->(u)`,
      { uuid: personUuid, alma: wikidata.almaMater },
    );
  }
  if (wikidata.birthDate) {
    await session.run(
      `MATCH (p:Person {uuid: $uuid}) SET p.birthDate = $bd`,
      { uuid: personUuid, bd: wikidata.birthDate },
    );
  }
}

async function updatePersonProperties(session: any, uuid: string, props: Record<string, any>) {
  const sets: string[] = [];
  const params: any = { uuid };
  if (props.hIndex != null) { sets.push('p.hIndex = $hIndex'); params.hIndex = props.hIndex; }
  if (props.paperCount != null) { sets.push('p.paperCount = $paperCount'); params.paperCount = props.paperCount; }
  if (props.citationCount != null) { sets.push('p.citationCount = $cit'); params.cit = props.citationCount; }
  if (props.homepage) { sets.push('p.homepage = $hp'); params.hp = props.homepage; }
  if (props.description) { sets.push('p.description = coalesce(p.description, $desc)'); params.desc = props.description; }
  sets.push('p.lastEnriched = datetime()');
  if (sets.length === 0) return;
  await session.run(
    `MATCH (p:Person {uuid: $uuid}) SET ${sets.join(', ')}`,
    params,
  );
}

// ================================================================
// 主流程
// ================================================================

async function main() {
  const driver = await getDriver();
  const session = driver.session();

  try {
    // 1. 获取所有需要富化的人物（优先处理有 ORCID 或英文名的）
    const result = await session.run(
      `MATCH (p:Person)
       WHERE p.englishName IS NOT NULL
         AND (p.lastEnriched IS NULL OR p.lastEnriched < datetime() - duration({days: 7}))
       RETURN p.uuid AS uuid, p.englishName AS name, p.orcid AS orcid
       ORDER BY p.citationCount DESC
       LIMIT 50`
    );

    const people = result.records.map(r => ({
      uuid: r.get('uuid'),
      name: r.get('name'),
      orcid: r.get('orcid'),
    }));

    console.log(`\n🔍 准备富化 ${people.length} 个人物\n`);

    let totalPapers = 0;
    let totalCoAuthors = 0;
    let totalAdvisors = 0;
    let enriched = 0;

    for (let i = 0; i < people.length; i++) {
      const { uuid, name } = people[i];
      const idx = `${i + 1}/${people.length}`;

      try {
        // Step 1: 搜索 S2 作者
        console.log(`\n[${idx}] 🔎 "${name}" — 搜索 S2...`);
        const s2Search = await searchS2Author(name);
        if (!s2Search) {
          console.log(`  ⚠️  S2 未找到匹配`);
          continue;
        }

        await sleep(500); // S2 rate limit

        // Step 2: 获取 S2 作者详情
        const s2Detail = await getS2AuthorDetail(s2Search.authorId);
        if (s2Detail) {
          console.log(`  📊 hIndex=${s2Detail.hIndex}, papers=${s2Detail.paperCount}, citations=${s2Detail.citationCount}`);
          await updatePersonProperties(session, uuid, s2Detail);
        }

        await sleep(500);

        // Step 3: 获取论文列表 + 创建 AUTHORED 边
        let allPapers: S2Paper[] = [];
        for (let offset = 0; offset < 300; offset += 100) {
          const batch = await getS2AuthorPapers(s2Search.authorId, offset);
          if (!batch.length) break;
          allPapers.push(...batch);
          if (batch.length < 100) break;
          await sleep(1000);
        }
        const savedPapers = await savePapers(session, uuid, allPapers);
        totalPapers += savedPapers;
        console.log(`  📄 论文: ${savedPapers} 篇入库`);

        // Step 4: 从论文作者提取合作者
        const coAuthors = await saveCoAuthors(session, uuid, name, allPapers);
        totalCoAuthors += coAuthors;
        console.log(`  🤝 合作者: ${coAuthors} 人`);

        await sleep(1000);

        // Step 5: Wikidata (导师/教育)
        const wikidata = await fetchWikidata(name);
        if (wikidata) {
          await saveAdvisorFromWikidata(session, uuid, wikidata);
          if (wikidata.advisorName) {
            totalAdvisors++;
            console.log(`  🧬 导师: ${wikidata.advisorName}`);
          }
          if (wikidata.almaMater) console.log(`  🎓 母校: ${wikidata.almaMater}`);
        } else {
          console.log(`  ⚠️  Wikidata 无数据`);
        }

        enriched++;
      } catch (e: any) {
        console.log(`  ❌ 错误: ${e.message}`);
      }

      // S2 API 限速
      await sleep(1500);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 完成！`);
    console.log(`   富化人物: ${enriched}/${people.length}`);
    console.log(`   论文入库: ${totalPapers}`);
    console.log(`   合作者关系: ${totalCoAuthors}`);
    console.log(`   导师关系: ${totalAdvisors}`);
    console.log(`\n现在刷新人物页面即可看到关系网络和学术家谱。`);

    // ================================================================
    // Step 6: 从合作者网络推断学术家谱
    // ================================================================
    console.log(`\n🧬 推断导师/学生关系...`);
    const inferResult = await session.run(
      `MATCH (a:Person)-[:COAUTHOR_WITH]-(b:Person)
       WHERE a.hIndex IS NOT NULL AND b.hIndex IS NOT NULL
         AND a.hIndex > b.hIndex * 2
         AND a.paperCount > b.paperCount
       WITH a, b
       OPTIONAL MATCH (a)-[r:ADVISOR_OF]->(b)
       WITH a, b, r WHERE r IS NULL
       MERGE (a)-[:ADVISOR_OF]->(b)
       RETURN count(*) AS inferred`
    );
    const inferredAdvisors = inferResult.records[0]?.get('inferred')?.toNumber?.() ?? inferResult.records[0]?.get('inferred') ?? 0;
    console.log(`  🧬 推断导师关系: ${inferredAdvisors} 条`);
    console.log(`    (规则: A 的 hIndex > B 的 hIndex × 2, 且 A 论文数更多 → A 是 B 的导师)`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
