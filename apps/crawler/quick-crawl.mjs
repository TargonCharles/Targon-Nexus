// 快速爬取脚本 — 直接用 Playwright 抓取学术页面
// 绕过 Crawlee API 兼容问题，立即产出结果
import { chromium } from 'playwright';
import neo4j from 'neo4j-driver';
import * as fs from 'fs';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
const session = driver.session();

// 要爬取的页面列表
const TARGETS = [
  // 斯坦福物理系 faculty
  { url: 'https://physics.stanford.edu/people/faculty', type: 'faculty-directory', tier: 'TIER_1_OFFICIAL' },
  // UBC 物理系 faculty
  { url: 'https://phas.ubc.ca/faculty', type: 'faculty-directory', tier: 'TIER_1_OFFICIAL' },
];

let totalNew = 0;

async function crawlPage(browser, { url, type, tier }) {
  console.log(`\n📄 爬取: ${url}`);
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    console.log(`   标题: ${title}`);

    // 提取文本内容和人员信息
    const extracted = await page.evaluate(() => {
      // 移除噪声元素
      document.querySelectorAll('script, style, nav, footer, noscript, header').forEach(el => el.remove());

      const people = [];
      // 尝试多种选择器查找人员
      const selectors = [
        '.views-row', '.person-card', '.faculty-member', '.profile',
        'article', '.node--type-person', '.people-list li', '.directory-item'
      ];

      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          const name = el.querySelector('h2, h3, h4, .name, .title')?.textContent?.trim();
          const emailEl = el.querySelector('a[href^="mailto:"]');
          const email = emailEl?.textContent?.trim() || emailEl?.href?.replace('mailto:', '');
          const link = el.querySelector('a[href]')?.href;
          if (name && name.length > 2 && name.length < 100) {
            people.push({ name, email: email || null, link: link || null });
          }
        });
        if (people.length > 0) break;
      }

      // Fallback: 提取所有 mailto 链接作为人员
      if (people.length === 0) {
        document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
          const email = a.href.replace('mailto:', '');
          const name = a.textContent?.trim() || email.split('@')[0].replace(/[._]/g, ' ');
          if (name.length > 2 && name.length < 100) {
            people.push({ name, email, link: null });
          }
        });
      }

      return {
        textContent: document.body?.innerText?.trim()?.substring(0, 5000) || '',
        people,
        links: Array.from(document.querySelectorAll('a[href^="mailto:"]'))
          .map(a => ({ email: a.href.replace('mailto:', ''), name: a.textContent?.trim() }))
      };
    });

    console.log(`   发现 ${extracted.people.length} 人, ${extracted.links.length} 个邮箱`);

    // 写入 Neo4j
    for (const person of extracted.people.slice(0, 20)) {
      const name = person.name.replace(/[^a-zA-ZÀ-ɏ\s\-\.]/g, '').trim();
      if (!name || name.length < 3) continue;

      try {
        // 从 URL 推断机构
        const domain = new URL(url).hostname;
        const instName = domain.includes('stanford') ? 'Stanford University' :
                         domain.includes('ubc') ? 'University of British Columbia' : domain;

        // 创建 Person 节点
        const result = await session.run(
          `MERGE (p:Person {englishName: $name})
           ON CREATE SET p.uuid = randomUUID(),
                         p.createdAt = datetime(),
                         p.confidence = 0.7,
                         p.sourceTier = $tier,
                         p.sourceUrl = $sourceUrl
           ON MATCH SET p.updatedAt = datetime(),
                       p.sourceTier = coalesce(p.sourceTier, $tier),
                       p.email = coalesce(p.email, $email),
                       p.sourceUrl = coalesce(p.sourceUrl, $sourceUrl)
           RETURN p.uuid, p.createdAt`,
          { name, email: person.email, tier, sourceUrl: url }
        );

        if (result.records.length > 0) {
          const created = result.records[0].get('p.createdAt');
          const isNew = created && (Date.now() - new Date(created).getTime()) < 60000;
          if (isNew) {
            totalNew++;
            console.log(`   ✅ 新增: ${name}${person.email ? ' (' + person.email + ')' : ''}`);

            // 链接到 University
            await session.run(
              `MATCH (p:Person {englishName: $name})
               MERGE (u:University {englishName: $instName})
               ON CREATE SET u.uuid = randomUUID(), u.createdAt = datetime()
               MERGE (p)-[:AFFILIATED_WITH {confidence: 0.7, sourceUrl: $url}]->(u)`,
              { name, instName, url }
            );
          }
        }
      } catch (e) {
        // Skip duplicates
      }
    }

  } catch (e) {
    console.error(`   ❌ 失败: ${e.message}`);
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  Targon Nexus 快速爬取');
  console.log('═══════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  console.log('浏览器已启动\n');

  for (const target of TARGETS) {
    await crawlPage(browser, target);
    // 礼貌延迟
    await new Promise(r => setTimeout(r, 3000));
  }

  await browser.close();

  // 统计结果
  const counts = await session.run(
    `MATCH (p:Person) RETURN count(p) AS persons`
  );
  const newCount = counts.records[0]?.get('persons')?.toNumber() || 0;

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  爬取完成!`);
  console.log(`  本次新增人员: ${totalNew}`);
  console.log(`  图谱总人数:   ${newCount}`);
  console.log(`═══════════════════════════════════════`);

  await session.close();
  await driver.close();
}

main().catch(async (e) => {
  console.error('Fatal:', e.message);
  await session.close();
  await driver.close();
  process.exit(1);
});
