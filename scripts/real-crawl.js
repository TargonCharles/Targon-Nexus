// 快速真实爬取 — 从 API 目录运行(有 neo4j-driver)，Playwright 从 crawler node_modules 加载
const neo4j = require('neo4j-driver');
const { chromium } = require('../../apps/crawler/node_modules/playwright');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
const session = driver.session();
let newPeople = 0;

async function crawl(url, inst) {
  console.log(`\n爬取: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    console.log(`  标题: ${title}`);

    // 提取人员和邮箱
    const data = await page.evaluate(() => {
      const people = [];
      // mailto 链接是最直接的学术人员信号
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        const email = a.href.replace('mailto:', '');
        const name = a.textContent.trim() || email.split('@')[0].replace(/[._]/g, ' ');
        if (name.length > 2 && name.length < 80 && email.length > 5 && email.includes('.')) {
          people.push({ name, email });
        }
      });
      // 也尝试从 heading 中提取
      if (people.length === 0) {
        document.querySelectorAll('h2,h3,h4').forEach(h => {
          const t = h.textContent.trim();
          if (t.length > 3 && t.length < 80 && !t.includes('https://')) {
            people.push({ name: t, email: null });
          }
        });
      }
      return { people: people.slice(0, 30), bodyLen: (document.body?.innerText || '').length };
    });

    console.log(`  发现 ${data.people.length} 人 (页面${data.bodyLen}字)`);

    for (const p of data.people) {
      if (!p.name || p.name.length < 3) continue;
      try {
        const r = await session.run(
          `MERGE (per:Person {englishName: $name})
           ON CREATE SET per.uuid = randomUUID(), per.createdAt = datetime(),
                         per.confidence = 0.75, per.sourceTier = 'TIER_1_OFFICIAL',
                         per.sourceUrl = $url, per.email = $email
           ON MATCH SET per.updatedAt = datetime(),
                       per.email = coalesce(per.email, $email),
                       per.sourceUrl = coalesce(per.sourceUrl, $url)
           RETURN per.uuid, per.createdAt`,
          { name: p.name, email: p.email, url }
        );
        if (r.records[0]) {
          const created = r.records[0].get('per.createdAt');
          if (created && Date.now() - new Date(created).getTime() < 10000) {
            newPeople++;
            console.log(`  ✅ ${p.name}${p.email ? ' <'+p.email+'>' : ''}`);
            // 链接到机构
            if (inst) {
              await session.run(
                `MATCH (p:Person {englishName: $name})
                 MERGE (u:University {englishName: $inst})
                 ON CREATE SET u.uuid = randomUUID(), u.createdAt = datetime()
                 MERGE (p)-[:AFFILIATED_WITH {confidence:0.7,sourceUrl:$url}]->(u)`,
                { name: p.name, inst, url }
              );
            }
          }
        }
      } catch(e) { /* skip */ }
    }
    return data.people.length;
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
    return 0;
  } finally {
    await page.close();
    await browser.close();
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Targon Nexus 真实爬取');
  console.log('═══════════════════════════════════════');

  const tasks = [
    { url: 'https://physics.stanford.edu/people/faculty', inst: 'Stanford University' },
    { url: 'https://phas.ubc.ca/faculty', inst: 'University of British Columbia' },
    { url: 'https://physics.mit.edu/faculty', inst: 'MIT' },
  ];

  let totalFound = 0;
  for (const t of tasks) {
    totalFound += await crawl(t.url, t.inst);
    await new Promise(r => setTimeout(r, 5000)); // 礼貌延迟
  }

  const cnt = await session.run('MATCH (p:Person) RETURN count(p) AS c');
  const total = cnt.records[0]?.get('c')?.toNumber() || 0;

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  完成! 本轮新增人员: ${newPeople}`);
  console.log(`  图谱总人数: ${total}`);
  console.log(`═══════════════════════════════════════`);

  await session.close();
  await driver.close();
}

main().catch(async e => { console.error(e.message); await session.close(); await driver.close(); });
