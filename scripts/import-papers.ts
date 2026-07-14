// =============================================================================
// Targon Nexus — 批量论文导入 + 引用网络构建
// 从 datasets/papers/seed.csv 导入，并通过 Semantic Scholar API 获取引用信息
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import neo4j from 'neo4j-driver';

// — Neo4j 连接 —
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

interface PaperRow {
  doi: string; title: string; authors: string; year: string;
  journal: string; citationCount: string; keywords: string;
}

interface SemanticScholarPaper {
  paperId: string; title: string; year: number; journal?: { name: string };
  citationCount: number; citations?: { paperId: string; title: string }[];
  references?: { paperId: string; title: string; year: number }[];
}

function parseCsv(filePath: string): PaperRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: PaperRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
    rows.push(row as unknown as PaperRow);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

async function importPapers(session: neo4j.Session, papers: PaperRow[]): Promise<{ created: number }> {
  let created = 0;
  const batchSize = 30;

  for (let b = 0; b < papers.length; b += batchSize) {
    const batch = papers.slice(b, b + batchSize);
    const txn = session.beginTransaction();

    try {
      for (const paper of batch) {
        const uuid = `paper-import-${paper.doi.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const authors = paper.authors.split(';').map((a) => a.trim()).filter(Boolean);
        const keywords = paper.keywords.split(';').map((k) => k.trim()).filter(Boolean);
        const year = parseInt(paper.year, 10) || null;
        const citationCount = parseInt(paper.citationCount, 10) || 0;

        await txn.run(
          `MERGE (p:Paper {doi: $doi})
           ON CREATE SET
             p.uuid = $uuid,
             p.title = $title,
             p.authors = $authors,
             p.year = $year,
             p.journal = $journal,
             p.citationCount = $citationCount,
             p.keywords = $keywords,
             p.source = 'batch_import',
             p.confidence = 0.9,
             p.createdAt = datetime(),
             p.updatedAt = datetime()
           ON MATCH SET
             p.citationCount = $citationCount,
             p.updatedAt = datetime()
           RETURN p.uuid`,
          { doi: paper.doi, uuid, title: paper.title, authors, year, journal: paper.journal, citationCount, keywords },
        );

        // 尝试匹配作者到已有 Person
        for (let i = 0; i < authors.length; i++) {
          const authorName = authors[i];
          // 跳过 "et al." 标记
          if (authorName.toLowerCase().includes('et al')) continue;

          const nameParts = authorName.split(/\s+/);
          if (nameParts.length < 2) continue;

          // 尝试多种名称匹配
          await txn.run(
            `MATCH (p:Paper {doi: $doi})
             MATCH (person:Person)
             WHERE toLower(coalesce(person.englishName, '')) CONTAINS toLower($lastName)
                OR toLower(coalesce(person.chineseName, '')) CONTAINS toLower($lastName)
             WITH p, person
             LIMIT 1
             MERGE (p)-[r:AUTHORED_BY]->(person)
             ON CREATE SET
               r.authorPosition = $position,
               r.confidence = 0.6,
               r.source = 'name_matching',
               r.createdAt = datetime()
             ON MATCH SET r.updatedAt = datetime()
             RETURN r`,
            { doi: paper.doi, lastName: nameParts[nameParts.length - 1], position: i + 1 },
          );
        }

        created++;
      }
      await txn.commit();
      console.log(`  ✅ 批次 ${b / batchSize + 1}: ${batch.length} 篇论文`);
    } catch (err: any) {
      await txn.rollback();
      console.error(`  ❌ 批次 ${b / batchSize + 1} 失败: ${err.message}`);
    }
  }

  return { created };
}

async function enrichCitationsWithSemanticScholar(session: neo4j.Session): Promise<void> {
  console.log('\n  📚 通过 Semantic Scholar API 获取引用关系...');

  // 获取已有论文 DOI（没有 CITES 关系的优先）
  const result = await session.run(
    `MATCH (p:Paper)
     OPTIONAL MATCH (p)-[r:CITES]->(:Paper)
     WITH p, count(r) AS citeCount
     WHERE citeCount = 0
     RETURN p.doi AS doi, p.uuid AS uuid
     LIMIT 50`,
  );

  const papers = result.records.map((r) => ({ doi: r.get('doi'), uuid: r.get('uuid') }));
  console.log(`  找到 ${papers.length} 篇需要获取引用的论文`);

  let enriched = 0;
  for (const paper of papers) {
    try {
      // Semantic Scholar API (免费，无需 API Key，速率限制 ~100/5min)
      const url = `https://api.semanticscholar.org/graph/v1/paper/${paper.doi}?fields=citations.paperId,citations.title,citations.year,references.paperId,references.title,references.year`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'TargonNexus/1.0 (mailto:research@targon-nexus.org)' },
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          console.log('  ⏳ 速率限制，等待 10 秒...');
          await new Promise((r) => setTimeout(r, 10000));
        }
        continue;
      }

      const data: SemanticScholarPaper = await resp.json();

      // 创建引用关系 CITES
      if (data.citations && data.citations.length > 0) {
        for (const citation of data.citations.slice(0, 10)) {
          if (!citation.paperId) continue;
          await session.run(
            `MERGE (citing:Paper {doi: $doi})
             ON CREATE SET
               citing.uuid = randomUUID(),
               citing.title = $title,
               citing.year = $year,
               citing.source = 'semantic_scholar',
               citing.confidence = 0.8,
               citing.createdAt = datetime(),
               citing.updatedAt = datetime()
             WITH citing
             MATCH (p:Paper {doi: $targetDoi})
             MERGE (citing)-[r:CITES]->(p)
             ON CREATE SET
               r.confidence = 0.85,
               r.source = 'semantic_scholar',
               r.createdAt = datetime()
             ON MATCH SET r.updatedAt = datetime()
             RETURN citing.uuid`,
            { doi: `DOI:${citation.paperId}`, title: citation.title || 'Unknown', year: citation.year || null, targetDoi: paper.doi },
          );
        }
      }

      // 创建被引用关系 REFERENCES (反向 CITES)
      if (data.references && data.references.length > 0) {
        for (const ref of data.references.slice(0, 10)) {
          if (!ref.paperId) continue;
          await session.run(
            `MERGE (ref:Paper {doi: $doi})
             ON CREATE SET
               ref.uuid = randomUUID(),
               ref.title = $title,
               ref.year = $year,
               ref.source = 'semantic_scholar',
               ref.confidence = 0.8,
               ref.createdAt = datetime(),
               ref.updatedAt = datetime()
             WITH ref
             MATCH (p:Paper {doi: $sourceDoi})
             MERGE (p)-[r:CITES]->(ref)
             ON CREATE SET
               r.confidence = 0.85,
               r.source = 'semantic_scholar',
               r.createdAt = datetime()
             ON MATCH SET r.updatedAt = datetime()
             RETURN ref.uuid`,
            { doi: `DOI:${ref.paperId}`, title: ref.title || 'Unknown', year: ref.year || null, sourceDoi: paper.doi },
          );
        }
      }

      enriched++;
      if (enriched % 5 === 0) {
        console.log(`  进度: ${enriched}/${papers.length}`);
        await new Promise((r) => setTimeout(r, 3000)); // rate limiting
      }
    } catch (err: any) {
      console.warn(`  ⚠ 获取引用失败 ${paper.doi}: ${err.message}`);
    }
  }

  console.log(`  ✅ 完成: ${enriched} 篇论文引用信息已获取`);
}

async function buildCoAuthorRelationships(session: neo4j.Session): Promise<void> {
  console.log('\n  👥 构建合作者关系...');

  await session.run(
    `MATCH (p:Paper)-[:AUTHORED_BY]->(a1:Person),
           (p)-[:AUTHORED_BY]->(a2:Person)
     WHERE id(a1) < id(a2)
     WITH a1, a2, count(p) AS paperCount, collect(p.title)[0..5] AS samplePapers
     MERGE (a1)-[r:COAUTHOR_WITH]->(a2)
     ON CREATE SET
       r.paperCount = paperCount,
       r.samplePapers = samplePapers,
       r.confidence = 0.9,
       r.source = 'coauthor_inference',
       r.createdAt = datetime()
     ON MATCH SET
       r.paperCount = paperCount,
       r.updatedAt = datetime()
     RETURN count(r) AS newRels`,
  );

  console.log('  ✅ 合作者关系已构建');
}

async function linkPapersToResearchDirections(session: neo4j.Session): Promise<void> {
  console.log('\n  🏷 链接论文到研究方向...');

  // 通过关键词匹配将论文链接到研究方向
  await session.run(
    `MATCH (p:Paper)
     WHERE NOT (p)-[:ABOUT]->(:ResearchDirection)
     MATCH (rd:ResearchDirection)
     WHERE any(kw IN p.keywords WHERE toLower(rd.name) CONTAINS toLower(kw)
              OR toLower(kw) CONTAINS toLower(rd.name))
     WITH p, rd, apoc.text.levenshteinSimilarity(
          reduce(s='', kw IN p.keywords | s + ' ' + kw),
          rd.name + ' ' + coalesce(rd.description, '')
        ) AS similarity
     WHERE similarity > 0.3
     MERGE (p)-[r:ABOUT]->(rd)
     ON CREATE SET
       r.confidence = 0.5 + similarity * 0.4,
       r.relevance = similarity,
       r.source = 'keyword_matching',
       r.createdAt = datetime()
     RETURN count(r) AS newLinks`,
  );

  console.log('  ✅ 论文-研究方向链接已完成');
}

// — 主入口 —
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Targon Nexus — 论文引用网络构建                     ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
    maxConnectionPoolSize: 20, connectionAcquisitionTimeout: 30000,
  });

  const datasetDir = path.resolve(__dirname, '../datasets');
  const session = driver.session();

  try {
    await session.run('RETURN 1');
    console.log('  ✅ 数据库连接成功\n');

    // Step 1: Import papers from CSV
    const paperPath = path.join(datasetDir, 'papers/seed.csv');
    if (fs.existsSync(paperPath)) {
      const papers = parseCsv(paperPath);
      console.log(`  📄 读取到 ${papers.length} 篇论文`);
      const { created } = await importPapers(session, papers);
      console.log(`  ✅ 论文导入: ${created} 篇\n`);
    }

    // Step 2: Build co-author relationships
    await buildCoAuthorRelationships(session);

    // Step 3: Link papers to research directions
    await linkPapersToResearchDirections(session);

    // Step 4: Enrich with Semantic Scholar (optional, needs API access)
    const skipSemanticScholar = process.argv.includes('--skip-s2');
    if (!skipSemanticScholar) {
      try {
        await enrichCitationsWithSemanticScholar(session);
      } catch (err: any) {
        console.warn(`  ⚠ Semantic Scholar API 调用失败: ${err.message}`);
        console.log('  💡 提示: 使用 --skip-s2 跳过 API 调用');
      }
    }

    // 最终统计
    const stats = await session.run(`
      MATCH (p:Paper) RETURN count(p) AS papers
      UNION ALL
      MATCH (:Paper)-[r:CITES]->(:Paper) RETURN count(r) AS papers
      UNION ALL
      MATCH (:Paper)-[r:AUTHORED_BY]->(:Person) RETURN count(r) AS papers
      UNION ALL
      MATCH (:Person)-[r:COAUTHOR_WITH]->(:Person) RETURN count(r) AS papers
      UNION ALL
      MATCH (:Paper)-[r:ABOUT]->(:ResearchDirection) RETURN count(r) AS papers
    `);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  🎉 论文引用网络构建完成!');
    console.log('═══════════════════════════════════════════════════════\n');

    const labels = ['论文总数', '引用关系', '作者关系', '合作者关系', '方向链接'];
    stats.records.forEach((r, i) => {
      console.log(`  ${labels[i] || '统计'}: ${r.get(0)}`);
    });

  } catch (err: any) {
    console.error(`\n  ❌ 失败: ${err.message}`);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
