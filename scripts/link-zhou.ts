import 'dotenv/config';
async function main() {
  const neo4j = require('neo4j-driver');
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'password';
  const d = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const s = d.session();

  // Create university
  const u = await s.run(`
    MERGE (u:University {name: 'Institute of Physics CAS'})
    ON CREATE SET u.uuid = randomUUID(), u.englishName = 'Institute of Physics, CAS',
                  u.chineseName = '中国科学院物理研究所', u.country = 'China',
                  u.sourceTier = 'TIER_1_OFFICIAL', u.createdAt = datetime()
    RETURN u.uuid
  `);
  const uu = u.records[0].get('u.uuid');
  console.log('Univ:', uu);

  // Create lab
  const lab = await s.run(`
    MATCH (u:University {uuid: $uu})
    MERGE (lab:Lab {name: 'Laser-ARPES Group'})
    ON CREATE SET lab.uuid = randomUUID(), lab.englishName = 'Laser-ARPES Group (Prof. Zhou)',
                  lab.chineseName = '超导激光ARPES研究组', lab.city = 'Beijing', lab.country = 'China',
                  lab.homepage = 'https://laser-arpes.iphy.ac.cn', lab.sourceTier = 'TIER_1_OFFICIAL', lab.createdAt = datetime()
    WITH lab, u
    MERGE (lab)-[:BELONGS_TO]->(u)
    RETURN lab.uuid
  `, { uu });
  const lu = lab.records[0].get('lab.uuid');
  console.log('Lab:', lu);

  // Link
  await s.run(`
    MATCH (p:Person {uuid: $pu}), (lab:Lab {uuid: $lu}), (u:University {uuid: $uu})
    MERGE (p)-[:MEMBER_OF]->(lab)
    MERGE (p)-[:AFFILIATED_WITH]->(u)
  `, { pu: '770e8400-e29b-41d4-a716-446655440001', lu, uu });
  console.log('Linked');

  // Check
  const m = await s.run(`MATCH (p:Person)-[:MEMBER_OF]->(l:Lab {uuid: $lu}) RETURN p.englishName`, { lu });
  m.records.forEach(r => console.log('Member:', r.get('p.englishName')));

  s.close(); d.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
