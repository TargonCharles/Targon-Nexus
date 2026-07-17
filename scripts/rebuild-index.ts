import 'dotenv/config';
async function main() {
  const n = require('neo4j-driver');
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'password';
  const d = n.driver(uri, n.auth.basic(user, pass));
  const s = d.session();

  // List labs
  const r = await s.run('MATCH (p:Person)-[:MEMBER_OF]->(l:Lab) WITH l,count(p) AS c WHERE c>=1 RETURN l.name AS name, c ORDER BY c DESC LIMIT 15');
  console.log('Labs with members:');
  r.records.forEach(rr => console.log('  ' + String(rr.get('c')).padStart(3) + '  ' + rr.get('name')));

  // Rebuild
  try { await s.run('DROP INDEX lab_fulltext'); console.log('dropped'); } catch(e) {}
  await s.run('CREATE FULLTEXT INDEX lab_fulltext FOR (n:Lab) ON EACH [n.name,n.englishName,n.chineseName,n.description]');
  console.log('Index rebuilt');

  // Verify
  const r2 = await s.run('CALL db.index.fulltext.queryNodes("lab_fulltext", "Laser") YIELD node RETURN node.name LIMIT 3');
  r2.records.forEach(rr => console.log('Search "Laser":', rr.get('node.name')));

  s.close(); d.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
