// =============================================================================
// auto-build.ts — 自动化图谱构建
//   1. 爬取所有有主页URL的人物页面，提取结构化信息
//   2. 从合作者网络推断导师/学生关系
//   3. 从论文数据生成职业履历
//   4. 关联合作者到同一实验室
//   5. 关联研究方向
// =============================================================================
import 'dotenv/config';

const neo4j = require('neo4j-driver');

async function getSession() {
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password'),
  );
  return { session: driver.session(), driver };
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'TargonNexus/1.0 (auto-build)' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ').trim();
  } catch { return null; }
}

function extractProfile(text: string): Record<string, any> {
  const props: Record<string, any> = {};

  // 职位
  const posMatch = text.match(/(?:研究员|教授|博士生导师|博士后|PI|Group Leader|Principal Investigator)[^，。]{0,30}/);
  if (posMatch) props.currentStatus = posMatch[0];

  // 论文引用
  const paperMatch = text.match(/(?:发表|已发表|已发表学术)?论文\s*(\d+)\s*(?:余)?篇/);
  if (paperMatch) props.paperCount = parseInt(paperMatch[1]);
  const citeMatch = text.match(/(?:被引|引用)\s*(\d+)\s*(?:余)?次/);
  if (citeMatch) props.citationCount = parseInt(citeMatch[1]);

  // 机构
  const instMatch = text.match(/(?:中国科学院|清华大学|北京大学|复旦大学|浙江大学|南京大学|中国科学技术大学|上海交通大学|华中科技大学|武汉大学|中山大学|南开大学|天津大学|哈尔滨工业大学)[^\s，。]{0,20}/);
  if (instMatch) props.affiliation = instMatch[0];

  return props;
}

async function crawlPeople(session: any) {
  console.log('\n🔍 Phase 1: 爬取人物主页...');

  const r = await session.run(`
    MATCH (p:Person)
    WHERE p.homepage IS NOT NULL
      AND NOT p.homepage CONTAINS 'semanticscholar.org'
      AND (p.lastCrawled IS NULL OR p.lastCrawled < datetime() - duration({days: 30}))
    RETURN p.uuid AS uuid, p.englishName AS name, p.homepage AS url
    LIMIT 30
  `);

  let crawled = 0;
  for (const record of r.records) {
    const uuid = record.get('uuid');
    const name = record.get('name');
    const url = record.get('url');
    if (!url?.startsWith('http')) continue;

    console.log(`  🌐 ${name}: ${url.substring(0,60)}...`);
    const text = await fetchText(url);
    if (!text) { console.log(`    ❌ 无法访问`); continue; }

    const props = extractProfile(text);
    if (Object.keys(props).length === 0) { console.log(`    ⚠️ 无结构化数据`); continue; }

    const setClauses: string[] = [];
    const params: any = { uuid };
    if (props.currentStatus) { setClauses.push('p.currentStatus = $st'); params.st = props.currentStatus; }
    if (props.paperCount) { setClauses.push('p.paperCount = $pc'); params.pc = props.paperCount; }
    if (props.citationCount) { setClauses.push('p.citationCount = $cc'); params.cc = props.citationCount; }
    setClauses.push('p.lastCrawled = datetime()');

    await session.run(`MATCH (p:Person {uuid: $uuid}) SET ${setClauses.join(', ')}`, params);
    console.log(`    ✅ position=${props.currentStatus || '?'} papers=${props.paperCount || '?'} citations=${props.citationCount || '?'}`);
    crawled++;
    await new Promise(r => setTimeout(r, 2000)); // polite delay
  }
  console.log(`  📊 爬取: ${crawled}/${r.records.length} 成功`);
}

async function inferAdvisors(session: any) {
  console.log('\n🧬 Phase 2: 导师关系推断...');

  // 低门槛推断: hIndex 更高 + 更多论文
  const r1 = await session.run(`
    MATCH (a:Person)-[:COAUTHOR_WITH]-(b:Person)
    WHERE a.hIndex IS NOT NULL AND b.hIndex IS NOT NULL
      AND a.hIndex > b.hIndex
      AND a.paperCount IS NOT NULL AND b.paperCount IS NOT NULL
      AND a.paperCount > b.paperCount
    WITH a, b
    OPTIONAL MATCH (a)-[r:ADVISOR_OF]->(b)
    WITH a, b, r WHERE r IS NULL
    MERGE (a)-[:ADVISOR_OF]->(b)
    RETURN count(*) AS c
  `);
  console.log(`  ✅ ${r1.records[0].get('c')} 条导师关系`);
}

async function linkLabs(session: any) {
  console.log('\n🏛️ Phase 3: 实验室成员关联...');

  const r1 = await session.run(`
    MATCH (p1:Person)-[:MEMBER_OF]->(lab:Lab),
          (p1)-[:COAUTHOR_WITH]-(p2:Person)
    WHERE NOT EXISTS { (p2)-[:MEMBER_OF]->(:Lab) }
    WITH p2, lab LIMIT 500
    MERGE (p2)-[:MEMBER_OF]->(lab)
    RETURN count(*) AS c
  `);
  console.log(`  ✅ ${r1.records[0].get('c')} 合作者加入实验室`);

  // 关联到大学
  const r2 = await session.run(`
    MATCH (p:Person)-[:MEMBER_OF]->(lab:Lab)
    WHERE NOT EXISTS { (lab)-[:BELONGS_TO]->(:University) }
    OPTIONAL MATCH (p)-[:AFFILIATED_WITH]->(u:University)
    WITH lab, u WHERE u IS NOT NULL
    MERGE (lab)-[:BELONGS_TO]->(u)
    RETURN count(*) AS c
  `);
  console.log(`  ✅ ${r2.records[0].get('c')} 实验室关联大学`);
}

async function generateTimelines(session: any) {
  console.log('\n📅 Phase 4: 职业履历...');

  // 从论文年份
  await session.run(`
    MATCH (p:Person)-[:AUTHORED]->(paper:Paper)
    WHERE paper.year IS NOT NULL AND p.firstPaperYear IS NULL
    WITH p, min(paper.year) AS first, max(paper.year) AS last
    SET p.firstPaperYear = first, p.lastPaperYear = last
  `);

  // 从大学归属
  await session.run(`
    MATCH (p:Person)-[:AFFILIATED_WITH]->(u:University)
    WHERE NOT EXISTS { (p)-[:HAS_EVENT]->(:Event {type: 'affiliation'}) }
    WITH p, u
    MERGE (e:Event {person: p.uuid, type: 'affiliation', institution: coalesce(u.englishName, u.name)})
    ON CREATE SET e.uuid = randomUUID(),
                  e.description = '任职于 ' + coalesce(u.englishName, u.name),
                  e.startYear = coalesce(toString(p.firstPaperYear), ''),
                  e.createdAt = datetime()
    MERGE (p)-[:HAS_EVENT]->(e)
  `);

  const r = await session.run(`
    MATCH (p:Person) WHERE p.firstPaperYear IS NOT NULL
    RETURN count(p) AS c
  `);
  console.log(`  ✅ ${r.records[0].get('c')} 人有论文时间线`);
}

async function linkDirections(session: any) {
  console.log('\n🔬 Phase 5: 研究方向关联...');

  await session.run(`
    MATCH (p:Person)
    WHERE p.researchInterests IS NOT NULL
    WITH p, p.researchInterests AS interests
    UNWIND interests AS kw
    WITH p, trim(kw, ' "\\'') AS keyword
    WHERE keyword <> '' AND size(keyword) > 2
    MERGE (rd:ResearchDirection {name: keyword})
    ON CREATE SET rd.uuid = randomUUID(), rd.sourceTier = 'TIER_3_WEB', rd.createdAt = datetime()
    MERGE (p)-[:RESEARCHES_ON]->(rd)
  `);

  const r = await session.run(`MATCH ()-[r:RESEARCHES_ON]->() RETURN count(r) AS c`);
  console.log(`  ✅ ${r.records[0].get('c')} 研究方向关联`);
}

async function showStats(session: any) {
  console.log('\n📊 最终图谱统计:');
  const r = await session.run(`
    MATCH ()-[r]->()
    RETURN type(r) AS type, count(r) AS cnt ORDER BY cnt DESC
  `);
  for (const rec of r.records) {
    const type = rec.get('type');
    const cnt = rec.get('cnt');
    const bar = '█'.repeat(Math.min(50, Math.floor(cnt.toNumber() / 500)));
    console.log(`  ${type.padEnd(20)} ${cnt.toString().padStart(6)} ${bar}`);
  }
}

async function main() {
  const { session, driver } = await getSession();
  try {
    await crawlPeople(session);
    await inferAdvisors(session);
    await linkLabs(session);
    await generateTimelines(session);
    await linkDirections(session);
    await showStats(session);
    console.log('\n✅ 自动化构建完成！刷新浏览器查看效果。');
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);
