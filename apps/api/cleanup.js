const neo4j = require('neo4j-driver');
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function clean() {
  const s = driver.session();

  // 显示脏数据
  const r = await s.run(
    "MATCH (p:Person) WHERE p.englishName =~ '.*@.*' OR size(p.englishName) < 5 RETURN count(p) AS c"
  );
  const bad = r.records[0].get('c').toNumber();
  console.log('脏数据(邮箱名/过短):', bad);

  // 删除脏数据
  await s.run(
    "MATCH (p:Person) WHERE p.englishName =~ '.*@.*' OR size(p.englishName) < 5 DETACH DELETE p"
  );

  const r2 = await s.run("MATCH (p:Person) RETURN count(p) AS c");
  console.log('清理后人数:', r2.records[0].get('c').toNumber());

  // 把那些有真实邮箱但没有显示名的条目，用邮箱前缀转大写作为显示名
  await s.run(`
    MATCH (p:Person)
    WHERE p.email IS NOT NULL AND p.englishName IS NOT NULL
      AND p.englishName =~ '.*@.*'
    SET p.englishName = apoc.text.capitalize(split(p.email, '@')[0])
  `);

  await s.close();
  console.log('Cleanup done');
}

clean().then(() => driver.close()).catch(e => { console.error(e.message); driver.close(); });
