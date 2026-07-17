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

// -- 多语言姓名别名生成 ------------------------------------------------

/**
 * 为英文人名生成所有常见变体
 * "Zhi-Xun Shen" → ["Zhi-Xun Shen", "Z.-X. Shen", "Z X Shen",
 *                    "Zhixun Shen", "Shen Zhi-Xun", "Shen Z.-X."]
 */
export function generateNameAliases(fullName: string): string[] {
  if (!fullName || fullName.length < 2) return [fullName];
  const aliases = new Set<string>();
  aliases.add(fullName);

  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return [fullName];

  const lastName = parts[parts.length - 1];
  const givenNames = parts.slice(0, -1);

  // 1. 缩写形式: "Z.-X. Shen"
  const initials = givenNames
    .map(n => n.charAt(0).toUpperCase() + '.')
    .join('-');
  aliases.add(`${initials} ${lastName}`);
  aliases.add(`${initials.replace(/-/g, ' ')} ${lastName}`);

  // 2. 无连字符: "Z X Shen"
  aliases.add(`${givenNames.map(n => n.charAt(0).toUpperCase()).join(' ')} ${lastName}`);

  // 3. 全名无连字符: "Zhixun Shen"
  const fullGiven = givenNames.join('')
    .replace(/[^a-zA-ZÀ-ɏ]/g, '');
  if (fullGiven !== givenNames.join(' ')) {
    aliases.add(`${fullGiven} ${lastName}`);
  }

  // 4. 姓在前: "Shen Zhi-Xun" (中文习惯)
  aliases.add(`${lastName} ${givenNames.join('-')}`);
  aliases.add(`${lastName} ${initials.replace(/\./g, '')}`);

  // 5. 姓在前, 名在后无空格: "Shen Zhixun"
  aliases.add(`${lastName} ${fullGiven}`);

  return Array.from(aliases);
}

/**
 * 跨语言姓名匹配 — 支持中/英/日/韩
 * 返回 0-1 的匹配分数
 */
export function crossLanguageNameMatch(name1: string, name2: string): number {
  const n1 = name1.trim().toLowerCase();
  const n2 = name2.trim().toLowerCase();

  // 精确匹配
  if (n1 === n2) return 1.0;

  // 一方包含另一方
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  // 生成双方的别名集合
  const aliases1 = new Set(generateNameAliases(name1).map(a => a.toLowerCase()));
  const aliases2 = generateNameAliases(name2).map(a => a.toLowerCase());

  // 任一别名匹配
  for (const a2 of aliases2) {
    if (aliases1.has(a2)) return 0.95;
  }

  // 词序匹配 (分词后再排序比较)
  const parts1 = n1.split(/[\s-]+/).sort().join(' ');
  const parts2 = n2.split(/[\s-]+/).sort().join(' ');
  if (parts1 === parts2) return 0.85;

  // 模糊: Levenshtein 距离
  const dist = editDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const similarity = 1 - dist / maxLen;
  if (similarity > 0.85) return 0.7;
  if (similarity > 0.75) return 0.5;

  return 0;
}

/** 判断是否为 CJK 姓名 (中/日/韩) */
export function isCJKName(name: string): boolean {
  return /[一-鿿぀-ゟ゠-ヿ가-힯]/.test(name);
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

// -- 统一人名/机构名规范化 -----------------------------------------------

/**
 * 去重用规范化：小写 → 去非字母 → 分词排序 → 合并。
 * 词序无关，用于模糊去重（"Ding Hong" ↔ "Hong Ding"）。
 */
export function normalizeNameForDedup(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .sort()
    .join(' ')
    .trim();
}

/**
 * 精确匹配用规范化：小写 → 去非字母/空格 → 合并空白。
 * 保留词序，用于精确姓名匹配。
 */
export function normalizeNameExact(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unicode 宽容规范化：小写 → 保留重音拉丁字符和连字符 → 规范化空白。
 * 用于跨语言姓名匹配。与 normalizeNameExact 的区别是保留 À-ɏ 范围的字符。
 */
export function normalizeNameUnicode(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-zÀ-ɏ\s-]/g, '')
    .replace(/[-\s]+/g, ' ')
    .trim();
}

/**
 * 机构名规范化：小写 → 去非字母 → 剔除常见停用词 → 保留长度>1的词 → 排序。
 * 返回哨兵值 `_no_institution_` 防止空名误合并。
 */
export function normalizeInstitution(name: string): string {
  if (!name) return '_no_institution_';
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\b(university|institute|college|school|of|the|and|department|center|for|research|lab|laboratory|national|international)\b/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .sort()
    .join(' ');
  return normalized || '_no_institution_';
}
