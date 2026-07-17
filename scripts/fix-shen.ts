// Fix 沈志勋 (Zhi-Xun Shen) and 沈大伟 (Dawei Shen) with real S2 data
import 'dotenv/config';

const S2_AUTHOR = 'https://api.semanticscholar.org/graph/v1/author';

async function fetchJson(url: string) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'TargonNexus/1.0' }, signal: AbortSignal.timeout(20_000) });
  return resp.ok ? resp.json() : null;
}

async function fixPerson(session: any, neo4jUuid: string, s2AuthorId: string) {
  // Get real S2 data
  const detail = await fetchJson(`${S2_AUTHOR}/${s2AuthorId}?fields=name,hIndex,paperCount,citationCount,affiliations,homepage`);
  if (!detail) return console.log('S2 fetch failed');

  console.log(`\n📊 ${detail.name}: hIndex=${detail.hIndex} papers=${detail.paperCount} citations=${detail.citationCount}`);

  // Update Person node
  const sets: string[] = ['p.lastEnriched = datetime()', 'p.dataSource = "s2-corrected"'];
  if (detail.hIndex != null) sets.push(`p.hIndex = ${detail.hIndex}`);
  if (detail.paperCount != null) sets.push(`p.paperCount = ${detail.paperCount}`);
  if (detail.citationCount != null) sets.push(`p.citationCount = ${detail.citationCount}`);
  if (detail.homepage) sets.push(`p.homepage = "${detail.homepage.replace(/"/g, '\\"')}"`);
  if (detail.affiliations?.length) sets.push(`p.description = "${detail.affiliations[0].replace(/"/g, '\\"')}"`);
  await session.run(`MATCH (p:Person {uuid: $uuid}) SET ${sets.join(', ')}`, { uuid: neo4jUuid });

  // Get papers
  const papersData = await fetchJson(`${S2_AUTHOR}/${s2AuthorId}/papers?limit=100&fields=title,year,citationCount,externalIds,authors,journal`);
  const papers = papersData?.data ?? [];
  console.log(`  📄 ${papers.length} papers`);

  if (papers.length) {
    const batch = papers.map((p: any) => ({
      doi: p.externalIds?.DOI || `s2:${p.paperId}`,
      title: p.title || '', year: p.year || 0, cit: p.citationCount || 0,
      journal: p.journal?.name || '',
    }));
    await session.run(`
      UNWIND $papers AS pp
      MERGE (paper:Paper {doi: pp.doi})
      ON CREATE SET paper.uuid = randomUUID(), paper.title = pp.title, paper.year = pp.year,
                    paper.citationCount = pp.cit, paper.journal = pp.journal,
                    paper.sourceTier = 'TIER_2_ACADEMIC', paper.createdAt = datetime()
      WITH paper, pp
      MATCH (p:Person {uuid: $uuid})
      MERGE (p)-[:AUTHORED]->(paper)
    `, { uuid: neo4jUuid, papers: batch });

    // Co-authors
    let coMap = new Map<string, { name: string; count: number }>();
    for (const pp of papers) {
      for (const a of (pp.authors || [])) {
        if (!a.name) continue;
        const key = a.name.toLowerCase().replace(/[^a-z]/g, '');
        const existing = coMap.get(key);
        if (existing) existing.count++;
        else coMap.set(key, { name: a.name, count: 1 });
      }
    }
    let c = 0;
    for (const [, info] of coMap) {
      if (info.count < 2) continue;
      await session.run(`
        MERGE (co:Person {englishName: $name})
        ON CREATE SET co.uuid = randomUUID(), co.createdAt = datetime(), co.sourceTier = 'TIER_2_ACADEMIC'
        WITH co MATCH (p:Person {uuid: $uuid})
        MERGE (p)-[:COAUTHOR_WITH {papers: $cnt}]-(co)
      `, { uuid: neo4jUuid, name: info.name, cnt: info.count });
      c++;
    }
    console.log(`  🤝 ${c} co-authors`);
  }
}

async function main() {
  const neo4j = require('neo4j-driver');
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'password';
  const d = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const s = d.session();

  // 沈志勋 (Zhi-Xun Shen) at Stanford — S2 author ID
  await fixPerson(s, '770e8400-e29b-41d4-a716-446655440010', '2283848584');

  // Also try Dawei Shen
  const searchRes = await fetchJson('https://api.semanticscholar.org/graph/v1/author/search?query=Dawei+Shen+Chinese+Academy&limit=3');
  if (searchRes?.data?.length) {
    console.log('\n🔍 Dawei Shen candidates:');
    for (const a of searchRes.data) console.log(`  ${a.authorId} ${a.name}`);
    await fixPerson(s, '770e8400-e29b-41d4-a716-446655440049', searchRes.data[0].authorId);
  }

  s.close(); d.close();
  console.log('\n✅ Done. Refresh http://localhost:3006');
}
main().catch(e => { console.error(e.message); process.exit(1); });
