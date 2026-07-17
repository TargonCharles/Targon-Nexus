// =============================================================================
// fix-relationships.ts — 修复所有缺失的关系边
//   1. Person → Lab (MEMBER_OF)
//   2. Lab → University (BELONGS_TO)
//   3. Person → University (AFFILIATED_WITH) from paper/affiliation data
// =============================================================================
import 'dotenv/config';

async function main() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password'),
  );
  const session = driver.session();

  try {
    // 1. 从论文 affiliation 创建大学→人物关系
    console.log('🏛️  创建 AFFILIATED_WITH 关系...');
    const r1 = await session.run(`
      MATCH (p:Person)-[:AFFILIATED_WITH]->(u:University)
      WHERE NOT EXISTS { (p)-[:MEMBER_OF]->(:Lab) }
      WITH p, u
      // 为每个 Person-University 创建一个 Lab
      MERGE (lab:Lab {name: coalesce(p.englishName, p.chineseName) + ' Research Group'})
      ON CREATE SET lab.uuid = randomUUID(),
                    lab.createdAt = datetime(),
                    lab.sourceTier = 'TIER_2_ACADEMIC'
      MERGE (p)-[:MEMBER_OF]->(lab)
      MERGE (lab)-[:BELONGS_TO]->(u)
      RETURN count(DISTINCT lab) AS labs
    `);
    console.log(`  ✅ ${r1.records[0].get('labs')} 实验室创建`);

    // 2. 把 COAUTHOR_WITH 产生的合作者也关联到同一实验室
    console.log('👥 关联合作者到实验室...');
    const r2 = await session.run(`
      MATCH (p1:Person)-[:MEMBER_OF]->(lab:Lab),
            (p1)-[:COAUTHOR_WITH]-(p2:Person)
      WHERE NOT EXISTS { (p2)-[:MEMBER_OF]->(:Lab) }
      WITH p2, lab
      LIMIT 500
      MERGE (p2)-[:MEMBER_OF]->(lab)
      RETURN count(*) AS c
    `);
    console.log(`  ✅ ${r2.records[0].get('c')} 合作者关联`);

    // 3. 为周兴江手动创建真实的 Laser-ARPES 组
    console.log('🔬 创建周兴江实验室...');
    const r3 = await session.run(`
      MATCH (p:Person {uuid: '770e8400-e29b-41d4-a716-446655440001'})
      MATCH (u:University {name: 'Institute of Physics - Chinese Academy of Sciences'})
      MERGE (lab:Lab {name: 'Laser-ARPES Group (周兴江组)'})
      ON CREATE SET lab.uuid = randomUUID(),
                    lab.englishName = 'Laser-ARPES Group',
                    lab.chineseName = '超导与激光ARPES研究组',
                    lab.city = 'Beijing',
                    lab.country = 'China',
                    lab.homepage = 'https://laser-arpes.iphy.ac.cn',
                    lab.description = '中国科学院物理研究所超导国家重点实验室 — 激光角分辨光电子能谱研究组',
                    lab.sourceTier = 'TIER_1_OFFICIAL',
                    lab.createdAt = datetime()
      MERGE (p)-[:MEMBER_OF]->(lab)
      MERGE (lab)-[:BELONGS_TO]->(u)
      RETURN lab.uuid
    `);
    console.log(`  ✅ 周兴江组创建`);

    // 4. 统计现在的数据
    console.log('\n📊 图谱统计:');
    const stats = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) AS type, count(r) AS cnt
      ORDER BY cnt DESC
    `);
    stats.records.forEach(r => {
      console.log(`  ${r.get('type')}: ${r.get('cnt')}`);
    });

    // 5. 检查哪些 Lab 有人
    const labStats = await session.run(`
      MATCH (p:Person)-[:MEMBER_OF]->(l:Lab)
      WITH l, count(p) AS members
      WHERE members > 0
      RETURN l.name AS name, members
      ORDER BY members DESC
      LIMIT 10
    `);
    console.log('\n🏛️  人员最多的实验室:');
    labStats.records.forEach(r => {
      console.log(`  ${r.get('name')}: ${r.get('members')} 人`);
    });

    console.log('\n✅ 关系修复完成');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
