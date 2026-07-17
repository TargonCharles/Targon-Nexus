// 智能爬取 — Playwright + LLM提取 + Neo4j写入
const neo4j = require('neo4j-driver');
const { chromium } = require('../crawler/node_modules/playwright');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

// 简单正则提取人名 (教授/博士/研究员模式)
function extractNames(text) {
  const names = new Set();
  // 模式1: "Prof. First Last" 或 "Professor First Last"
  for (const m of text.matchAll(/(?:Prof\.?|Professor|Dr\.?|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g)) {
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (name.length > 5 && name.length < 60) names.add(name);
  }
  // 模式2: "First Last, Title" (逗号后跟 title)
  for (const m of text.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),\s*(?:Professor|PhD|MD|Associate|Assistant|Chair)/g)) {
    const name = m[1].trim();
    if (name.length > 5 && name.length < 60) names.add(name);
  }
  // 模式3: 邮箱 → 取@前部分转人名
  for (const m of text.matchAll(/([a-z]+(?:\.[a-z]+)?)@([a-z0-9-]+\.(?:edu|ac\.[a-z]{2}))/gi)) {
    const parts = m[1].split('.');
    const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    if (name.length > 5 && name.length < 40) names.add(name);
  }
  return [...names].slice(0, 25);
}

async function crawl(url, instName) {
  console.log(`\n爬取: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let found = 0;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`  标题: ${await page.title()}`);

    // 提取主内容区文本
    const text = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,header,noscript,.sidebar,.nav').forEach(e => e.remove());
      return (document.querySelector('main,article,.content,#content,.main-content') || document.body)
        .innerText?.trim()?.substring(0, 10000) || '';
    });

    // 提取人名
    const names = extractNames(text);
    console.log(`  提取到 ${names.length} 个人名 (${text.length}字)`);

    // 同时提取邮箱用于匹配
    const emails = [...text.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map(m => m[1]);

    // 写入Neo4j
    const session = driver.session();
    for (const name of names) {
      try {
        // 尝试匹配邮箱
        const nameParts = name.toLowerCase().split(' ');
        const matchedEmail = emails.find(e => {
          const user = e.split('@')[0].toLowerCase();
          return nameParts.some(p => user.includes(p.toLowerCase().replace(/[^a-z]/g, '')));
        });

        const r = await session.run(
          `MERGE (p:Person {englishName: $name})
           ON CREATE SET p.uuid = randomUUID(), p.createdAt = datetime(),
                         p.confidence = 0.7, p.sourceTier = 'TIER_1_OFFICIAL',
                         p.sourceUrl = $url, p.email = $email
           ON MATCH SET p.updatedAt = datetime(),
                       p.email = coalesce(p.email, $email)
           RETURN p.uuid, p.createdAt`,
          { name, email: matchedEmail || null, url }
        );

        if (r.records[0]) {
          const created = r.records[0].get('p.createdAt');
          if (created && Date.now() - new Date(created).getTime() < 10000) {
            found++;
            console.log(`  ✅ ${name}${matchedEmail ? ' ('+matchedEmail+')' : ''}`);
            // 关联机构
            if (instName) {
              await session.run(
                `MATCH (p:Person {englishName: $name})
                 MERGE (u:University {englishName: $inst})
                 ON CREATE SET u.uuid = randomUUID(), u.createdAt = datetime()
                 MERGE (p)-[:AFFILIATED_WITH {confidence:0.7}]->(u)`,
                { name, inst: instName }
              );
            }
          }
        }
      } catch(e) { /* skip */ }
    }
    await session.close();
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
  } finally {
    await page.close();
    await browser.close();
  }
  return found;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Targon Nexus 智能爬取 (正则+模式)');
  console.log('═══════════════════════════════════════');

  let total = 0;
  // 只爬 Stanford（之前成功了）
  total += await crawl('https://physics.stanford.edu/people/faculty', 'Stanford University');
  // MIT 之前成功了
  total += await crawl('https://physics.mit.edu/faculty', 'MIT');

  const s = driver.session();
  const r = await s.run('MATCH (p:Person) RETURN count(p) AS c');
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  新增: ${total} 人, 图谱总人数: ${r.records[0].get('c').toNumber()}`);
  console.log(`═══════════════════════════════════════`);
  await s.close();
  driver.close();
}

main().catch(async e => { console.error(e.message); driver.close(); process.exit(1); });
