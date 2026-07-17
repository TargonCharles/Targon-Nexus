// =============================================================================
// SourceScorerService — 信源质量评分
//
// 按 URL 域名自动分级，结合时效性、信息完整度计算综合质量分。
// 支持期刊质量分级 (SCI/SSCI/A&HCI/CSSCI/CSCD/北大核心)。
// 纯函数实现，不依赖 NestJS DI，可供 crawler/worker/extractor 复用。
// =============================================================================

import type { SourceTier, SourceQuality } from '@arp/types';

// ---------------------------------------------------------------------------
// 期刊质量分级
// ---------------------------------------------------------------------------

/** 国际期刊质量等级 */
export type JournalQuality = 'SCI' | 'SSCI' | 'AHCI' | 'ESCI' | 'unknown';

/** 国内期刊质量等级 */
export type ChineseJournalQuality = 'CSSCI' | 'CSCD' | '北大核心' | '统计源' | 'unknown';

/** 期刊质量分类结果 */
export interface JournalClassification {
  international: JournalQuality;
  chinese: ChineseJournalQuality;
  isCore: boolean; // 是否为核心期刊 (国际或国内)
}

// --- SCI/SSCI/A&HCI 出版商域名 (论文出现在这些域名下大概率是SCI期刊) ---
const JOURNAL_PUBLISHER_DOMAINS: Record<string, JournalQuality> = {
  'nature.com': 'SCI',
  'science.org': 'SCI',
  'sciencemag.org': 'SCI',
  'aps.org': 'SCI',
  'journals.aps.org': 'SCI',
  'aip.org': 'SCI',
  'pubs.aip.org': 'SCI',
  'iop.org': 'SCI',
  'iopscience.iop.org': 'SCI',
  'springer.com': 'SCI',
  'link.springer.com': 'SCI',
  'elsevier.com': 'SCI',
  'sciencedirect.com': 'SCI',
  'wiley.com': 'SCI',
  'onlinelibrary.wiley.com': 'SCI',
  'tandfonline.com': 'SCI',
  'pnas.org': 'SCI',
  'cell.com': 'SCI',
  'cellpress.com': 'SCI',
  'acm.org': 'SCI',
  'dl.acm.org': 'SCI',
  'ieee.org': 'SCI',
  'ieeexplore.ieee.org': 'SCI',
  'pubmed.ncbi.nlm.nih.gov': 'SCI',
  'thelancet.com': 'SCI',
  'nejm.org': 'SCI',
  'bmj.com': 'SCI',
  'jamanetwork.com': 'SCI',
  'oxfordjournals.org': 'SSCI',
  'cambridge.org': 'SSCI',
  'sagepub.com': 'SSCI',
  'emerald.com': 'SSCI',
  'jstor.org': 'AHCI',
  'taylorfrancis.com': 'AHCI',
  'degruyter.com': 'AHCI',
};

// --- 国内核心期刊域名 ---
const CHINESE_CORE_DOMAINS: Record<string, ChineseJournalQuality> = {
  'cnki.net': '北大核心',
  'cnki.com.cn': '北大核心',
  'wanfangdata.com.cn': 'CSCD',
  'cqvip.com': '北大核心',
  'cscijournals.org': 'CSSCI',
  'cssn.cn': 'CSSCI',
  'nssd.cn': 'CSSCI',
};

/**
 * 根据期刊名/域名/ISSN 分类期刊质量
 */
export function classifyJournal(
  journalName?: string,
  domain?: string,
  _issn?: string,
): JournalClassification {
  const result: JournalClassification = {
    international: 'unknown',
    chinese: 'unknown',
    isCore: false,
  };

  // 1. 从域名推断
  if (domain) {
    for (const [pubDomain, quality] of Object.entries(JOURNAL_PUBLISHER_DOMAINS)) {
      if (domain.includes(pubDomain)) {
        result.international = quality;
        result.isCore = true;
        break;
      }
    }
    if (!result.isCore) {
      for (const [cnDomain, quality] of Object.entries(CHINESE_CORE_DOMAINS)) {
        if (domain.includes(cnDomain)) {
          result.chinese = quality;
          result.isCore = true;
          break;
        }
      }
    }
  }

  // 2. 从期刊名推断 (常见 SCI 期刊关键词)
  if (!result.isCore && journalName) {
    const upper = journalName.toUpperCase();
    if (/nature|science|cell|lancet|physical review|phys\. rev\.|J\. Am\. Chem\. Soc|angewandte/i.test(upper)) {
      result.international = 'SCI';
      result.isCore = true;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// 域名 → 信源等级 映射表
// ---------------------------------------------------------------------------

/** 中国985/211/一本 及全球顶级大学 → TIER_1 */
const TIER_1_DOMAINS = new Set([
  // 中国 985
  'pku.edu.cn', 'tsinghua.edu.cn', 'fudan.edu.cn', 'sjtu.edu.cn', 'zju.edu.cn',
  'ustc.edu.cn', 'nju.edu.cn', 'ruc.edu.cn', 'bnu.edu.cn', 'buaa.edu.cn',
  'bit.edu.cn', 'cau.edu.cn', 'hit.edu.cn', 'xjtu.edu.cn', 'nwpu.edu.cn',
  'lzu.edu.cn', 'whu.edu.cn', 'hust.edu.cn', 'csu.edu.cn', 'nudt.edu.cn',
  'sysu.edu.cn', 'scut.edu.cn', 'scu.edu.cn', 'uestc.edu.cn', 'cqu.edu.cn',
  'sdu.edu.cn', 'ouc.edu.cn', 'xmu.edu.cn', 'seu.edu.cn', 'tongji.edu.cn',
  'ecnu.edu.cn', 'nankai.edu.cn', 'tju.edu.cn', 'dlut.edu.cn', 'neu.edu.cn',
  'jlu.edu.cn', 'nwafu.edu.cn', 'muc.edu.cn',
  // 中国 211 (代表性域名)
  'bjtu.edu.cn', 'bjut.edu.cn', 'ustb.edu.cn', 'buct.edu.cn', 'bupt.edu.cn',
  'bjfu.edu.cn', 'bucm.edu.cn', 'bfsu.edu.cn', 'cuc.edu.cn', 'cufe.edu.cn',
  'uibe.edu.cn', 'cupl.edu.cn', 'ncepu.edu.cn', 'cumtb.edu.cn', 'cup.edu.cn', 'cugb.edu.cn',
  'sufe.edu.cn', 'shisu.edu.cn', 'shu.edu.cn', 'dhu.edu.cn', 'ecust.edu.cn',
  'suda.edu.cn', 'nuaa.edu.cn', 'njust.edu.cn', 'cumt.edu.cn', 'hhu.edu.cn',
  'jiangnan.edu.cn', 'njau.edu.cn', 'cpu.edu.cn', 'njnu.edu.cn',
  'hfut.edu.cn', 'ahu.edu.cn', 'fzu.edu.cn', 'ncu.edu.cn', 'zzu.edu.cn',
  'whut.edu.cn', 'hzau.edu.cn', 'ccnu.edu.cn', 'zuel.edu.cn',
  'hnu.edu.cn', 'hunnu.edu.cn', 'jnu.edu.cn', 'scnu.edu.cn', 'gxu.edu.cn',
  'swjtu.edu.cn', 'swufe.edu.cn', 'swu.edu.cn', 'ynu.edu.cn', 'gzu.edu.cn',
  'nwu.edu.cn', 'xidian.edu.cn', 'chd.edu.cn', 'snnu.edu.cn',
  'xju.edu.cn', 'shzu.edu.cn', 'nxu.edu.cn', 'qhu.edu.cn', 'imu.edu.cn',
  'lnu.edu.cn', 'dlmu.edu.cn', 'nenu.edu.cn', 'nefu.edu.cn', 'neau.edu.cn',
  'hrbeu.edu.cn', 'ybu.edu.cn', 'hebut.edu.cn', 'tyut.edu.cn', 'hainanu.edu.cn',
  'utibet.edu.cn', 'upc.edu.cn', 'cug.edu.cn',
  // 港澳
  'hku.hk', 'cuhk.edu.hk', 'ust.hk', 'polyu.edu.hk', 'cityu.edu.hk',
  'um.edu.mo', 'must.edu.mo',
  // --- 中国权威学术数据源 ---
  // 万方《中国科技专家库》
  'wanfangdata.com.cn', 'wanfang.com.cn', 'wanfangdata.com',
  // 中国知网 CNKI
  'cnki.net', 'cnki.com.cn', 'ki.net',
  // 中国科学引文数据库 CSCD
  'sciencechina.cn', 'cscd.ac.cn',
  // 中国科学院机构知识库 IR Grid
  'irgrid.ac.cn', 'casirgrid.ac.cn',
  // 中国科学家在线 / iAuthor
  'iauthor.cn', 'iauthor.ac.cn', 'scholar.cn',
  // 全球顶级大学
  'stanford.edu', 'mit.edu', 'harvard.edu', 'berkeley.edu', 'caltech.edu',
  'princeton.edu', 'columbia.edu', 'uchicago.edu', 'yale.edu', 'cornell.edu',
  'ubc.ca', 'utoronto.ca', 'mcgill.ca',
  'cam.ac.uk', 'ox.ac.uk', 'imperial.ac.uk', 'ucl.ac.uk',
  'ethz.ch', 'epfl.ch',
  'tokyo.ac.jp', 'kyoto-u.ac.jp', 'tohoku.ac.jp', 'osaka-u.ac.jp',
  'snu.ac.kr', 'postech.ac.kr', 'kaist.ac.kr',
  'mpg.de', 'fhi-berlin.mpg.de', 'cnrs.fr',
]);

/** 中科院研究所域名 → TIER_1 */
const CAS_DOMAINS = new Set([
  'iop.ac.cn', 'itp.ac.cn', 'ihep.ac.cn', 'imech.ac.cn', 'ioa.ac.cn',
  'iccas.ac.cn', 'ipe.ac.cn', 'igsnrr.ac.cn', 'igg.cas.cn', 'iap.ac.cn',
  'ioz.ac.cn', 'ibcas.ac.cn', 'im.ac.cn', 'ibp.ac.cn', 'genetics.ac.cn',
  'psych.ac.cn', 'sibcb.ac.cn', 'sibs.ac.cn', 'simm.ac.cn', 'ion.ac.cn',
  'ict.ac.cn', 'iscas.ac.cn', 'ia.ac.cn', 'semi.ac.cn', 'ime.ac.cn',
  'iie.ac.cn', 'cnic.cn', 'csu.cas.cn', 'amss.ac.cn',
  'imr.ac.cn', 'sic.ac.cn', 'siom.ac.cn', 'nimte.ac.cn', 'sinano.ac.cn', 'siat.ac.cn',
  'iet.cn', 'iee.ac.cn', 'giec.ac.cn', 'rcees.ac.cn', 'qdio.ac.cn',
  'nao.cas.cn', 'pmo.ac.cn', 'shao.ac.cn', 'nssc.ac.cn',
  'hf.cas.cn', 'ipp.cas.cn', 'issp.cas.cn', 'hmfl.cas.cn',
  'dicp.ac.cn', 'sxicc.ac.cn', 'sioc.ac.cn', 'fjirsm.ac.cn',
  'xjipc.cas.cn', 'itpcas.ac.cn', 'nigpas.cas.cn', 'ivpp.ac.cn',
  'ucas.ac.cn', 'shanghaitech.edu.cn', 'nanoctr.cn',
  'aircas.ac.cn',
]);

/** 学术出版物/预印本 → TIER_2 */
const TIER_2_DOMAINS = new Set([
  'arxiv.org', 'semanticscholar.org', 'api.semanticscholar.org',
  'crossref.org', 'api.crossref.org', 'doi.org',
  ...Object.keys(JOURNAL_PUBLISHER_DOMAINS),
  ...Object.keys(CHINESE_CORE_DOMAINS),
  'orcid.org', 'pub.orcid.org',
  'researchgate.net', 'academia.edu',
]);

// ---------------------------------------------------------------------------
// Tier 分类
// ---------------------------------------------------------------------------

/** 根据 URL 自动判定信源等级 */
export function classifyTier(url: string): SourceTier {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    // TIER_1: .edu / .ac 顶级域名
    if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk') ||
        hostname.endsWith('.ac.jp') || hostname.endsWith('.ac.cn') ||
        hostname.endsWith('.ac.kr') || hostname.endsWith('.edu.cn') ||
        hostname.endsWith('.edu.au') || hostname.endsWith('.edu.sg') ||
        hostname.endsWith('.edu.hk')) {
      return 'TIER_1_OFFICIAL';
    }

    // TIER_1: .gov (政府机构) / .cas.cn (中科院)
    if (hostname.endsWith('.gov') || hostname.endsWith('.gov.cn') || hostname.endsWith('.cas.cn')) {
      return 'TIER_1_OFFICIAL';
    }

    // TIER_1: 检查精确域名 (中国高校 + 全球顶级大学 + 中科院研究所)
    for (const domain of TIER_1_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return 'TIER_1_OFFICIAL';
      }
    }
    for (const domain of CAS_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return 'TIER_1_OFFICIAL';
      }
    }

    // TIER_2: 学术出版物/预印本/核心期刊平台
    for (const domain of TIER_2_DOMAINS) {
      if (hostname === domain || hostname.includes(domain)) {
        return 'TIER_2_ACADEMIC';
      }
    }

    // TIER_3: .org / 研究机构域名
    if (hostname.endsWith('.org') || hostname.includes('research') ||
        hostname.includes('lab') || hostname.includes('institute')) {
      return 'TIER_3_WEB';
    }

    return 'TIER_4_OTHER';
  } catch {
    return 'TIER_4_OTHER';
  }
}

// ---------------------------------------------------------------------------
// 时效性评分
// ---------------------------------------------------------------------------

/**
 * 计算时效性分数 (指数衰减)
 * - 30 天以内: 1.0
 * - 1 年: ~0.5
 * - 2 年以上: ~0.2
 */
export function scoreFreshness(
  lastModified?: string | null,
  pageDate?: string | null,
  crawledAt?: string | null,
): number {
  const now = Date.now();
  const dates: number[] = [];

  if (lastModified) { const d = new Date(lastModified).getTime(); if (!isNaN(d)) dates.push(d); }
  if (pageDate)     { const d = new Date(pageDate).getTime();     if (!isNaN(d)) dates.push(d); }
  if (crawledAt)    { const d = new Date(crawledAt).getTime();    if (!isNaN(d)) dates.push(d); }

  if (dates.length === 0) return 0.3; // 无日期信息 → 默认低分

  // 取最新日期
  const newest = Math.max(...dates);
  const daysSince = (now - newest) / (1000 * 60 * 60 * 24);

  // 指数衰减: score = exp(-days / 180)
  //   30天 → 0.85, 180天 → 0.37, 365天 → 0.13
  return Math.round(Math.exp(-daysSince / 180) * 100) / 100;
}

// ---------------------------------------------------------------------------
// 信息完整度评分
// ---------------------------------------------------------------------------

/**
 * 评估实体信息的完整度
 * - 有 name: +0.2
 * - 有 email: +0.2
 * - 有 ORCID: +0.2
 * - 有 institution/affiliation: +0.2
 * - 有 description: +0.1
 * - 有 homepage/URL: +0.1
 */
export function scoreCompleteness(entity: {
  name?: string;
  email?: string;
  orcid?: string;
  institution?: string;
  affiliations?: string[];
  description?: string;
  url?: string;
}): number {
  let score = 0;
  if (entity.name) score += 0.2;
  if (entity.email) score += 0.2;
  if (entity.orcid) score += 0.2;
  if (entity.institution || (entity.affiliations && entity.affiliations.length > 0)) score += 0.2;
  if (entity.description) score += 0.1;
  if (entity.url) score += 0.1;
  return Math.min(1, Math.round(score * 100) / 100);
}

// ---------------------------------------------------------------------------
// 综合质量评分
// ---------------------------------------------------------------------------

const BASE_SCORES: Record<SourceTier, number> = {
  TIER_1_OFFICIAL: 100,
  TIER_2_ACADEMIC:  80,
  TIER_3_WEB:       55,
  TIER_4_OTHER:     25,
};

/**
 * 计算综合信源质量评分
 *
 * @param url            页面 URL (用于自动分级)
 * @param entity         提取到的实体 (用于计算完整度)
 * @param crossSourceCount 同一实体在多少个不同来源中出现
 * @param lastModified   HTTP Last-Modified
 * @param pageDate       页面内容日期
 * @param crawledAt      爬取时间
 * @param explicitTier   手动指定等级 (可选，覆盖自动分级)
 */
export function calculateQuality(
  url: string,
  entity?: {
    name?: string;
    email?: string;
    orcid?: string;
    institution?: string;
    affiliations?: string[];
    description?: string;
  },
  crossSourceCount: number = 0,
  lastModified?: string | null,
  pageDate?: string | null,
  crawledAt?: string | null,
  explicitTier?: SourceTier,
): SourceQuality {
  const tier = explicitTier ?? classifyTier(url);
  const baseScore = BASE_SCORES[tier];
  const freshness = scoreFreshness(lastModified, pageDate, crawledAt);
  const completeness = entity ? scoreCompleteness(entity) : 0.5;

  // 交叉验证加分: 每多一个来源 +5%, 最高 +20%
  const crossSourceBonus = Math.min(0.2, crossSourceCount * 0.05);

  // 加权总分: 基础分(50%) + 时效(20%) + 完整度(15%) + 交叉验证(15%)
  const totalScore = Math.round((
    baseScore * 0.50 +
    freshness * 100 * 0.20 +
    completeness * 100 * 0.15 +
    crossSourceBonus * 100 * 0.15
  ) * 100) / 100;

  return {
    tier,
    baseScore,
    freshnessScore: freshness,
    completenessScore: completeness,
    crossSourceBonus,
    totalScore,
    scoredAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 批量评分工具
// ---------------------------------------------------------------------------

/** 为一批 URL 批量评分 */
export function classifyTiers(urls: string[]): Map<string, SourceTier> {
  const map = new Map<string, SourceTier>();
  for (const url of urls) {
    map.set(url, classifyTier(url));
  }
  return map;
}

/** Tier → 人类可读标签 */
export function tierLabel(tier: SourceTier): string {
  switch (tier) {
    case 'TIER_1_OFFICIAL': return '官方机构';
    case 'TIER_2_ACADEMIC':  return '学术出版';
    case 'TIER_3_WEB':       return '网络来源';
    case 'TIER_4_OTHER':     return '其他';
  }
}
