// =============================================================================
// Anti-Bot / Stealth 模块 — 提升学术网站爬取成功率
//
// 功能:
//   1. Playwright 隐身配置 (隐藏自动化特征)
//   2. 每域名速率控制 (防止被封)
//   3. User-Agent 轮换
//   4. 人类行为模拟 (随机滚动/移动)
//   5. 指数退避重试 (429/503)
// =============================================================================

import type { Page } from 'playwright';

// ---------------------------------------------------------------------------
// UA 轮换池
// ---------------------------------------------------------------------------
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0',
];

let uaIndex = 0;

/** 获取一个轮换的 UA */
export function getRotatingUA(): string {
  const ua = UA_POOL[uaIndex % UA_POOL.length];
  uaIndex++;
  return ua;
}

// ---------------------------------------------------------------------------
// 每域名速率限制
// ---------------------------------------------------------------------------
const domainTimestamps = new Map<string, number[]>();

/**
 * 检查是否可以请求该域名
 * @returns 需等待的毫秒数, 0 表示可以立即请求
 */
export function checkRateLimit(domain: string, minIntervalMs = 5000): number {
  const now = Date.now();
  const timestamps = domainTimestamps.get(domain) ?? [];
  // 清理超过 1 小时的旧记录
  const recent = timestamps.filter(t => now - t < 3_600_000);
  domainTimestamps.set(domain, recent);

  if (recent.length === 0) return 0;

  const lastRequest = recent[recent.length - 1];
  const elapsed = now - lastRequest;
  return Math.max(0, minIntervalMs - elapsed);
}

/** 记录一次请求 */
export function recordRequest(domain: string): void {
  const timestamps = domainTimestamps.get(domain) ?? [];
  timestamps.push(Date.now());
  domainTimestamps.set(domain, timestamps);
}

// ---------------------------------------------------------------------------
// Playwright 隐身模式
// ---------------------------------------------------------------------------

/**
 * 为 Page 注入隐身脚本 — 隐藏自动化特征
 * 应在 page.goto() 之后、内容交互之前调用
 */
export async function applyStealth(page: Page): Promise<void> {
  // 覆盖 navigator.webdriver (最重要的检测点)
  // page.addInitScript 在新版 Playwright 中替代了 evaluateOnNewDocument
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // @ts-expect-error chrome.runtime
    window.chrome = { runtime: {} };
    // 覆盖权限查询
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });

  // 设置真实的 viewport
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 设置常见语言
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  });
}

// ---------------------------------------------------------------------------
// 人类行为模拟
// ---------------------------------------------------------------------------

/** 随机延迟 (避免被识别为自动化请求) */
export function randomDelay(minMs = 2000, maxMs = 8000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs) + minMs);
  return new Promise(r => setTimeout(r, delay));
}

/** 模拟人类滚动行为 */
export async function simulateHumanScroll(page: Page): Promise<void> {
  try {
    // 随机向下滚动
    const scrollDistance = 300 + Math.floor(Math.random() * 700);
    await page.evaluate((distance) => {
      window.scrollBy({ top: distance, behavior: 'smooth' });
    }, scrollDistance);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    // 可能再滚动一点
    if (Math.random() > 0.5) {
      await page.evaluate((distance) => {
        window.scrollBy({ top: distance, behavior: 'smooth' });
      }, 200 + Math.random() * 400);
    }
  } catch {
    // 滚动失败不影响主流程
  }
}

// ---------------------------------------------------------------------------
// 带退避的重试
// ---------------------------------------------------------------------------

const RETRYABLE_STATUSES = new Set([429, 503, 502, 504]);

/**
 * 尝试访问页面，遇到限流自动退避重试
 */
export async function fetchWithRetry(
  page: Page,
  url: string,
  maxRetries = 3,
  baseDelayMs = 5000,
): Promise<{ ok: boolean; status: number; blocked: boolean }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const status = response?.status() ?? 0;

      // 成功
      if (status >= 200 && status < 300) return { ok: true, status, blocked: false };

      // 被限流 — 退避重试
      if (RETRYABLE_STATUSES.has(status) && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`Rate limited (${status}) at ${url}, retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // 被封锁 (403, 406, etc.)
      if (status === 403 || status === 406) {
        return { ok: false, status, blocked: true };
      }

      return { ok: false, status, blocked: false };
    } catch (err: any) {
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`Navigation failed at ${url}: ${err.message}, retry ${attempt + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return { ok: false, status: 0, blocked: true };
    }
  }

  return { ok: false, status: 0, blocked: true };
}

// ---------------------------------------------------------------------------
// 域名分类 → 策略选择
// ---------------------------------------------------------------------------

/** 判断是否为中国大学网站 (需要国内 IP 或特殊处理) */
export function isChineseAcademicDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.edu.cn') || hostname.endsWith('.ac.cn') ||
           hostname.includes('cnki.net') || hostname.includes('wanfangdata.com.cn') ||
           hostname.includes('cqvip.com');
  } catch {
    return false;
  }
}

/** 判断是否为高墙网站 (建议走 API 替代) */
export function isHighWallDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.includes('scholar.google') ||
           hostname.includes('cnki.net') ||
           hostname.includes('researchgate.net');
  } catch {
    return false;
  }
}

/** 根据域名返回推荐策略 */
export function getCrawlStrategy(url: string): 'direct' | 'stealth' | 'api-preferred' | 'skip' {
  if (isHighWallDomain(url)) return 'api-preferred';
  if (isChineseAcademicDomain(url)) return 'stealth';
  return 'direct';
}
