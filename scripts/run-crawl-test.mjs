// 一体化爬虫测试 — enqueue + 直接调用 crawler (不走 worker/BullMQ)
import { createRequire } from 'module';
const req = createRequire(import.meta.url);

// 直接加载 crawler 的 runCrawl
const crawlerPath = '../apps/crawler/src/index.ts';
// 动态加载 crawler 模块的 runCrawl
const tsx = await import('tsx/esm/api/index.js').catch(() => null);
if (!tsx) { console.log('Loading via tsx require...'); }

// 更简单的方式: 直接用 Playwright (已验证可用)
const { chromium } = await import('playwright');
const neo4j = req('neo4j-driver');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

async function crawlAndExtract(url) {
  console.log(`\n📄 爬取: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    console.log(`   标题: ${title}`);

    // 提取页面文本
    const text = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,header,noscript,.sidebar,#sidebar')
        .forEach(el => el.remove());
      return (document.querySelector('main,article,.content,#content,.main-content') || document.body)
        .innerText?.trim()?.substring(0, 12000) || '';
    });
    console.log(`   内容: ${text.length} 字`);

    // 提取人名 (Prof./Dr. 模式 + 邮箱模式)
    const names = new Set();
    for (const m of text.matchAll(/(?:Prof\.?|Professor|Dr\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g)) {
      names.add(m[1].trim());
    }
    for (const m of text.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),\s*(?:Professor|PhD|Associate|Assistant|Chair|Lecturer|Faculty)/g)) {
      names.add(m[1].trim());
    }

    const emails = [...text.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,})/g)].map(m => m[1]);

    console.log(`   提取到 ${names.size} 人, ${emails.length} 邮箱`);

    const session = driver.session();
    let added = 0;

    for (const name of names) {
      const nameParts = name.toLowerCase().split(' ');
      const email = emails.find(e => nameParts.some(p => e.toLowerCase().includes(p.slice(0,4))));

      try {
        const r = await session.run(
          `MERGE (p:Person {englishName: $name})
           ON CREATE SET p.uuid = randomUUID(), p.createdAt = datetime(),
                         p.confidence = 0.7, p.sourceTier = 'TIER_1_OFFICIAL',
                         p.sourceUrl = $url, p.email = $email
           ON MATCH SET p.updatedAt = datetime(), p.email = coalesce(p.email, $email)
           RETURN p.uuid, p.createdAt`,
          { name, email: email || null, url }
        );
        if (r.records[0] && Date.now() - new Date(r.records[0].get('p.createdAt')).getTime() < 5000) {
          added++;
          console.log(`   ✅ ${name}${email ? ' <'+email+'>' : ''}`);

          // 关联机构
          const domain = new URL(url).hostname;
          const inst = domain.includes('stanford') ? 'Stanford University' :
                       domain.includes('mit.edu') ? 'MIT' :
                       domain.includes('berkeley') ? 'UC Berkeley' :
                       domain.includes('ubc') ? 'University of British Columbia' : null;
          if (inst) {
            await session.run(
              `MATCH (p:Person {englishName: $name})
               MERGE (u:University {englishName: $inst})
               ON CREATE SET u.uuid = randomUUID(), u.createdAt = datetime()
               MERGE (p)-[:AFFILIATED_WITH {confidence:0.7}]->(u)`,
              { name, inst }
            );
          }
        }
      } catch(e) { /* skip duplicate */ }
    }
    await session.close();
    return added;
  } catch(e) {
    console.log(`   ❌ ${e.message}`);
    return 0;
  } finally {
    await page.close();
    await browser.close();
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Targon Nexus 爬取测试');
  console.log('═══════════════════════════════════════');

  let total = 0;
  total += await crawlAndExtract('https://physics.stanford.edu/people/faculty');
  await new Promise(r => setTimeout(r, 5000));
  total += await crawlAndExtract('https://physics.mit.edu/faculty');

  const r = (await driver.session().run('MATCH (p:Person) RETURN count(p) AS c')).records[0].get('c').toNumber();
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  新增: ${total} 人, 图谱总人数: ${r}`);
  console.log(`  查看: http://localhost:3002/search?q=Stanford`);
  console.log(`═══════════════════════════════════════`);

  await driver.session().close();
  driver.close();
  process.exit(0);
}

main().catch(async e => { console.error(e.message); driver.close(); process.exit(1); });
