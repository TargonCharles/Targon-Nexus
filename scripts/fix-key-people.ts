// Fix key researchers with correct ORCID/homepage found from web search
import 'dotenv/config';

const PEOPLE = [
  {
    uuid: '770e8400-e29b-41d4-a716-446655440010', // 沈志勋 (Zhi-Xun Shen)
    orcid: '0000-0002-1454-0281',
    homepage: 'https://profiles.stanford.edu/zhi-xun-shen',
    englishName: 'Zhi-Xun Shen',
    chineseName: '沈志勋',
    position: 'Paul Pigott Professor of Physical Sciences, Stanford University',
    s2AuthorId: '145230329', // S2 ID from verified profile
  },
  {
    uuid: '770e8400-e29b-41d4-a716-446655440049', // 沈大伟 (Dawei Shen)
    orcid: '',
    homepage: 'https://faculty.ustc.edu.cn/dwshen/en/index.htm',
    englishName: 'Dawei Shen',
    chineseName: '沈大伟',
    position: 'Professor, National Synchrotron Radiation Laboratory, USTC',
    s2AuthorId: '2147377602',
  },
];

async function fetchJson(url: string) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'TargonNexus/1.0' }, signal: AbortSignal.timeout(20_000) });
  return resp.ok ? resp.json() : null;
}

async function enrichPerson(session: any, person: typeof PEOPLE[0]) {
  console.log(`\n🔧 修正 ${person.chineseName}...`);

  // 1. Update ORCID + homepage
  const sets: string[] = ['p.lastEnriched = datetime()'];
  if (person.orcid) sets.push('p.orcid = $orcid');
  if (person.homepage) sets.push('p.homepage = $hp');
  if (person.englishName) sets.push('p.englishName = $en');
  if (person.chineseName) sets.push('p.chineseName = $cn');
  if (person.position) sets.push('p.currentStatus = $pos');
  await session.run(
    `MATCH (p:Person {uuid: $uuid}) SET ${sets.join(', ')}`,
    { uuid: person.uuid, orcid: person.orcid, hp: person.homepage, en: person.englishName, cn: person.chineseName, pos: person.position }
  );
  console.log(`  ✅ ORCID=${person.orcid} homepage=${person.homepage}`);

  // 2. Try S2 enrichment with correct author ID
  if (person.s2AuthorId) {
    const s2Url = `https://api.semanticscholar.org/graph/v1/author/${person.s2AuthorId}?fields=name,hIndex,paperCount,citationCount,affiliations,homepage`;
    const detail = await fetchJson(s2Url);
    if (detail?.hIndex != null) {
      console.log(`  📊 S2: hIndex=${detail.hIndex} papers=${detail.paperCount} citations=${detail.citationCount}`);
      await session.run(
        `MATCH (p:Person {uuid: $uuid}) SET p.hIndex = $hi, p.paperCount = $pc, p.citationCount = $cc, p.dataSource = 's2-verified'`,
        { uuid: person.uuid, hi: detail.hIndex, pc: detail.paperCount, cc: detail.citationCount }
      );
    }
    // Get papers
    const papersData = await fetchJson(`https://api.semanticscholar.org/graph/v1/author/${person.s2AuthorId}/papers?limit=100&fields=title,year,citationCount,externalIds,authors,journal`);
    const papers = papersData?.data ?? [];
    if (papers.length) {
      const batch = papers.map((p: any) => ({
        doi: p.externalIds?.DOI || `s2:${p.paperId}`, title: p.title || '', year: p.year || 0, cit: p.citationCount || 0, journal: p.journal?.name || '',
      }));
      await session.run(`
        UNWIND $papers AS pp
        MERGE (paper:Paper {doi: pp.doi})
        ON CREATE SET paper.uuid = randomUUID(), paper.title = pp.title, paper.year = pp.year,
                      paper.citationCount = pp.cit, paper.journal = pp.journal,
                      paper.sourceTier = 'TIER_2_ACADEMIC', paper.createdAt = datetime()
        WITH paper, pp
        MATCH (p:Person {uuid: $uuid}) MERGE (p)-[:AUTHORED]->(paper)
      `, { uuid: person.uuid, papers: batch });
      console.log(`  📄 ${papers.length} papers saved`);
    }
  }

  // 3. Crawl homepage for more data
  if (person.homepage) {
    try {
      const resp = await fetch(person.homepage, { headers: { 'User-Agent': 'TargonNexus/1.0' }, signal: AbortSignal.timeout(15_000) });
      if (resp.ok) {
        const html = await resp.text();
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 5000);
        console.log(`  🌐 Homepage: ${text.length} chars`);
        // Extract key info
        const eduMatch = text.match(/(?:B\.S\.|M\.S\.|Ph\.D\.).*?(?:\d{4})/gi);
        if (eduMatch) console.log(`  🎓 Education: ${eduMatch.slice(0, 3).join(' | ')}`);
      }
    } catch(e: any) { console.log(`  ⚠️ Homepage unreachable: ${e.message}`); }
  }
}

async function main() {
  const neo4j = require('neo4j-driver');
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'password';
  const d = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const s = d.session();

  for (const person of PEOPLE) {
    await enrichPerson(s, person);
    await new Promise(r => setTimeout(r, 2000)); // rate limit
  }

  // Print updated profiles
  for (const person of PEOPLE) {
    const r = await s.run(
      `MATCH (p:Person {uuid: $uuid}) RETURN p.englishName, p.chineseName, p.orcid, p.hIndex, p.paperCount, p.citationCount, p.currentStatus`,
      { uuid: person.uuid }
    );
    const rec = r.records[0];
    console.log(`\n✅ ${rec.get('p.chineseName')}: hIdx=${rec.get('p.hIndex')} papers=${rec.get('p.paperCount')} cites=${rec.get('p.citationCount')}`);
  }

  s.close(); d.close();
  console.log('\n✅ Done. Refresh http://localhost:3006');
}
main().catch(e => { console.error(e.message); process.exit(1); });
