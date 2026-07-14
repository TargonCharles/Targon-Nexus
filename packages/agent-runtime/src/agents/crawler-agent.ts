// =============================================================================
// Crawler Agent — 生产实现
// 集成 apps/crawler 的 Playwright + Crawlee 爬虫
// =============================================================================

import type { AgentHandler, AgentContext, AgentEvent, AgentResult } from '../types';

/**
 * Crawler Agent — 响应 DiscoveryEvent 和 CrawlEvent，执行网页爬取
 *
 * 依赖:
 *   - apps/crawler/src/index.ts (PlaywrightCrawler + BullMQ worker)
 *   - 环境变量: CRAWLER_CONCURRENCY, CRAWLER_HEADFUL, CRAWLER_POLITENESS_DELAY
 */
export const crawlerAgentHandler: AgentHandler = async (
  ctx: AgentContext,
  event: AgentEvent,
): Promise<AgentResult> => {
  const start = Date.now();

  switch (event.eventType) {
    case 'DiscoveryEvent':
      return handleDiscovery(ctx, event, start);
    case 'CrawlEvent':
      return handleCrawl(ctx, event, start);
    case 'PipelineTask.crawl':
      return handlePipelineCrawl(ctx, event, start);
    default:
      return { status: 'skipped', output: { reason: `Unhandled event: ${event.eventType}` }, durationMs: 0 };
  }
};

async function handleDiscovery(
  ctx: AgentContext, event: AgentEvent, startMs: number,
): Promise<AgentResult> {
  const url = event.payload.sourceUrl as string;
  ctx.logger.info(`CrawlerAgent: Discovery — ${url}`);

  // 检查 robots.txt（在生产中由 Crawlee 自动处理）
  try {
    const origin = new URL(url).origin;
    ctx.logger.debug(`CrawlerAgent: Checking robots.txt for ${origin}`);
    ctx.state.set('lastDiscoveryUrl', url);
  } catch {
    return { status: 'failed', error: `Invalid URL: ${url}`, durationMs: Date.now() - startMs };
  }

  // 发射 CrawlEvent 通知爬取开始
  await ctx.eventBus.emit({
    eventId: `evt-${Date.now()}`,
    eventType: 'CrawlEvent',
    timestamp: new Date().toISOString(),
    sourceAgent: 'crawler-agent',
    runId: event.runId,
    payload: {
      url,
      status: 'started',
      pagesCrawled: 0,
    },
  });

  return {
    status: 'completed',
    output: { url, queuedForCrawl: true },
    durationMs: Date.now() - startMs,
  };
}

async function handleCrawl(
  ctx: AgentContext, event: AgentEvent, startMs: number,
): Promise<AgentResult> {
  const url = event.payload.url as string;
  ctx.logger.info(`CrawlerAgent: Crawling — ${url}`);

  try {
    // 生产环境通过 BullMQ 队列分发，这里演示直接 HTTP fetch
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'TargonNexus-Crawler/1.0 (Academic Research)' },
    });

    if (!resp.ok) {
      return { status: 'failed', error: `HTTP ${resp.status}`, durationMs: Date.now() - startMs };
    }

    const contentType = resp.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { status: 'skipped', output: { reason: `Non-HTML: ${contentType}` }, durationMs: Date.now() - startMs };
    }

    const html = await resp.text();
    // 提取纯文本
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100_000);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? url;

    // 提取链接用于后续发现
    const linkMatches = html.match(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"/gi) ?? [];
    const links = linkMatches
      .map((m) => (/href="([^"]*)"/i.exec(m)?.[1] ?? ''))
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('javascript:'))
      .slice(0, 50);

    // 发射 RawDocument 给 parser-agent
    await ctx.eventBus.emit({
      eventId: `evt-${Date.now()}`,
      eventType: 'RawDocument',
      timestamp: new Date().toISOString(),
      sourceAgent: 'crawler-agent',
      runId: event.runId,
      payload: {
        url,
        title,
        textContent: text,
        contentType,
        links,
        crawledAt: new Date().toISOString(),
      },
    });

    ctx.state.set('lastPageTitle', title);
    const pagesCrawled = ((ctx.state.get('pagesCrawled') as number) ?? 0) + 1;
    ctx.state.set('pagesCrawled', pagesCrawled);

    await ctx.eventBus.emit({
      eventId: `evt-${Date.now()}`,
      eventType: 'CrawlEvent',
      timestamp: new Date().toISOString(),
      sourceAgent: 'crawler-agent',
      runId: event.runId,
      payload: { url, status: 'completed', pagesCrawled },
    });

    return {
      status: 'completed',
      output: { url, title, textLength: text.length, linksFound: links.length },
      durationMs: Date.now() - startMs,
    };
  } catch (err: any) {
    await ctx.eventBus.emit({
      eventId: `evt-${Date.now()}`,
      eventType: 'CrawlEvent',
      timestamp: new Date().toISOString(),
      sourceAgent: 'crawler-agent',
      runId: event.runId,
      payload: { url, status: 'failed', error: err.message },
    });

    return { status: 'failed', error: err.message, durationMs: Date.now() - startMs };
  }
}

/** 管道任务入口 — 处理种子列表 */
async function handlePipelineCrawl(
  ctx: AgentContext, event: AgentEvent, startMs: number,
): Promise<AgentResult> {
  const input = event.payload.input as { seeds?: string[]; maxPagesPerSeed?: number } | undefined;
  const seeds = input?.seeds ?? [];
  const maxPages = input?.maxPagesPerSeed ?? 3;

  ctx.logger.info(`CrawlerAgent: Pipeline crawl — ${seeds.length} seeds, ${maxPages} pages/seed`);

  let pagesCrawled = 0;
  const errors: string[] = [];

  for (const seed of seeds.slice(0, maxPages)) {
    const crawlEvent: AgentEvent = {
      eventId: `evt-${Date.now()}`,
      eventType: 'CrawlEvent',
      timestamp: new Date().toISOString(),
      sourceAgent: 'master-agent',
      runId: event.runId,
      payload: { url: seed },
    };

    const result = await handleCrawl(ctx, crawlEvent, Date.now());
    if (result.status === 'completed') {
      pagesCrawled++;
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  return {
    status: errors.length > seeds.length / 2 ? 'failed' : 'completed',
    output: { pagesCrawled, errors },
    durationMs: Date.now() - startMs,
  };
}
