// Fix Chinese name search by rebuilding person fulltext index
const neo4j = require('neo4j-driver');
const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const pass = process.env.NEO4J_PASSWORD || 'password';
const d = neo4j.driver(uri, neo4j.auth.basic(user, pass));
const s = d.session();

async function main() {
  // Check 沈志勋
  const r = await s.run('MATCH (p:Person {uuid: "770e8400-e29b-41d4-a716-446655440010"}) RETURN p.englishName, p.chineseName, p.orcid');
  if (r.records.length === 0) {
    console.log('Person NOT FOUND with that UUID!');
    // Find by name
    const r2 = await s.run('MATCH (p:Person) WHERE p.chineseName = "沈志勋" OR p.englishName CONTAINS "Shen Zhixun" RETURN p.uuid, p.englishName, p.chineseName LIMIT 5');
    r2.records.forEach(rr => console.log(rr.get('p.uuid'), rr.get('p.englishName'), '|', rr.get('p.chineseName')));
  } else {
    r.records.forEach(rr => console.log(rr.get('p.englishName'), '|', rr.get('p.chineseName'), '|', rr.get('p.orcid')));
  }

  // Rebuild index
  try { await s.run('DROP INDEX person_fulltext'); console.log('Dropped old index'); } catch(e) { console.log('Skip drop:', e.message); }
  await s.run('CREATE FULLTEXT INDEX person_fulltext FOR (n:Person) ON EACH [n.englishName, n.chineseName, n.aliases, n.researchInterests, n.description]');
  console.log('Index created');

  // Test
  const r3 = await s.run('CALL db.index.fulltext.queryNodes("person_fulltext", "沈志勋") YIELD node RETURN node.englishName, node.chineseName LIMIT 3');
  console.log('Search results:', r3.records.length);
  r3.records.forEach(rr => console.log('  ', rr.get('node.englishName'), '|', rr.get('node.chineseName')));

  s.close(); d.close();
}
main().catch(e => { console.error(e.message); s.close(); d.close(); });
