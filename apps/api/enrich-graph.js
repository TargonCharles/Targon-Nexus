// 丰富图谱关系: 家谱推断 + 职业轨迹 + TimelineEvent
const neo4j = require('neo4j-driver');
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function main() {
  const s = driver.session();
  console.log('1. 从同实验室推断学术家谱...');

  // 同一个Lab的PI和成员之间建立 ADVISOR_OF/STUDENT_OF 关系
  // PI (MEMBER_OF role=pi) → 其他成员 = ADVISOR_OF
  const piResult = await s.run(`
    MATCH (pi:Person)-[r1:MEMBER_OF {role:'pi'}]->(l:Lab)
    MATCH (stu:Person)-[r2:MEMBER_OF]->(l)
    WHERE pi <> stu AND NOT (pi)-[:ADVISOR_OF]->(stu)
    MERGE (pi)-[:ADVISOR_OF {confidence:0.6, source:'inferred_lab_pi', createdAt:datetime()}]->(stu)
    RETURN count(*) AS c
  `);
  console.log('  ADVISOR_OF (PI→成员):', piResult.records[0].get('c').toNumber());

  // 反向: STUDENT_OF
  await s.run(`
    MATCH (pi)-[r:ADVISOR_OF]->(stu)
    WHERE NOT (stu)-[:STUDENT_OF]->(pi)
    MERGE (stu)-[:STUDENT_OF {confidence:r.confidence, source:'inferred_lab_pi', createdAt:datetime()}]->(pi)
  `);

  console.log('2. 创建职业轨迹...');
  // 从 AFFILIATED_WITH + MEMBER_OF 生成 TimelineEvent
  await s.run(`
    MATCH (p:Person)-[r:AFFILIATED_WITH]->(u:University)
    WHERE NOT EXISTS { (p)-[:HAS_CAREER_EVENT]->(:TimelineEvent {eventType:'affiliation'}) }
    CREATE (e:TimelineEvent {
      uuid: randomUUID(), eventType: 'affiliation',
      description: 'Affiliated with ' + coalesce(u.englishName, u.name),
      institution: coalesce(u.englishName, u.name),
      createdAt: datetime(), confidence: 0.7
    })
    CREATE (p)-[:HAS_CAREER_EVENT]->(e)
  `);

  await s.run(`
    MATCH (p:Person)-[r:MEMBER_OF]->(l:Lab)
    WHERE NOT EXISTS { (p)-[:HAS_CAREER_EVENT]->(:TimelineEvent {eventType:'lab_membership'}) }
    CREATE (e:TimelineEvent {
      uuid: randomUUID(), eventType: 'lab_membership',
      description: 'Member of ' + coalesce(l.englishName, l.name),
      institution: coalesce(l.englishName, l.name),
      position: coalesce(r.role, 'member'),
      createdAt: datetime(), confidence: 0.8
    })
    CREATE (p)-[:HAS_CAREER_EVENT]->(e)
  `);

  // 统计
  const stats = await s.run(`
    MATCH ()-[r:ADVISOR_OF]->() RETURN 'Advisor links' AS label, count(r) AS count UNION ALL
    MATCH ()-[r:STUDENT_OF]->() RETURN 'Student links', count(r) UNION ALL
    MATCH (e:TimelineEvent) RETURN 'Timeline events', count(e)
  `);
  console.log('\n图谱丰富结果:');
  stats.records.forEach(r => console.log(`  ${r.get('label')}: ${r.get('count')}`));

  await s.close();
  driver.close();
  console.log('Done! 刷新人物详情页查看效果。');
}

main().catch(e => { console.error(e.message); driver.close(); });
