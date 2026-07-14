// URL validation and extraction utilities

export interface URLValidationResult { valid: boolean; normalized: string; domain: string; }
export interface SourceTypeGuess { type: 'lab_homepage' | 'university' | 'scholar' | 'orcid' | 'researchgate' | 'paper' | 'news' | 'other'; confidence: number; }

export const ACADEMIC_DOMAINS = ['.edu', '.ac.', '.edu.cn', '.ac.cn', '.ac.jp', '.ac.kr', '.ac.uk', 'arxiv.org'];

export const URL_PATTERNS = {
  doi: /\b10\.\d{4,}\/[\w.-]+\b/g,
  orcid: /\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g,
  googleScholar: /user=([\w-]+)/,
};

export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function normalizeURL(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Check if a URL is ALLOWED by a robots.txt rule pattern.
 * In robots.txt, a `Disallow: /path` means matching URLs are BLOCKED,
 * so we return true only when the pattern does NOT match.
 */
export function isAllowedByRobotsRule(url: string, rule: string): boolean {
  return !matchesRobotsRule(url, rule);
}

/**
 * Check if a URL path matches a robots.txt pattern (e.g., "/admin/*").
 * Returns true when the URL path matches the rule pattern.
 */
export function matchesRobotsRule(url: string, pattern: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp('^' + escaped + '$');
    return regex.test(pathname);
  } catch {
    // On invalid regex, err on the side of caution: do NOT match
    return false;
  }
}

export function extractDOI(text: string): string | null {
  const match = text.match(URL_PATTERNS.doi);
  return match ? match[0] : null;
}

export function extractORCID(text: string): string | null {
  const match = text.match(URL_PATTERNS.orcid);
  return match ? match[0] : null;
}

export function extractGoogleScholarId(url: string): string | null {
  const match = url.match(URL_PATTERNS.googleScholar);
  return match ? match[1] : null;
}

export function isAcademicDomain(url: string): boolean {
  const domain = extractDomain(url);
  return ACADEMIC_DOMAINS.some((d) => domain.endsWith(d));
}

export function guessSourceType(url: string): SourceTypeGuess {
  const domain = extractDomain(url);
  if (domain.includes('scholar.google')) return { type: 'scholar', confidence: 0.95 };
  if (domain.includes('orcid.org')) return { type: 'orcid', confidence: 0.95 };
  if (domain.includes('researchgate')) return { type: 'researchgate', confidence: 0.95 };
  if (domain.includes('arxiv.org')) return { type: 'paper', confidence: 0.9 };
  if (domain.endsWith('.edu') || domain.endsWith('.ac.')) return { type: 'university', confidence: 0.7 };
  return { type: 'other', confidence: 0.3 };
}
