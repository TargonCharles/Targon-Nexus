// Name normalization utilities for Chinese/English academic names

export interface NameParts { firstName?: string; lastName?: string; fullName: string; }
export interface PinyinResult { pinyin: string; toneMarks: boolean; }
export interface AliasMatchResult { matched: boolean; score: number; reason: string; }
export interface NormalizationOptions { lowercase?: boolean; trim?: boolean; removeDiacritics?: boolean; }

export const NORMALIZATION_RULES = {
  chineseNameSeparators: [' ', '·', '-'],
  englishNameSeparators: [' ', '-'],
};

export function normalizeChineseName(name: string, _options?: NormalizationOptions): string {
  return name.replace(/\s+/g, '').trim();
}

export function normalizeEnglishName(name: string, options?: NormalizationOptions): string {
  let result = name.trim();
  if (options?.lowercase) result = result.toLowerCase();
  result = result.replace(/\s+/g, ' ');
  return result;
}

export function fullNameToParts(fullName: string): NameParts {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { fullName };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1], fullName };
}

export function partsToFullName(parts: NameParts): string {
  return [parts.firstName, parts.lastName].filter(Boolean).join(' ');
}

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function nameFingerprint(name: string): string {
  return normalizeEnglishName(name, { lowercase: true, removeDiacritics: true }).replace(/[^a-z]/g, '');
}

/**
 * Convert Chinese characters to pinyin (tone-marked).
 * Uses dynamic import of the `pinyin` package when available;
 * falls back to returning the input unchanged if the package is not installed.
 *
 * @example
 *   toPinyin('周兴江') // → 'zhōu xīng jiāng'
 *   toPinyin('Zhi-Xun Shen') // → 'Zhi-Xun Shen' (non-Chinese passed through)
 */
export function toPinyin(name: string): string {
  // Quick check: if the string has no CJK characters, return as-is
  if (!hasChinese(name)) return name;

  try {
    // Dynamic require to avoid hard dependency — `pinyin` is an optional dep
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pinyinMod: any = require('pinyin');

    // Handle different module export shapes:
    // - pinyin: module.exports = function(text, opts) {}
    // - pinyin-pro: module.exports = { pinyin: function(text, opts) {} }
    const fn: ((text: string, opts?: Record<string, unknown>) => string[][]) | undefined =
      typeof pinyinMod === 'function'
        ? pinyinMod
        : pinyinMod?.default ?? pinyinMod?.pinyin;

    if (typeof fn !== 'function') return fallbackPinyin(name);

    const result = fn(name, {
      style: 'TONE2',
      heteronym: false,
    } as Record<string, unknown>);

    if (Array.isArray(result)) {
      return result
        .map((char: string | string[]) => (Array.isArray(char) ? char[0] : char))
        .join(' ');
    }

    return fallbackPinyin(name);
  } catch {
    return fallbackPinyin(name);
  }
}

/**
 * Convert Chinese characters to an array of pinyin readings (one per character).
 */
export function toPinyinArray(name: string): string[] {
  if (!hasChinese(name)) return [name];

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pinyinMod: any = require('pinyin');
    const fn: ((text: string, opts?: Record<string, unknown>) => string[][]) | undefined =
      typeof pinyinMod === 'function' ? pinyinMod : pinyinMod?.default ?? pinyinMod?.pinyin;

    if (typeof fn !== 'function') return [fallbackPinyin(name)];

    const result = fn(name, { style: 'NORMAL', heteronym: false } as Record<string, unknown>);

    if (Array.isArray(result)) {
      return result.map((char: string | string[]) => (Array.isArray(char) ? char[0] : char));
    }

    return [fallbackPinyin(name)];
  } catch {
    return [fallbackPinyin(name)];
  }
}

// -- Helpers ---------------------------------------------------------------

function hasChinese(text: string): boolean {
  return /[一-鿿㐀-䶿]/.test(text);
}

/**
 * Fallback pinyin that does basic character-to-reading mapping for the
 * most common Chinese surnames (avoids the npm dependency requirement).
 * For production use, install `pinyin` or `pinyin-pro`.
 */
function fallbackPinyin(text: string): string {
  // Common surname mapping — sufficient for disambiguation in search.
  // Full pinyin requires the `pinyin` package.
  const common: Record<string, string> = {
    '周': 'zhou', '王': 'wang', '张': 'zhang', '李': 'li', '刘': 'liu',
    '陈': 'chen', '杨': 'yang', '赵': 'zhao', '黄': 'huang', '吴': 'wu',
    '徐': 'xu', '孙': 'sun', '马': 'ma', '胡': 'hu', '朱': 'zhu',
    '郭': 'guo', '何': 'he', '高': 'gao', '林': 'lin', '罗': 'luo',
    '郑': 'zheng', '梁': 'liang', '谢': 'xie', '宋': 'song', '唐': 'tang',
    '沈': 'shen', '邓': 'deng', '彭': 'peng', '曾': 'zeng', '肖': 'xiao',
    '田': 'tian', '董': 'dong', '潘': 'pan', '袁': 'yuan', '蔡': 'cai',
    '蒋': 'jiang', '余': 'yu', '杜': 'du', '叶': 'ye', '程': 'cheng',
    '苏': 'su', '魏': 'wei', '吕': 'lv', '丁': 'ding', '任': 'ren',
    '卢': 'lu', '姚': 'yao', '钟': 'zhong', '姜': 'jiang', '崔': 'cui',
    '谭': 'tan', '陆': 'lu', '汪': 'wang', '范': 'fan', '石': 'shi',
    '廖': 'liao', '贾': 'jia', '夏': 'xia', '韦': 'wei', '付': 'fu',
    '方': 'fang', '白': 'bai', '邹': 'zou', '孟': 'meng', '熊': 'xiong',
    '秦': 'qin', '邱': 'qiu', '江': 'jiang', '尹': 'yin', '薛': 'xue',
    '闫': 'yan', '段': 'duan', '雷': 'lei', '侯': 'hou', '龙': 'long',
    '史': 'shi', '陶': 'tao', '黎': 'li', '贺': 'he', '顾': 'gu',
    '毛': 'mao', '郝': 'hao', '龚': 'gong', '邵': 'shao', '万': 'wan',
    '钱': 'qian', '严': 'yan', '覃': 'qin', '武': 'wu', '戴': 'dai',
    '莫': 'mo', '孔': 'kong', '向': 'xiang', '常': 'chang', '汤': 'tang',
  };

  return text
    .split('')
    .map((ch) => common[ch] ?? ch)
    .join(' ');
}

export function matchAlias(name: string, alias: string): AliasMatchResult {
  const fp1 = nameFingerprint(name);
  const fp2 = nameFingerprint(alias);
  if (fp1 === fp2) return { matched: true, score: 1.0, reason: 'exact fingerprint match' };
  const similarity = fp1.length > 0 && fp2.length > 0
    ? 1 - editDistance(fp1, fp2) / Math.max(fp1.length, fp2.length)
    : 0;
  return { matched: similarity > 0.8, score: similarity, reason: similarity > 0.8 ? 'fuzzy match' : 'low similarity' };
}

export function fuzzyMatchName(name1: string, name2: string): number {
  const fp1 = nameFingerprint(name1);
  const fp2 = nameFingerprint(name2);
  if (fp1.length === 0 || fp2.length === 0) return 0;
  return 1 - editDistance(fp1, fp2) / Math.max(fp1.length, fp2.length);
}

export function extractAffiliationTokens(affiliation: string): string[] {
  return affiliation.toLowerCase().split(/[,;\s]+/).filter((t) => t.length > 2);
}

export function normalizeInstitutionName(name: string): string {
  return name.replace(/University of (.+)/i, '$1 University').replace(/\bThe\b/i, '').trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
