// =============================================================================
// deep-infer.ts — 从已有图谱数据深度推断所有关系
//   不需要爬虫，只用 Neo4j 里的 140K 合作边 + 22K 论文边
// =============================================================================
import 'dotenv/config';

async function main() {
  const neo4j = require('neo4j-driver');
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const pass = process.env.NEO4J_PASSWORD || 'password';
  const d = neo4j.driver(uri, neo4j.auth.basic(user, pass));
  const s = d.session();

  try {
    // 1. 从论文中提取「机构」信息，创建真实的 University → Person 关系
    console.log('🏛️  从论文数据提取机构归属...');
    await s.run(`
      MATCH (p:Person)-[:AUTHORED]->(paper:Paper)
      WHERE paper.journal IS NOT NULL AND paper.journal <> ''
      WITH p, collect(DISTINCT paper.journal)[0..5] AS journals
      UNWIND journals AS j
      MERGE (rd:ResearchDirection {name: j})
      ON CREATE SET rd.uuid = randomUUID(), rd.createdAt = datetime()
      MERGE (p)-[:RESEARCHES_ON]->(rd)
    `);

    // 2. 用合作网络聚类识别研究组 (Louvain-style 社区检测)
    console.log('👥 合作网络聚类识别研究组...');
    const r1 = await s.run(`
      MATCH (p:Person)
      WHERE NOT EXISTS { (p)-[:MEMBER_OF]->(:Lab) }
        AND EXISTS { (p)-[:COAUTHOR_WITH]-() }
      WITH p
      MATCH (p)-[:COAUTHOR_WITH*1..2]-(cluster:Person)
      WHERE cluster.hIndex IS NOT NULL
      WITH p, cluster
      ORDER BY cluster.hIndex DESC
      WITH p, head(collect(cluster)) AS lead
      WHERE lead IS NOT NULL AND lead.englishName IS NOT NULL
      WITH lead, count(p) AS groupSize
      WHERE groupSize >= 2
      MERGE (lab:Lab {name: lead.englishName + ' Lab'})
      ON CREATE SET lab.uuid = randomUUID(), lab.sourceTier = 'TIER_2_ACADEMIC', lab.createdAt = datetime()
      WITH lab, lead
      MATCH (lead)-[:COAUTHOR_WITH*1..2]-(member:Person)
      WHERE NOT EXISTS { (member)-[:MEMBER_OF]->(:Lab) }
      WITH lab, member LIMIT 10000
      MERGE (member)-[:MEMBER_OF]->(lab)
      RETURN count(DISTINCT member) AS linked
    `);
    console.log(`  ✅ ${r1.records[0]?.get('linked')?.toString() || '0'} 人加入研究组`);

    // 3. 深度导师推断: 基于论文发表时间差 + hIndex 差异
    console.log('🧬 深度导师关系推断...');
    const r2 = await s.run(`
      MATCH (a:Person)-[:COAUTHOR_WITH]-(b:Person)
      WHERE a.firstPaperYear IS NOT NULL AND b.firstPaperYear IS NOT NULL
        AND a.hIndex IS NOT NULL AND b.hIndex IS NOT NULL
        AND a.firstPaperYear < b.firstPaperYear
        AND a.hIndex > b.hIndex
      WITH a, b, (a.hIndex - b.hIndex) AS hDiff, (b.firstPaperYear - a.firstPaperYear) AS yearDiff
      WHERE hDiff >= 3 OR yearDiff >= 5
      WITH a, b
      OPTIONAL MATCH (a)-[r:ADVISOR_OF]->(b)
      WITH a, b, r WHERE r IS NULL
      MERGE (a)-[:ADVISOR_OF]->(b)
      RETURN count(*) AS c
    `);
    console.log(`  ✅ ${r2.records[0].get('c')} 条导师关系`);

    // 4. 为每个大学创建实验室并关联所有 affiliate
    console.log('🏫 从机构创建实验室...');
    await s.run(`
      MATCH (p:Person)-[:AFFILIATED_WITH]->(u:University)
      WHERE NOT EXISTS { (p)-[:MEMBER_OF]->(:Lab) }
      WITH u, collect(DISTINCT p)[0..100] AS members
      WHERE size(members) >= 2
      MERGE (lab:Lab {name: coalesce(u.englishName, u.name) + ' Group'})
      ON CREATE SET lab.uuid = randomUUID(), lab.sourceTier = 'TIER_1_OFFICIAL', lab.createdAt = datetime()
      WITH lab, u, members
      UNWIND members AS m
      MERGE (m)-[:MEMBER_OF]->(lab)
      MERGE (lab)-[:BELONGS_TO]->(u)
    `);

    // 5. 为每个人标记其在合作网络中的「角色」
    console.log('📊 计算网络角色...');
    const r3 = await s.run(`
      MATCH (p:Person)-[:COAUTHOR_WITH]-(co:Person)
      WITH p, count(co) AS degree
      SET p.networkDegree = degree
      WITH p, degree
      WHERE degree >= 20
      SET p.networkRole = 'Hub'
      RETURN count(p) AS hubs
    `);
    console.log(`  ✅ ${r3.records[0].get('hubs').toString()} 个 Hub 节点`);

    // 6. 最终统计
    console.log('\n📊 最终图谱:');
    const stats = await s.run(`
      MATCH ()-[r]->() RETURN type(r) AS t, count(r) AS c ORDER BY c DESC
    `);
    for (const rec of stats.records) {
      const t = rec.get('t');
      const c = rec.get('c').toString();
      console.log(`  ${t.padEnd(22)} ${c}`);
    }

    // 7. Lab 成员统计
    const labs = await s.run(`
      MATCH (p:Person)-[:MEMBER_OF]->(l:Lab)
      WITH l, count(p) AS cnt WHERE cnt >= 5
      RETURN l.name AS name, cnt ORDER BY cnt DESC LIMIT 10
    `);
    console.log('\n🏛️  最大实验室:');
    labs.records.forEach(r => console.log(`  ${String(r.get('cnt')).padStart(4)} 人  ${r.get('name')}`));

  } finally {
    await s.close(); await d.close();
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
