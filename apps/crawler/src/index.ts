// =============================================================================
// Targon Nexus Crawler — 递归网页爬虫
//
// 支持:
//   - 多级深度递归 (depth 1-N)
//   - 同源链接追踪
//   - PDF 文件下载
//   - robots.txt 合规
//   - 并发控制 (同源 3 并发, 礼貌延迟)
//   - 反爬隐身模式
//   - 页面类型识别 (faculty-directory, personal-profile, publication-list 等)
// =============================================================================

import { chromium } from 'playwright';
import { Queue, Worker, Job } from 'bullmq';
import TurndownService from 'turndown';
import robotParserFn from 'robots-parser';
import type {
  CrawlJob,
  CrawledPage,
  CrawlResult,
  SourceType,
  SourceTier,
} from '@arp/types';
import { createLogger, createRedisConnection, runService } from '@arp/shared';
import {
  getRotatingUA,
  checkRateLimit,
  recordRequest,
  applyStealth,
  randomDelay,
  simulateHumanScroll,
  fetchWithRetry,
  isHighWallDomain,
} from './anti-bot';

const logger = createLogger('crawler');

// ---------------------------------------------------------------------------
// Turndown (HTML → Markdown)
// ---------------------------------------------------------------------------
const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});
turndown.remove(['script', 'style', 'nav', 'footer', 'noscript', 'iframe']);

// ---------------------------------------------------------------------------
// 页面日期检测
// ---------------------------------------------------------------------------
function detectPageDate(html: string, lastModifiedHeader?: string | null): { pageDate?: string; confidence: number } {
  const pubMatch = html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i);
  if (pubMatch) return { pageDate: pubMatch[1], confidence: 0.9 };
  const dcMatch = html.match(/<meta[^>]+name="dc\.date"[^>]+content="([^"]+)"/i);
  if (dcMatch) return { pageDate: dcMatch[1], confidence: 0.85 };
  const citMatch = html.match(/<meta[^>]+name="citation_date"[^>]+content="([^"]+)"/i);
  if (citMatch) return { pageDate: citMatch[1], confidence: 0.8 };
  const schemaMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
  if (schemaMatch) return { pageDate: schemaMatch[1], confidence: 0.85 };
  const lastUpdateMatch = html.match(/(?:Last\s*(?:updated|modified|revised)|Updated|Published)\s*:?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\w+\s+\d{1,2},?\s+\d{4})/i);
  if (lastUpdateMatch) return { pageDate: lastUpdateMatch[1], confidence: 0.5 };
  if (lastModifiedHeader) return { pageDate: lastModifiedHeader, confidence: 0.4 };
  const copyMatch = html.match(/©\s*(\d{4})/);
  if (copyMatch) return { pageDate: `${copyMatch[1]}-01-01`, confidence: 0.2 };
  return { confidence: 0 };
}

// ---------------------------------------------------------------------------
// 页面类型识别
// ---------------------------------------------------------------------------
function detectPageType(html: string, url: string): string {
  const lower = html.toLowerCase();
  const personCards = (lower.match(/class="[^"]*(?:person|faculty|profile|member)[^"]*"/gi) ?? []).length;
  if (personCards >= 3) return 'faculty-directory';
  if ((lower.includes('members') || lower.includes('people') || lower.includes('team')) && personCards >= 2) return 'lab-members';
  const doiCount = (html.match(/doi\.org\/10\./gi) ?? []).length;
  if (doiCount >= 3) return 'publication-list';
  if (lower.includes('biography') || lower.includes('research interests') || lower.match(/class="[^"]*profile[^"]*"/i)) return 'personal-profile';
  if (url.includes('arxiv.org/abs/')) return 'paper-abstract';
  if (url.endsWith('.pdf')) return 'pdf';
  return 'generic';
}

// ---------------------------------------------------------------------------
// 信源等级分类
// ---------------------------------------------------------------------------
function classifyTierForCrawler(url: string): SourceTier {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.endsWith('.edu') || hostname.endsWith('.ac.uk') || hostname.endsWith('.ac.jp') ||
        hostname.endsWith('.ac.cn') || hostname.endsWith('.ac.kr') || hostname.endsWith('.edu.cn') ||
        hostname.endsWith('.edu.hk') || hostname.endsWith('.gov') || hostname.endsWith('.gov.cn') ||
        hostname.endsWith('.cas.cn')) return 'TIER_1_OFFICIAL';
    if (hostname.includes('arxiv.org') || hostname.includes('nature.com') || hostname.includes('science.org') ||
        hostname.includes('aps.org') || hostname.includes('springer.com') || hostname.includes('elsevier.com') ||
        hostname.includes('ieee.org') || hostname.includes('pnas.org') || hostname.includes('cell.com'))
      return 'TIER_2_ACADEMIC';
    if (hostname.endsWith('.org') || hostname.includes('researchgate')) return 'TIER_3_WEB';
    return 'TIER_4_OTHER';
  } catch { return 'TIER_4_OTHER'; }
}

// ---------------------------------------------------------------------------
// Redis / BullMQ
// ---------------------------------------------------------------------------
const connection = createRedisConnection();
const crawlQueue = new Queue<CrawlJob>('crawl', { connection });
const parseQueue = new Queue<CrawledPage>('parse', { connection });

// ---------------------------------------------------------------------------
// Source URL builders
// ---------------------------------------------------------------------------
const SOURCE_BUILDERS: Record<SourceType, (seed: string) => string[]> = {
  'lab-homepage': (url: string) => [url],
  'personal-homepage': (url: string) => [url],
  'arxiv': (topic: string) => [`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(topic)}&start=0&max_results=30`],
  'google-scholar': (query: string) => [
    `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
  ],
  'institutional': (url: string) => [url],
  'conference': (url: string) => [url],
  'journal': (issn: string) => [`https://api.crossref.org/journals/${issn}/works`],
  'custom': (url: string) => [url],
};

// ---------------------------------------------------------------------------
// 浏览器实例 (使用 pending-launch promise 避免竞态)
// ---------------------------------------------------------------------------
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
let browserPromise: Promise<Awaited<ReturnType<typeof chromium.launch>>> | null = null;

async function getBrowser() {
  if (browser?.isConnected()) return browser;
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
    }).then(b => {
      browser = b;
      browserPromise = null;
      return b;
    }).catch(e => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

// ---------------------------------------------------------------------------
// Robots.txt
// ---------------------------------------------------------------------------
const robotsCache = new Map<string, ReturnType<typeof robotParserFn> | null>();
const CRAWLER_UA = 'TargonNexus-Crawler/1.0';

async function isAllowedByRobots(url: string): Promise<boolean> {
  try {
    const origin = new URL(url).origin;
    if (!robotsCache.has(origin)) {
      try {
        const resp = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(10_000) });
        if (resp.ok) robotsCache.set(origin, robotParserFn(`${origin}/robots.txt`, await resp.text()));
        else robotsCache.set(origin, null);
      } catch { robotsCache.set(origin, null); }
    }
    const parser = robotsCache.get(origin);
    if (!parser) return true;
    return parser.isAllowed(url, CRAWLER_UA) ?? true;
  } catch { return true; }
}

// ---------------------------------------------------------------------------
// 单页爬取
// ---------------------------------------------------------------------------
async function crawlPage(
  url: string,
  userData: { sourceType: SourceType; seed: string; sourceTier?: SourceTier },
): Promise<CrawledPage | null> {
  // PDF 直接下载
  if (url.endsWith('.pdf')) return crawlPdf(url, userData);

  const ctx = await getBrowser();
  const context = await ctx.newContext({ userAgent: getRotatingUA() });
  try {
    const page = await context.newPage();
    await applyStealth(page);

    if (isHighWallDomain(url)) { logger.info({ url }, 'High-wall — skip'); return null; }
    if (!(await isAllowedByRobots(url))) { logger.info({ url }, 'robots.txt blocked'); return null; }

    const origin = new URL(url).origin;
    const waitTime = checkRateLimit(origin, 3000);
    if (waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
    recordRequest(origin);

    const navResult = await fetchWithRetry(page, url);
    if (!navResult.ok) { logger.warn({ url, status: navResult.status }, 'Load failed'); return null; }

    await randomDelay(800, 2000);
    await simulateHumanScroll(page);

    const title = await page.title();
    const html = await page.content();
    const lastModified = (await page.evaluate(() => (document as any).lastModified)) || undefined;
    const { pageDate, confidence: dateConfidence } = detectPageDate(html, lastModified);
    const pageType = detectPageType(html, url);

    let markdownContent = '';
    try { markdownContent = turndown.turndown(html).substring(0, 100_000); } catch {}

    const textContent = await page.evaluate(() => {
      document.querySelectorAll('script,style,nav,footer,noscript,header,.sidebar,#sidebar,.advertisement')
        .forEach((el) => el.remove());
      return document.body?.innerText?.trim() ?? '';
    });

    // 提取同源链接 (用于递归)
    const sameOriginLinks = await page.$$eval('a[href]', (anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href)
        .filter((href) => {
          try { return new URL(href).origin === window.location.origin; } catch { return false; }
        })
    );

    const sourceTier = userData.sourceTier ?? classifyTierForCrawler(url);

    return {
      url, title,
      textContent: textContent.substring(0, 100_000),
      markdownContent: markdownContent || textContent.substring(0, 100_000),
      contentType: 'text/html',
      crawledAt: new Date().toISOString(),
      lastModified: lastModified ?? undefined,
      pageDate: pageDate ?? undefined,
      pageType,
      links: sameOriginLinks.slice(0, 200),
      metadata: { contentLength: textContent.length, sourceType: userData.sourceType, seed: userData.seed, dateConfidence, sourceTier },
    };
  } finally {
    await context.close();
  }
}

/** PDF 文件下载 */
async function crawlPdf(
  url: string,
  userData: { sourceType: SourceType; seed: string; sourceTier?: SourceTier },
): Promise<CrawledPage | null> {
  try {
    logger.info({ url }, 'Downloading PDF');
    const resp = await fetch(url, {
      headers: { 'User-Agent': CRAWLER_UA },
      signal: AbortSignal.timeout(60_000),
    });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    return {
      url,
      title: url.split('/').pop() ?? 'document.pdf',
      textContent: '',
      markdownContent: '',
      contentType: 'application/pdf',
      crawledAt: new Date().toISOString(),
      links: [],
      pageType: 'pdf',
      metadata: { contentLength: buffer.length, sourceType: userData.sourceType, seed: userData.seed, sourceTier: userData.sourceTier ?? 'TIER_4_OTHER' },
      rawBuffer: buffer.toString('base64'),
    };
  } catch (err: any) {
    logger.warn({ url, err: err.message }, 'PDF download failed');
    return null;
  }
}

// ---------------------------------------------------------------------------
// 递归爬取引擎
// ---------------------------------------------------------------------------

/** 去重 + 过滤 */
function filterLinks(links: string[], visited: Set<string>, origin?: string): string[] {
  return links.filter((l) => {
    if (visited.has(l)) return false;
    try {
      const u = new URL(l);
      // 只保留 http/https, 排除资源文件
      if (!u.protocol.startsWith('http')) return false;
      if (/\.(jpg|jpeg|png|gif|svg|css|js|ico|woff|ttf|eot|zip|tar|gz)$/i.test(u.pathname)) return false;
      if (origin && u.origin !== origin) return false;
      return true;
    } catch { return false; }
  });
}

async function runCrawl(job: Job<CrawlJob>): Promise<CrawlResult> {
  const { seeds, sourceType, tier, maxPagesPerSeed = 10, depth = 1 } = job.data;
  logger.info({ seeds: seeds.length, sourceType, tier, depth, maxPagesPerSeed }, 'Crawl job started');

  const startTime = Date.now();
  const visited = new Set<string>();
  const allPages: CrawledPage[] = [];
  let pagesCrawled = 0;

  // 构建初始 URL 列表
  const seedUrls: Array<{ url: string; seed: string; origin: string }> = [];
  for (const seed of seeds) {
    const urls = (SOURCE_BUILDERS[sourceType]?.(seed) ?? [seed]).slice(0, maxPagesPerSeed);
    for (const url of urls) {
      try { seedUrls.push({ url, seed, origin: new URL(url).origin }); } catch {}
    }
  }

  // 按层级递归爬取
  let currentLevelUrls = seedUrls;

  for (let currentDepth = 0; currentDepth < depth; currentDepth++) {
    if (!currentLevelUrls.length) break;

    logger.info({ depth: currentDepth + 1, urls: currentLevelUrls.length }, `Crawling depth ${currentDepth + 1}/${depth}`);

    // 并发爬取 (同源限 2 并发)
    const results = await crawlBatch(currentLevelUrls, visited, 2, sourceType, tier);

    for (const page of results) {
      if (!page) continue;
      pagesCrawled++;
      allPages.push(page);

      // 入 parse 队列
      await parseQueue.add('parse-page', page, {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      }).catch(() => {});
    }

    // 准备下一层: 从已爬页面提取链接
    if (currentDepth < depth - 1) {
      const nextUrls: Array<{ url: string; seed: string; origin: string }> = [];
      for (const page of results) {
        if (!page?.links?.length) continue;
        const origin = new URL(page.url).origin;
        const newLinks = filterLinks(page.links, visited, origin);
        for (const link of newLinks.slice(0, 20)) { // 每页最多 20 个新链接
          visited.add(link);
          nextUrls.push({ url: link, seed: page.metadata?.seed as string || page.url, origin });
        }
      }
      currentLevelUrls = nextUrls.slice(0, maxPagesPerSeed * seeds.length); // 总量控制
    }
  }

  // 入 parse 队列 (已在深度循环内逐页入队)
  // 注意: 不再重复入队，避免每页被解析两次

  const result: CrawlResult = {
    jobId: job.id!,
    sourceType,
    seeds,
    pagesCrawled,
    durationMs: Date.now() - startTime,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };

  logger.info({ pagesCrawled, durationMs: result.durationMs }, 'Crawl job complete');
  return result;
}

/** 批量并发爬取 */
async function crawlBatch(
  urls: Array<{ url: string; seed: string; origin: string }>,
  visited: Set<string>,
  concurrency: number,
  sourceType: SourceType,
  tier?: SourceTier,
): Promise<(CrawledPage | null)[]> {
  const results: (CrawledPage | null)[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async ({ url, seed }) => {
        if (visited.has(url)) return null;
        visited.add(url);
        const page = await crawlPage(url, { sourceType, seed, sourceTier: tier });
        // 礼貌延迟
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        return page;
      }),
    );
    results.push(...batchResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// BullMQ Worker
// ---------------------------------------------------------------------------
runService({
  name: 'crawler',
  async main(log) {
    const worker = new Worker<CrawlJob>('crawl', async (job) => runCrawl(job), {
      connection,
      concurrency: 2,           // 同时跑 2 个 crawl job
      limiter: { max: 10, duration: 60_000 },
    });

    worker.on('completed', (job) => log.info({ jobId: job.id }, 'Crawl job completed'));
    worker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'Crawl job failed'));

    log.info('Targon Nexus Crawler ready — listening on "crawl" queue');
    (globalThis as any).__crawlerWorker = worker;
  },
  async shutdown(log) {
    log.info('Shutting down crawler...');
    const worker = (globalThis as any).__crawlerWorker;
    if (worker) await worker.close();
    await connection.quit();
  },
});

// 导出供 worker 模块使用
export { runCrawl, crawlPage, parseQueue };
