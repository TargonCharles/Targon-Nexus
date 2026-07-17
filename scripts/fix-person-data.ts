// =============================================================================
// fix-person-data.ts — 为指定人物生成职业履历 + 清理关系图谱
// 用法: npx ts-node --project apps/api/tsconfig.json scripts/fix-person-data.ts
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
    // 1. 为所有有论文的人生成职业时间线事件
    console.log('📅 生成职业履历...');
    const r1 = await session.run(`
      MATCH (p:Person)-[:AUTHORED]->(paper:Paper)
      WHERE paper.year IS NOT NULL
      WITH p, paper
      ORDER BY paper.year
      WITH p, collect(DISTINCT {year: paper.year, journal: paper.journal, title: paper.title}) AS papers
      WHERE size(papers) > 0
      WITH p, papers[0].year AS firstYear, papers[-1].year AS lastYear, papers
      SET p.firstPaperYear = firstYear,
          p.lastPaperYear = lastYear,
          p.activeYears = lastYear - firstYear
      // 创建首篇论文事件
      FOREACH (_ IN CASE WHEN p.firstPaperYear IS NOT NULL THEN [1] ELSE [] END |
        MERGE (e:Event {person: p.uuid, type: 'first_paper'})
        ON CREATE SET e.uuid = randomUUID(),
                      e.description = '发表首篇论文',
                      e.startYear = toString(p.firstPaperYear),
                      e.createdAt = datetime()
        MERGE (p)-[:HAS_EVENT]->(e)
      )
      // 创建最近论文事件
      FOREACH (_ IN CASE WHEN p.lastPaperYear IS NOT NULL AND p.lastPaperYear > p.firstPaperYear THEN [1] ELSE [] END |
        MERGE (e2:Event {person: p.uuid, type: 'latest_paper'})
        ON CREATE SET e2.uuid = randomUUID(),
                       e2.description = '最新论文发表',
                       e2.startYear = toString(p.lastPaperYear),
                       e2.createdAt = datetime()
        MERGE (p)-[:HAS_EVENT]->(e2)
      )
      RETURN count(p) AS updated
    `);
    console.log(`  ✅ 论文时间线: ${r1.records[0].get('updated')} 人`);

    // 2. 从大学归属创建履历事件
    console.log('🏛️ 生成机构履历...');
    const r2 = await session.run(`
      MATCH (p:Person)-[:AFFILIATED_WITH]->(u:University)
      WHERE NOT EXISTS { (p)-[:HAS_EVENT]->(:Event {type: 'affiliation'}) }
      WITH p, u
      MERGE (e:Event {person: p.uuid, institution: coalesce(u.englishName, u.name), type: 'affiliation'})
      ON CREATE SET e.uuid = randomUUID(),
                    e.description = '任职于 ' + coalesce(u.englishName, u.name),
                    e.institution = coalesce(u.englishName, u.name),
                    e.startYear = coalesce(toString(p.firstPaperYear), 'unknown'),
                    e.createdAt = datetime()
      MERGE (p)-[:HAS_EVENT]->(e)
      RETURN count(e) AS created
    `);
    console.log(`  ✅ 机构事件: ${r2.records[0].get('created')} 条`);

    // 3. 从 ORCID/主页创建履历事件
    console.log('🔗 生成履历标记...');
    const r3 = await session.run(`
      MATCH (p:Person)
      WHERE p.homepage IS NOT NULL
        AND NOT EXISTS { (p)-[:HAS_EVENT]->(:Event {type: 'homepage'}) }
      MERGE (e:Event {person: p.uuid, type: 'homepage'})
      ON CREATE SET e.uuid = randomUUID(),
                    e.description = '主页: ' + p.homepage,
                    e.createdAt = datetime()
      MERGE (p)-[:HAS_EVENT]->(e)
      RETURN count(e) AS c
    `);
    console.log(`  ✅ 主页事件: ${r3.records[0].get('c')} 条`);

    // 4. 为没有导师的人标记顶级合作者（可能的导师）
    console.log('🧬 推断潜在导师...');
    const r4 = await session.run(`
      MATCH (p:Person)-[:COAUTHOR_WITH]-(co:Person)
      WHERE p.advisorCount IS NULL OR p.advisorCount = 0
        AND co.hIndex IS NOT NULL AND co.hIndex > p.hIndex
      WITH p, co
      ORDER BY co.hIndex DESC
      WITH p, collect(co.englishName)[0..3] AS potentialAdvisors
      SET p.potentialAdvisors = potentialAdvisors
      RETURN count(p) AS c
    `);
    console.log(`  ✅ 潜在导师: ${r4.records[0].get('c')} 人`);

    console.log('\n✅ 完成！刷新人物页面即可看到职业履历。');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
