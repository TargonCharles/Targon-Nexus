// 爬取 Stanford Faculty → 提取人名 → 写入 Neo4j
const { chromium } = require('playwright');

// neo4j-driver is in API's node_modules
const neo4jPath = require('path').resolve(__dirname, '../api/node_modules/neo4j-driver');
const neo4j = require(neo4jPath);
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function crawl(url) {
  console.log('Crawling:', url);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Title:', await page.title());

    const text = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,header,noscript').forEach(el => el.remove());
      return (document.querySelector('main,article,.content,#content') || document.body)
        .innerText?.trim()?.substring(0, 15000) || '';
    });
    console.log('Content:', text.length, 'chars');

    // 提取 Prof. First Last 或 First Last, Title
    const names = new Set();
    for (const m of text.matchAll(/(?:Prof\.?|Professor|Dr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g)) {
      const n = m[1].trim();
      if (n.length > 5 && n.length < 60) names.add(n);
    }
    for (const m of text.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),\s*(?:Professor|PhD|Associate|Assistant|Chair|Lecturer|Faculty)/g)) {
      names.add(m[1].trim());
    }

    const emails = [...text.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/g)].map(m => m[1]);

    console.log('Extracted names:', [...names].join(', '));

    const session = driver.session();
    // 清理之前的脏数据 (name=null 或 太短)
    await session.run("MATCH (n) WHERE n.englishName IS NULL DETACH DELETE n");

    let added = 0;

    for (const name of names) {
      const nameLower = name.toLowerCase().replace(/[^a-z]/g, '');
      const email = emails.find(e => {
        const user = e.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
        return nameLower.includes(user) || user.includes(nameLower);
      });

      try {
        const r = await session.run(
          `MERGE (p:Person {englishName: $name})
           ON CREATE SET p.uuid = randomUUID(), p.createdAt = datetime(),
             p.confidence = 0.7, p.sourceTier = 'TIER_1_OFFICIAL', p.sourceUrl = $url,
             p.email = $email
           ON MATCH SET p.updatedAt = datetime(), p.email = coalesce(p.email, $email)
           RETURN p.uuid, p.createdAt`,
          { name, email: email || null, url }
        );
        if (r.records.length > 0 && Date.now() - new Date(r.records[0].get('p.createdAt')).getTime() < 10000) {
          added++;
          console.log('  +', name, email ? '<'+email+'>' : '');
        }
      } catch(e) {}
    }

    // 机构关联
    const instName = url.includes('stanford') ? 'Stanford University' :
                     url.includes('mit.edu') ? 'MIT' : null;
    if (instName) {
      await session.run(
        `MATCH (p:Person) WHERE p.sourceUrl = $url AND p.createdAt >= datetime() - duration('PT5M')
         MERGE (u:University {englishName: $inst})
         ON CREATE SET u.uuid = randomUUID(), u.createdAt = datetime()
         MERGE (p)-[:AFFILIATED_WITH {confidence:0.7}]->(u)`,
        { url, inst: instName }
      );
    }

    await session.close();
    return added;
  } catch(e) {
    console.error('Error:', e.message);
    return 0;
  } finally {
    await page.close();
    await browser.close();
  }
}

async function main() {
  console.log('=== Targon Nexus 爬取测试 ===\n');

  let total = 0;
  total += await crawl('https://physics.stanford.edu/people/faculty');
  console.log('');
  total += await crawl('https://physics.mit.edu/faculty');

  const s = driver.session();
  const r = await s.run('MATCH (p:Person) RETURN count(p) AS c');
  const count = r.records[0].get('c').toNumber();
  await s.close();
  driver.close();

  console.log(`\n=== 完成! 新增 ${total} 人, 总计 ${count} 人 ===`);
  console.log('前端查看: http://localhost:3002/search?q=Stanford\n');
}

main().catch(async e => { console.error(e.message); driver.close(); process.exit(1); });
