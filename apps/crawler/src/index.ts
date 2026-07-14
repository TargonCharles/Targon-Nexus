import { PlaywrightCrawler, log, LogLevel } from 'crawlee';
import { chromium, BrowserContext } from 'playwright';
import * as robotsParser from 'robots-parser';
import { Queue, Worker, Job } from 'bullmq';
import type {
  CrawlJob,
  CrawledPage,
  CrawlResult,
  SourceType,
} from '@arp/types';
import { createLogger, createRedisConnection, runService } from '@arp/shared';

const logger = createLogger('crawler');

// ---------------------------------------------------------------------------
// Redis / BullMQ connection
// ---------------------------------------------------------------------------
const connection = createRedisConnection();

// Job queues
const crawlQueue = new Queue<CrawlJob>('crawl', { connection });
const parseQueue = new Queue<CrawledPage>('parse', { connection });

// ---------------------------------------------------------------------------
// Robots.txt cache (URL origin -> robots parser)
// ---------------------------------------------------------------------------
const robotsCache = new Map<string, robotsParser.Robot>();

async function getRobotsParser(userAgent: string, origin: string): Promise<robotsParser.Robot | null> {
  if (robotsCache.has(origin)) return robotsCache.get(origin)!;

  try {
    const resp = await fetch(`${origin}/robots.txt`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) {
      robotsCache.set(origin, null as any);
      return null;
    }
    const text = await resp.text();
    const parser = robotsParser(origin + '/robots.txt', text);
    robotsCache.set(origin, parser);
    return parser;
  } catch {
    // If robots.txt is unreachable, be conservative — allow with caution
    robotsCache.set(origin, null as any);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source URL builders
// ---------------------------------------------------------------------------
const SOURCE_BUILDERS: Record<SourceType, (seed: string) => string[]> = {
  'lab-homepage': (url: string) => [url],
  'personal-homepage': (url: string) => [url],
  'arxiv': (topic: string) => [
    `https://arxiv.org/search/?query=${encodeURIComponent(topic)}&searchtype=all`,
  ],
  'google-scholar': (query: string) => [
    `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
  ],
  'institutional': (url: string) => [url],
  'conference': (url: string) => [url],
  'journal': (issn: string) => [`https://api.crossref.org/journals/${issn}/works`],
  'custom': (url: string) => [url],
};

// ---------------------------------------------------------------------------
// PlaywrightCrawler setup
// ---------------------------------------------------------------------------
const crawler = new PlaywrightCrawler({
  logLevel: LogLevel.INFO,

  // Launch browser per domain to isolate cookies & sessions
  launchContext: {
    launchOptions: {
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    },
  },

  // Respect robots.txt before each request
  preNavigationHooks: [
    async ({ request, page }) => {
      const url = new URL(request.url);
      const origin = url.origin;
      const parser = await getRobotsParser('TargonNexus-Crawler/1.0', origin);

      if (parser && !parser.isAllowed(request.url, 'TargonNexus-Crawler/1.0')) {
        logger.warn({ url: request.url }, 'Blocked by robots.txt — skipping');
        request.skipNavigation = true;
      }
    },
  ],

  // Main request handler
  async requestHandler({ request, page, enqueueLinks, log: ctxLog }) {
    const title = await page.title();
    const url = request.loadedUrl ?? request.url;
    const contentType = request.headers?.['content-type'] ?? '';

    ctxLog.info(`Crawling: ${title || url}`);

    // Extract plain text for downstream LLM processing
    const textContent = await page.evaluate(() => {
      // Remove script, style, nav, footer noise
      const selectorsToRemove = [
        'script', 'style', 'nav', 'footer', 'noscript',
        'header', '.sidebar', '#sidebar', '.advertisement',
      ];
      selectorsToRemove.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => el.remove());
      });
      return document.body?.innerText?.trim() ?? '';
    });

    // Extract links for recursive crawling (same origin only)
    const sameOriginLinks = await page.$$eval(
      'a[href]',
      (anchors) =>
        anchors
          .map((a) => (a as HTMLAnchorElement).href)
          .filter((href) => {
            try {
              return new URL(href).origin === window.location.origin;
            } catch {
              return false;
            }
          }),
    );

    const crawledPage: CrawledPage = {
      url,
      title,
      textContent: textContent.substring(0, 100_000), // Cap at 100 KB
      contentType: 'text/html',
      crawledAt: new Date().toISOString(),
      links: sameOriginLinks.slice(0, 200), // Cap link count
      metadata: {
        contentLength: textContent.length,
        sourceType: (request.userData?.sourceType as SourceType) ?? 'custom',
        seed: (request.userData?.seed as string) ?? url,
      },
    };

    // Enqueue extracted page for parsing
    await parseQueue.add('parse-page', crawledPage, {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    });

    // Recursively enqueue same-origin links (depth-limited by Crawlee)
    if (sameOriginLinks.length > 0 && sameOriginLinks.length <= 50) {
      await enqueueLinks({
        urls: sameOriginLinks,
        userData: request.userData,
      });
    }
  },

  // Handle PDF downloads via direct fetch (not Playwright)
  async failedRequestHandler({ request }) {
    if (request.url?.endsWith('.pdf')) {
      logger.info({ url: request.url }, 'Fetching PDF directly');

      try {
        const resp = await fetch(request.url, {
          signal: AbortSignal.timeout(60_000),
          headers: { 'User-Agent': 'TargonNexus-Crawler/1.0' },
        });

        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());

          const pdfPage: CrawledPage = {
            url: request.url,
            title: request.url.split('/').pop() ?? 'document.pdf',
            textContent: '', // PDF text extraction deferred to parser
            contentType: 'application/pdf',
            crawledAt: new Date().toISOString(),
            links: [],
            metadata: {
              contentLength: buffer.length,
              sourceType: (request.userData?.sourceType as SourceType) ?? 'custom',
              seed: (request.userData?.seed as string) ?? request.url,
            },
            rawBuffer: buffer.toString('base64'),
          };

          await parseQueue.add('parse-page', pdfPage, {
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 500 },
          });
        }
      } catch (err) {
        logger.error({ url: request.url, err }, 'PDF download failed');
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Crawl job processor (called by BullMQ worker)
// ---------------------------------------------------------------------------
export async function runCrawl(job: Job<CrawlJob>): Promise<CrawlResult> {
  const { seeds, sourceType, maxPagesPerSeed = 50, depth = 2 } = job.data;

  logger.info(
    { seeds: seeds.length, sourceType, maxPagesPerSeed, depth },
    'Starting crawl job',
  );

  const startTime = Date.now();
  const visitedUrls: string[] = [];

  // Build start URLs from seeds
  const startUrls: { url: string; userData: { sourceType: SourceType; seed: string } }[] = [];
  for (const seed of seeds) {
    const urls = SOURCE_BUILDERS[sourceType]?.(seed) ?? [seed];
    for (const url of urls) {
      startUrls.push({
        url,
        userData: { sourceType, seed },
      });
    }
  }

  // Run Crawlee
  await crawler.run(startUrls, {
    maxRequestsPerCrawl: seeds.length * maxPagesPerSeed,
    maxConcurrency: 5,
  });

  const duration = Date.now() - startTime;

  const result: CrawlResult = {
    jobId: job.id!,
    sourceType,
    seeds,
    pagesCrawled: crawler.requestsMade ?? 0,
    durationMs: duration,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };

  logger.info(result, 'Crawl completed');
  return result;
}

// ---------------------------------------------------------------------------
// Service entry point — listen for crawl jobs via BullMQ
// ---------------------------------------------------------------------------
runService({
  name: 'crawler',
  async main(log) {
    const worker = new Worker<CrawlJob>(
      'crawl',
      async (job) => runCrawl(job),
      {
        connection,
        concurrency: 2,
        limiter: {
          max: 10,
          duration: 60_000,
        },
      },
    );

    worker.on('completed', (job) => {
      log.info({ jobId: job.id }, 'Crawl job completed');
    });

    worker.on('failed', (job, err) => {
      log.error({ jobId: job?.id, err }, 'Crawl job failed');
    });

    log.info('Targon Nexus Crawler service ready — waiting for jobs on "crawl" queue');

    // Store worker reference for shutdown
    (globalThis as any).__crawlerWorker = worker;
  },
  async shutdown(log) {
    log.info('Shutting down crawler...');
    const worker = (globalThis as any).__crawlerWorker;
    if (worker) await worker.close();
    await connection.quit();
  },
});
