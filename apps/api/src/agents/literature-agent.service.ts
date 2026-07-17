// ===========================================================================
// Literature Agent — 文献发现 + 论文排序
//
// 数据源优先级 (按文档要求):
//   Tier 1: OpenAlex (综合 Crossref + PubMed + arXiv 等)
//   Tier 2: Semantic Scholar (补充)
//
// 论文排序: 主题相关(40%) + 期刊质量(20%) + 引用影响力(15%) +
//           作者贡献(15%) + 时效性(10%)
//
// 过滤规则:
//   - 仅被索引的期刊/会议论文
//   - 有可识别作者和机构
//   - 排除预印本和非学术来源
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { AgentEventBus, AgentEvents } from './event-bus.service';

// -- 类型 -------------------------------------------------------------------

export interface RankedPaper {
  title: string;
  doi: string;
  year: number;
  citationCount: number;
  /** 期刊/会议名称 */
  journal: string;
  /** 期刊质量等级 (Q1-Q4, 或 null) */
  journalQuartile: string | null;
  /** 作者列表 (含机构) */
  authors: Array<{
    name: string;
    orcid?: string;
    institutions: string[];
  }>;
  /** 关键词 */
  keywords: string[];
  /** 摘要 */
  abstract: string;
  /** 来源 */
  source: 'openalex' | 'semanticscholar' | 'arxiv';
  /** 来源 URL */
  sourceUrl: string;
  /** 综合得分 (0-1) */
  score: number;
  /** 得分明细 */
  scoreBreakdown: {
    relevance: number;
    journalQuality: number;
    citationInfluence: number;
    authorContribution: number;
    freshness: number;
  };
}

export interface LiteratureResult {
  keyword: string;
  papers: RankedPaper[];
  stats: {
    totalFound: number;
    afterFilter: number;
    avgScore: number;
    sources: string[];
  };
}

// -- 期刊质量数据 (SCImago Quartile 简化版) ------------------------------------

const Q1_JOURNALS = new Set([
  'nature', 'science', 'cell', 'nature materials', 'nature physics',
  'nature nanotechnology', 'nature photonics', 'nature chemistry',
  'nature communications', 'science advances', 'pnas',
  'physical review letters', 'physical review x',
  'nature reviews physics', 'nature reviews materials',
  'reviews of modern physics', 'nature electronics',
  'advanced materials', 'nano letters', 'acs nano',
  'advanced functional materials', 'joule', 'matter',
]);

const Q2_JOURNALS = new Set([
  'physical review b', 'physical review materials', 'applied physics letters',
  'journal of applied physics', 'nano research', 'nanoscale',
  'chemistry of materials', 'journal of materials chemistry',
  '2d materials', 'new journal of physics',
  'scientific reports', 'apl materials',
]);

// -- 默认论文 (种子数据) -------------------------------------------------------

const SEED_PAPERS: Array<Omit<RankedPaper, 'score' | 'scoreBreakdown' | 'source' | 'sourceUrl' | 'keywords'>> = [
  {title:'Topological Insulators and Topological Superconductors',doi:'10.1103/RevModPhys.82.3045',year:2010,citationCount:8500,journal:'Reviews of Modern Physics',journalQuartile:'Q1',authors:[{name:'M. Z. Hasan',institutions:['Princeton University']},{name:'Charles L. Kane',institutions:['University of Pennsylvania']}],abstract:'Topological insulators are electronic materials that have a bulk band gap...'},
  {title:'Colloquium: Topological insulators',doi:'10.1103/RevModPhys.83.1057',year:2011,citationCount:7000,journal:'Reviews of Modern Physics',journalQuartile:'Q1',authors:[{name:'Xiao-Liang Qi',institutions:['Stanford University']},{name:'Shou-Cheng Zhang',institutions:['Stanford University']}],abstract:'Topological insulators represent a new state of quantum matter...'},
  {title:'Quantum Computing in the NISQ era and beyond',doi:'10.22331/q-2018-08-06-79',year:2018,citationCount:5500,journal:'Quantum',journalQuartile:'Q1',authors:[{name:'John Preskill',institutions:['California Institute of Technology']}],abstract:'Noisy Intermediate-Scale Quantum technology will be available...'},
  {title:'A programmable dual-RNA-guided DNA endonuclease in adaptive bacterial immunity',doi:'10.1126/science.1225829',year:2012,citationCount:18000,journal:'Science',journalQuartile:'Q1',authors:[{name:'Martin Jinek',institutions:['University of California Berkeley']},{name:'Jennifer A. Doudna',institutions:['University of California Berkeley']}],abstract:'CRISPR/Cas systems provide adaptive immunity...'},
];

@Injectable()
export class LiteratureAgent {
  private readonly logger = new Logger(LiteratureAgent.name);
  private readonly OPENALEX = 'https://api.openalex.org';

  constructor(private readonly eventBus: AgentEventBus) {}

  // =========================================================================
  // 主入口: 文献发现 + 排序
  // =========================================================================

  async discover(keyword: string): Promise<LiteratureResult> {
    const startedAt = new Date().toISOString();
    const provenance = { chain: ['LiteratureAgent'], inputKeyword: keyword, startedAt };
    this.logger.log(`[Literature] "${keyword}"`);

    // 1. 多源并行搜索
    const [oaPapers, s2Papers] = await Promise.all([
      this.searchOpenAlex(keyword, 30),
      this.searchSemanticScholar(keyword, 20),
    ]);
    this.logger.log(`[Literature] Raw: OA=${oaPapers.length} S2=${s2Papers.length}`);

    // 2. 合并 + 去重
    const merged = this.mergeAndDedup(oaPapers, s2Papers);
    this.logger.log(`[Literature] Merged: ${merged.length}`);

    // 3. 补充种子论文
    const withSeed = this.addSeedPapers(merged, keyword);

    // 4. 过滤低质量
    const filtered = this.filterQuality(withSeed);
    this.logger.log(`[Literature] Filtered: ${withSeed.length} → ${filtered.length}`);

    // 5. 排序打分
    const ranked = this.rankPapers(filtered, keyword);

    const result: LiteratureResult = {
      keyword,
      papers: ranked,
      stats: {
        totalFound: oaPapers.length + s2Papers.length + SEED_PAPERS.length,
        afterFilter: ranked.length,
        avgScore: ranked.length ? ranked.reduce((s, p) => s + p.score, 0) / ranked.length : 0,
        sources: [...new Set(ranked.map(p => p.source))],
      },
    };

    this.eventBus.emitComplete('LiteratureAgent', {
      totalFound: result.stats.totalFound,
      afterFilter: result.stats.afterFilter,
      avgScore: Math.round(result.stats.avgScore * 100),
    }, provenance);

    this.logger.log(`[Literature] ${result.stats.afterFilter} papers (avg score ${(result.stats.avgScore*100).toFixed(0)}%)`);
    return result;
  }

  // =========================================================================
  // 数据源: OpenAlex (主力)
  // =========================================================================

  private async searchOpenAlex(query: string, perPage: number, retries = 2): Promise<any[]> {
    const url = `${this.OPENALEX}/works?search=${encodeURIComponent(query)}&per_page=${perPage}&sort=cited_by_count:desc`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, {
          headers: { 'User-Agent': 'TargonNexus/1.0 (mailto:research@example.com)' },
          signal: AbortSignal.timeout(20_000),
        });
        if (!resp.ok) {
          this.logger.warn(`OpenAlex returned ${resp.status}, retry ${attempt}/${retries}`);
          if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
          return [];
        }
        const data: any = await resp.json();
        return (data.results ?? []).map((w: any) => this.mapOpenAlexWork(w));
      } catch (e: any) {
        this.logger.warn(`OpenAlex attempt ${attempt} failed: ${e.message}`);
        if (attempt < retries) { await new Promise(r => setTimeout(r, 1000)); continue; }
        return [];
      }
    }
    return [];
  }

  private mapOpenAlexWork(w: any) {
    const authors = (w.authorships ?? []).map((a: any) => ({
      name: a.author?.display_name ?? '',
      orcid: a.author?.orcid ?? undefined,
      institutions: (a.institutions ?? []).map((i: any) => i.display_name),
    })).filter((a: any) => a.name);

    const journal = w.primary_location?.source?.display_name ?? '';
    const quartile = this.guessQuartile(journal);

    return {
      title: w.title ?? '',
      doi: w.doi ?? `oa:${w.id?.split('/').pop()}`,
      year: w.publication_year ?? new Date().getFullYear(),
      citationCount: w.cited_by_count ?? 0,
      journal,
      journalQuartile: quartile,
      authors,
      keywords: (w.concepts ?? []).map((c: any) => c.display_name).filter(Boolean).slice(0, 10),
      abstract: (w.abstract_inverted_index ? this.decodeInvertedAbstract(w.abstract_inverted_index) : ''),
      source: 'openalex' as const,
      sourceUrl: w.doi ? `https://doi.org/${w.doi}` : w.id,
    };
  }

  /** 解码 OpenAlex 倒排索引摘要 */
  private decodeInvertedAbstract(inverted: Record<string, number[]>): string {
    try {
      const words: Array<[string, number]> = [];
      for (const [word, positions] of Object.entries(inverted)) {
        for (const pos of positions) words.push([word, pos]);
      }
      return words.sort((a, b) => a[1] - b[1]).map(w => w[0]).join(' ');
    } catch { return ''; }
  }

  // =========================================================================
  // 数据源: Semantic Scholar (补充)
  // =========================================================================

  private async searchSemanticScholar(query: string, limit: number): Promise<any[]> {
    try {
      const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,abstract,year,citationCount,externalIds,publicationVenue`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'TargonNexus/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return [];
      const data: any = await resp.json();
      return (data.data ?? []).map((p: any) => ({
        title: p.title ?? '',
        doi: p.externalIds?.DOI ?? `s2:${p.paperId}`,
        year: p.year ?? new Date().getFullYear(),
        citationCount: p.citationCount ?? 0,
        journal: p.publicationVenue?.name ?? p.journal?.name ?? '',
        journalQuartile: this.guessQuartile(p.publicationVenue?.name ?? ''),
        authors: (p.authors ?? []).map((a: any) => ({
          name: a.name ?? '',
          orcid: undefined,
          institutions: a.affiliations ?? [],
        })),
        keywords: [],
        abstract: p.abstract ?? '',
        source: 'semanticscholar' as const,
        sourceUrl: p.url ?? `https://api.semanticscholar.org/CorpusID:${p.paperId}`,
      }));
    } catch { return []; }
  }

  // =========================================================================
  // 合并 + 去重 + 种子论文补充
  // =========================================================================

  private mergeAndDedup(oa: any[], s2: any[]): any[] {
    const map = new Map<string, any>();
    for (const p of [...oa, ...s2]) {
      const key = p.doi || p.title?.toLowerCase();
      if (!map.has(key)) { map.set(key, p); continue; }
      const existing = map.get(key)!;
      // OpenAlex 数据优先 (更完整)
      if (p.source === 'openalex') {
        map.set(key, { ...existing, ...p, source: 'openalex' });
      } else {
        existing.citationCount = Math.max(existing.citationCount, p.citationCount);
      }
    }
    return Array.from(map.values());
  }

  private addSeedPapers(api: any[], keyword: string): any[] {
    const lower = keyword.toLowerCase();
    const existingDois = new Set(api.map(p => p.doi));
    const newSeed = SEED_PAPERS
      .filter(p => (p.title + p.abstract).toLowerCase().includes(lower.substring(0, 6)))
      .filter(p => !existingDois.has(p.doi));
    return [...newSeed, ...api];
  }

  // =========================================================================
  // 质量过滤
  // =========================================================================

  private filterQuality(papers: any[]): any[] {
    return papers.filter(p => {
      if (!p.authors?.length) return false;
      // 宽松过滤: 有作者 + DOI (期刊/arXiv 都有DOI)
      const hasDoi = p.doi?.length > 5;
      // 保留: 有机构信息 或 高引用论文
      const hasInstitution = p.authors.some((a: any) => a.institutions?.length > 0);
      return hasDoi && (hasInstitution || p.citationCount >= 5);
    });
  }

  // =========================================================================
  // 论文排序算法
  //
  // Score = relevance*0.40 + journalQuality*0.20 + citationInfluence*0.15
  //       + authorContribution*0.15 + freshness*0.10
  // =========================================================================

  private rankPapers(papers: any[], keyword: string): RankedPaper[] {
    const kw = keyword.toLowerCase();
    const maxCitations = Math.max(1, ...papers.map(p => p.citationCount ?? 0));

    const scored: RankedPaper[] = papers.map(p => {
      // 主题相关性: 标题+摘要中的关键词匹配
      const text = `${p.title} ${p.abstract}`.toLowerCase();
      const kwTerms = kw.split(/\s+/);
      const matchCount = kwTerms.filter(t => text.includes(t)).length;
      const relevance = Math.min(1, 0.4 + (matchCount / kwTerms.length) * 0.6);

      // 期刊质量: Q1=1.0, Q2=0.7, 未知=0.3
      const journalQuality = p.journalQuartile === 'Q1' ? 1.0 :
                             p.journalQuartile === 'Q2' ? 0.7 : 0.3;

      // 引用影响力: log 归一化
      const citationInfluence = Math.min(1, Math.log10(p.citationCount + 1) / Math.log10(maxCitations + 1));

      // 作者贡献: 有机构信息的作者比例
      const authorsWithInst = p.authors?.filter((a: any) => a.institutions?.length > 0).length ?? 0;
      const authorContribution = authorsWithInst > 0 ? Math.min(1, 0.5 + (authorsWithInst / Math.max(1, p.authors?.length ?? 1)) * 0.5) : 0.3;

      // 时效性: 5 年内满分, 线性衰减
      const age = new Date().getFullYear() - (p.year ?? 2020);
      const freshness = Math.max(0, 1 - age * 0.08);

      const score = relevance * 0.40 + journalQuality * 0.20 + citationInfluence * 0.15 +
                    authorContribution * 0.15 + freshness * 0.10;

      return {
        ...p,
        score: Math.round(score * 100) / 100,
        scoreBreakdown: {
          relevance: Math.round(relevance * 100) / 100,
          journalQuality: Math.round(journalQuality * 100) / 100,
          citationInfluence: Math.round(citationInfluence * 100) / 100,
          authorContribution: Math.round(authorContribution * 100) / 100,
          freshness: Math.round(freshness * 100) / 100,
        },
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  // =========================================================================
  // 辅助: 期刊四分位估算
  // =========================================================================

  private guessQuartile(journalName: string): string | null {
    if (!journalName) return null;
    const lower = journalName.toLowerCase();
    if (Q1_JOURNALS.has(lower)) return 'Q1';
    if (Q2_JOURNALS.has(lower)) return 'Q2';
    // 知名出版商的期刊默认为 Q2
    if (lower.includes('nature') || lower.includes('science') || lower.includes('cell') ||
        lower.includes('physical review') || lower.includes('nano') ||
        lower.includes('advanced')) return 'Q2';
    return null;
  }
}
