const neo4j = require('neo4j-driver');
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function main() {
  const s = driver.session();

  // 查看脏数据量
  let r = await s.run(
    "MATCH (p:Person) WHERE p.englishName =~ '.*@.*' OR size(p.englishName) < 5 RETURN count(p) AS c, labels(p) AS labels"
  );
  console.log('名称像邮箱或短于5字符的记录:', r.records[0]?.get('c').toNumber());

  // 删除这些脏数据
  await s.run(
    "MATCH (p:Person) WHERE p.englishName =~ '.*@.*' AND p.createdAt >= datetime() - duration('PT1H') DETACH DELETE p"
  );
  console.log('已清理最近一小时内导入的脏数据');

  // 统计当前人数
  r = await s.run("MATCH (p:Person) RETURN count(p) AS c");
  console.log('当前总人数:', r.records[0].get('c').toNumber());

  // 显示一些有真实名称的人员
  r = await s.run(
    "MATCH (p:Person) WHERE p.englishName IS NOT NULL AND size(p.englishName) >= 5 " +
    "AND NOT p.englishName =~ '.*@.*' RETURN p.englishName AS name, p.email AS email LIMIT 10"
  );
  console.log('\n有效人员样本:');
  r.records.forEach(x => console.log(' ', x.get('name'), x.get('email') ? '<'+x.get('email')+'>' : ''));

  await s.close();
  driver.close();
}
main().catch(e => { console.error(e.message); driver.close(); });
