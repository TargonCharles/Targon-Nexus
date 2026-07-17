// =============================================================================
// crawl-person.ts — 爬取个人主页，提取结构化信息并写入 Neo4j
// 用法: npx ts-node --project apps/api/tsconfig.json scripts/crawl-person.ts <URL>
// =============================================================================
import 'dotenv/config';

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'TargonNexus/1.0 (crawler)' },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await resp.text();
  // 去掉 script/style 标签
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractInfo(text: string, personUuid: string) {
  // 提取姓名
  const nameMatch = text.match(/([^\s]{2,4}),\s*男[,，]\s*(\d{4})年(\d{1,2})月生/);
  const chineseName = nameMatch?.[1] || '';
  const birthYear = nameMatch?.[2] || '';
  const birthMonth = nameMatch?.[3] || '';

  // 提取教育经历
  const education: { year: number; description: string }[] = [];
  const eduPattern = /(\d{4})年([^。，]+?(?:学士|硕士|博士)[^。，]*)/g;
  let m: RegExpExecArray | null;
  while ((m = eduPattern.exec(text)) !== null) {
    education.push({ year: parseInt(m[1]), description: m[2].trim() });
  }

  // 提取工作经历
  const career: { start: string; end: string; description: string }[] = [];
  const careerPattern = /(\d{4}[-–—]\d{4}年[^。，]+)/g;
  while ((m = careerPattern.exec(text)) !== null) {
    const part = m[1];
    const rangeMatch = part.match(/(\d{4})[-–—](\d{4})年(.+)/);
    if (rangeMatch) {
      career.push({ start: rangeMatch[1], end: rangeMatch[2], description: rangeMatch[3].trim() });
    }
  }

  // 提取当前职位
  const positionMatch = text.match(/现为([^。，]+)/);
  const currentPosition = positionMatch?.[1]?.trim() || '';

  // 提取院士信息
  const academician = text.includes('中国科学院院士');
  const academicianYear = text.match(/(\d{4})年当选中国科学院院?士/)?.[1] || '';

  // 提取论文统计
  const paperStats = text.match(/(?:已发表学术)?论文(\d+)余篇/);
  const citationStats = text.match(/(?:被引|引用)(\d+)次以上/);
  const paperCount = paperStats?.[1] || '';
  const citationCount = citationStats?.[1] || '';

  // 提取顶级期刊统计
  const scienceMatch = text.match(/Science\s*(\d+)\s*篇/);
  const natureMatch = text.match(/Nature\s*(\d+)\s*篇/);
  const prlMatch = text.match(/Physical Review Letters\s*(\d+)\s*篇/);
  const natureSubMatch = text.match(/Nature (?:Materials|Physics)[^0-9]*(\d+)\s*篇/);
  const ncMatch = text.match(/Nature Communications\s*(\d+)\s*篇/);

  // 提取奖项
  const awards: string[] = [];
  const awardPattern = /(\d{4})年[^，。]*?奖[^，。]*/g;
  while ((m = awardPattern.exec(text)) !== null) {
    if (!m[0].includes('资助')) awards.push(m[0]);
  }

  // 提取研究领域
  const researchAreas: string[] = [];
  const researchSection = text.match(/研究材料体系[：:]*\s*(.+?)(?:研究的|$)/);
  if (researchSection) {
    const areas = researchSection[1].match(/\((\d+)\)[.、]\s*([^;；]+)/g);
    if (areas) areas.forEach(a => researchAreas.push(a.replace(/\(\d+\)[.、]\s*/, '').trim()));
  }

  return {
    uuid: personUuid,
    properties: {
      chineseName,
      birthDate: birthYear ? `${birthYear}-${birthMonth.padStart(2, '0')}` : undefined,
      currentStatus: currentPosition,
      description: currentPosition,
      paperCount: parseInt(paperCount) || undefined,
      citationCount: parseInt(citationCount) || undefined,
      academician,
      academicianYear,
      awards: awards.slice(0, 10),
      topJournals: {
        science: parseInt(scienceMatch?.[1] || '0'),
        nature: parseInt(natureMatch?.[1] || '0'),
        prl: parseInt(prlMatch?.[1] || '0'),
        natureComms: parseInt(ncMatch?.[1] || '0'),
      },
      researchAreas,
      bio: text.substring(0, 2000),
    },
    education,
    career,
  };
}

async function saveToNeo4j(personUuid: string, data: any) {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || 'password'),
  );
  const session = driver.session();

  try {
    const { properties, education, career } = data;

    // 更新 Person 属性
    console.log('📝 更新人物属性...');
    const setClauses: string[] = [];
    const params: any = { uuid: personUuid };

    if (properties.chineseName) { setClauses.push('p.chineseName = $cn'); params.cn = properties.chineseName; }
    if (properties.birthDate) { setClauses.push('p.birthDate = $bd'); params.bd = properties.birthDate; }
    if (properties.currentStatus) { setClauses.push('p.currentStatus = $st'); params.st = properties.currentStatus; }
    if (properties.description) { setClauses.push('p.description = $desc'); params.desc = properties.description; }
    if (properties.paperCount) { setClauses.push('p.paperCount = $pc'); params.pc = properties.paperCount; }
    if (properties.citationCount) { setClauses.push('p.citationCount = $cc'); params.cc = properties.citationCount; }
    if (properties.awards?.length) { setClauses.push('p.awards = $aw'); params.aw = properties.awards; }
    if (properties.researchAreas?.length) { setClauses.push('p.researchInterests = $ri'); params.ri = properties.researchAreas; }
    setClauses.push('p.lastEnriched = datetime()');
    setClauses.push('p.dataSource = $ds');
    params.ds = 'web-crawl';

    if (setClauses.length > 0) {
      await session.run(`MATCH (p:Person {uuid: $uuid}) SET ${setClauses.join(', ')}`, params);
    }

    // 创建教育 Timeline 事件
    console.log('🎓 创建教育履历...');
    for (const edu of education) {
      await session.run(`
        MATCH (p:Person {uuid: $uuid})
        MERGE (e:Event {person: $uuid, type: 'education', description: $desc})
        ON CREATE SET e.uuid = randomUUID(), e.startYear = toString($year),
                      e.createdAt = datetime()
        MERGE (p)-[:HAS_EVENT]->(e)
      `, { uuid: personUuid, desc: edu.description, year: edu.year });
      console.log(`  ${edu.year}: ${edu.description}`);
    }

    // 创建工作 Timeline 事件
    console.log('💼 创建职业履历...');
    for (const job of career) {
      await session.run(`
        MATCH (p:Person {uuid: $uuid})
        MERGE (e:Event {person: $uuid, type: 'career', description: $desc, startYear: $start})
        ON CREATE SET e.uuid = randomUUID(), e.endYear = $end, e.createdAt = datetime()
        MERGE (p)-[:HAS_EVENT]->(e)
      `, { uuid: personUuid, desc: job.description, start: job.start, end: job.end });
      console.log(`  ${job.start}-${job.end}: ${job.description}`);
    }

    // 创建获奖 Timeline 事件
    if (properties.awards?.length) {
      console.log('🏆 创建获奖记录...');
      for (const award of properties.awards) {
        await session.run(`
          MATCH (p:Person {uuid: $uuid})
          MERGE (e:Event {person: $uuid, type: 'award', description: $award})
          ON CREATE SET e.uuid = randomUUID(), e.createdAt = datetime()
          MERGE (p)-[:HAS_EVENT]->(e)
        `, { uuid: personUuid, award });
      }
    }

    console.log('\n✅ 数据已写入 Neo4j');
    console.log(`   教育经历: ${education.length} 条`);
    console.log(`   工作经历: ${career.length} 条`);
    console.log(`   获奖记录: ${properties.awards?.length || 0} 条`);
    console.log(`   论文数: ${properties.paperCount}`);
    console.log(`   引用数: ${properties.citationCount}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('用法: npx ts-node scripts/crawl-person.ts <URL> <person-uuid>');
    console.log('示例: npx ts-node scripts/crawl-person.ts https://laser-arpes.iphy.ac.cn/CN/member/XJZhou.html 770e8400-e29b-41d4-a716-446655440001');
    process.exit(1);
  }

  const url = args[0];
  const uuid = args[1];

  console.log(`🔍 爬取: ${url}`);
  const text = await fetchText(url);
  console.log(`📄 获取 ${text.length} 字符`);

  const data = extractInfo(text, uuid);
  console.log(JSON.stringify(data.properties, null, 2));

  await saveToNeo4j(uuid, data);
}

main().catch(console.error);
