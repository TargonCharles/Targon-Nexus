// =============================================================================
// Targon Nexus — 自动发现爬虫
// 从 arXiv / Semantic Scholar API 自动发现新的 ARPES 研究者、实验室、论文
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';

// — arXiv API 配置 —
const ARXIV_API = 'https://export.arxiv.org/api/query';

// ARPES 核心搜索关键词
const ARPES_QUERIES = [
  'angle-resolved photoemission',
  'ARPES spectroscopy',
  'topological insulator ARPES',
  'high-Tc superconductor ARPES',
  'iron-based superconductor ARPES',
  'kagome metal ARPES',
  'spin-resolved ARPES',
  'time-resolved ARPES',
  'Weyl semimetal ARPES',
  'Dirac semimetal ARPES',
  'cuprate superconductor Fermi surface',
  'quantum materials photoemission',
  'strongly correlated ARPES',
  '2D materials ARPES',
  'charge density wave ARPES',
  'topological superconductor ARPES',
  'nickelate superconductor',
  'moiré material ARPES',
  'nano ARPES',
  'laser ARPES',
];

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  doi: string;
  category: string;
}

interface DiscoveredPerson {
  name: string;
  source: string;
  sourceUrl: string;
  affiliation?: string;
  paperCount: number;
  confidence: number;
}

interface DiscoveredLab {
  name: string;
  institution: string;
  source: string;
  sourceUrl: string;
  keywords: string[];
  confidence: number;
}

interface DiscoveredPaper {
  doi: string;
  arxivId: string;
  title: string;
  authors: string[];
  year: number;
  category: string;
  source: string;
}

async function searchArxiv(query: string, maxResults: number = 30): Promise<ArxivEntry[]> {
  const url = `${ARXIV_API}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=relevance&sortOrder=descending`;

  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'TargonNexus-Discovery/1.0' } });
    if (!resp.ok) return [];
    const xml = await resp.text();

    // 简易 XML 解析（不带依赖）
    const entries: ArxivEntry[] = [];
    const entryBlocks = xml.split('<entry>').slice(1);

    for (const block of entryBlocks) {
      const idMatch = block.match(/<id>(?:.*\/abs\/)?([^<]+)<\/id>/);
      const titleMatch = block.match(/<title>([^<]+)<\/title>/);
      const summaryMatch = block.match(/<summary>([^<]+)<\/summary>/);
      const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
      const doiMatch = block.match(/<arxiv:doi>([^<]+)<\/arxiv:doi>/);
      const catMatch = block.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);
      const authorMatches = block.match(/<name>([^<]+)<\/name>/g);

      if (titleMatch) {
        entries.push({
          id: idMatch?.[1] || '',
          title: titleMatch[1].replace(/\s+/g, ' ').trim(),
          summary: (summaryMatch?.[1] || '').replace(/\s+/g, ' ').trim(),
          authors: authorMatches?.map((m) => m.replace(/<[^>]+>/g, '').trim()) || [],
          published: publishedMatch?.[1] || '',
          doi: doiMatch?.[1] || '',
          category: catMatch?.[1] || 'cond-mat',
        });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

function extractPeople(entries: ArxivEntry[]): DiscoveredPerson[] {
  const map = new Map<string, DiscoveredPerson>();

  for (const entry of entries) {
    for (const author of entry.authors) {
      const key = author.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          name: author,
          source: 'arxiv',
          sourceUrl: `https://arxiv.org/abs/${entry.id}`,
          paperCount: 1,
          confidence: 0.5,
        });
      } else {
        const existing = map.get(key)!;
        existing.paperCount++;
        existing.confidence = Math.min(0.8, existing.confidence + 0.05);
      }
    }
  }

  // 只保留出现≥2次的作者
  return Array.from(map.values()).filter((p) => p.paperCount >= 2);
}

function extractPapers(entries: ArxivEntry[]): DiscoveredPaper[] {
  return entries.map((e) => ({
    doi: e.doi || `arxiv:${e.id}`,
    arxivId: e.id,
    title: e.title,
    authors: e.authors,
    year: parseInt(e.published.substring(0, 4), 10) || new Date().getFullYear(),
    category: e.category,
    source: 'arxiv',
  }));
}

function writeDiscoveredCSV(
  outputDir: string,
  people: DiscoveredPerson[],
  papers: DiscoveredPaper[],
): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 写人物 CSV
  if (people.length > 0) {
    const peoplePath = path.join(outputDir, 'discovered-people.csv');
    const header = 'name,source,sourceUrl,paperCount,confidence';
    const rows = people.map((p) => `"${p.name}","${p.source}","${p.sourceUrl}",${p.paperCount},${p.confidence.toFixed(2)}`);
    fs.writeFileSync(peoplePath, `${header}\n${rows.join('\n')}`, 'utf-8');
    console.log(`  📄 发现人物: ${people.length} → ${peoplePath}`);
  }

  // 写论文 CSV
  if (papers.length > 0) {
    const papersPath = path.join(outputDir, 'discovered-papers.csv');
    const header = 'doi,arxivId,title,authors,year,category,source';
    const rows = papers.map((p) => `"${p.doi}","${p.arxivId}","${p.title}","${p.authors.join('; ')}",${p.year},"${p.category}","${p.source}"`);
    fs.writeFileSync(papersPath, `${header}\n${rows.join('\n')}`, 'utf-8');
    console.log(`  📄 发现论文: ${papers.length} → ${papersPath}`);
  }
}

// — 主入口 —
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Targon Nexus — 自动发现爬虫                         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const outputDir = path.resolve(__dirname, '../datasets/discovered');
  const allPeople: DiscoveredPerson[] = [];
  const allPapers: DiscoveredPaper[] = [];

  const queryLimit = parseInt(process.env.DISCOVERY_QUERY_COUNT || '5', 10);
  const queries = ARPES_QUERIES.slice(0, queryLimit);

  console.log(`  🔍 搜索 ${queries.length} 个 ARPES 关键词...\n`);

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    console.log(`  [${i + 1}/${queries.length}] "${query}"`);

    const entries = await searchArxiv(query, 20);
    console.log(`    → ${entries.length} 篇论文`);

    const people = extractPeople(entries);
    const papers = extractPapers(entries);

    allPeople.push(...people);
    allPapers.push(...papers);

    // ArXiv rate limit: polite delay
    if (i < queries.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // 去重
  const uniquePeople = new Map<string, DiscoveredPerson>();
  for (const p of allPeople) {
    const key = p.name.toLowerCase();
    if (!uniquePeople.has(key)) {
      uniquePeople.set(key, p);
    } else {
      const existing = uniquePeople.get(key)!;
      existing.paperCount += p.paperCount;
      existing.confidence = Math.min(0.9, existing.confidence + 0.1);
    }
  }

  const uniquePapers = new Map<string, DiscoveredPaper>();
  for (const p of allPapers) {
    if (!uniquePapers.has(p.doi)) {
      uniquePapers.set(p.doi, p);
    }
  }

  const peopleList = Array.from(uniquePeople.values())
    .filter((p) => p.paperCount >= 2)
    .sort((a, b) => b.paperCount - a.paperCount);

  const papersList = Array.from(uniquePapers.values());

  console.log(`\n  📊 总计发现:`);
  console.log(`    人物: ${peopleList.length}`);
  console.log(`    论文: ${papersList.length}`);

  if (peopleList.length > 0 || papersList.length > 0) {
    writeDiscoveredCSV(outputDir, peopleList, papersList);
    console.log(`\n  ✅ 结果已保存到 ${outputDir}/`);
  }

  // 打印 Top-10 人物
  if (peopleList.length > 0) {
    console.log('\n  🏆 Top-10 高频作者:');
    peopleList.slice(0, 10).forEach((p, i) => {
      console.log(`    ${i + 1}. ${p.name} (${p.paperCount} papers, confidence ${p.confidence.toFixed(2)})`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🎉 自动发现完成!');
  console.log('  💡 审核后使用 scripts/import-seed.ts 导入人物');
  console.log('  💡 使用 scripts/import-papers.ts 导入论文');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('发现失败:', err);
  process.exit(1);
});
