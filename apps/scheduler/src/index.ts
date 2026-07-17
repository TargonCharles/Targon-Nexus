import * as cron from 'node-cron';
import { Queue } from 'bullmq';
import type {
  CrawlJob,
  ExtractJob,
  BuildGraphJob,
  DiscoveryJob,
  ValidateJob,
  SourceType,
  ScheduledTask,
  TaskStatus,
} from '@arp/types';
import { createLogger, createRedisConnection } from '@arp/shared';

const logger = createLogger('scheduler');

// ---------------------------------------------------------------------------
// Redis / BullMQ
// ---------------------------------------------------------------------------
const connection = createRedisConnection();

// Job queues we dispatch to
const crawlQueue = new Queue<CrawlJob>('crawl', { connection });
const extractQueue = new Queue<ExtractJob>('extract', { connection });
const buildGraphQueue = new Queue<BuildGraphJob>('build-graph', { connection });
const discoveryQueue = new Queue<DiscoveryJob>('discovery', { connection });
const validateQueue = new Queue<ValidateJob>('validate', { connection });

// ---------------------------------------------------------------------------
// Task registry — track scheduled task execution history
// ---------------------------------------------------------------------------
const taskHistory = new Map<string, TaskStatus[]>();

function recordTask(name: string, status: TaskStatus): void {
  const history = taskHistory.get(name) ?? [];
  history.push(status);
  // Keep only last 100 entries per task
  if (history.length > 100) history.shift();
  taskHistory.set(name, history);
}

/** 统一的定时任务包装器：自动记录执行历史和异常 */
async function runScheduledTask(
  taskName: string,
  fn: () => Promise<void>,
): Promise<void> {
  const startTime = Date.now();
  try {
    await fn();
    recordTask(taskName, {
      taskName,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    });
  } catch (err: any) {
    logger.error({ err, taskName }, 'Scheduled task failed');
    recordTask(taskName, {
      taskName,
      status: 'failed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      error: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// 关键词驱动的种子生成
//
// 环境变量 SEED_KEYWORDS="keyword1, keyword2, ..." 驱动所有爬取。
// 未设置时回退到默认关键词列表。
//
// 每个关键词生成三级爬取任务:
//   TIER_1: 从大学域名列表中搜索 faculty 目录 (priority=1)
//   TIER_2: arXiv 搜索 (priority=3)
//   TIER_3: Google Scholar 搜索 (priority=5)
// ---------------------------------------------------------------------------

function getKeywords(): string[] {
  const env = process.env.SEED_KEYWORDS;
  if (env) {
    return env.split(',').map(k => k.trim()).filter(Boolean);
  }
  // 默认关键词 — 可通过 API 或配置文件覆盖
  return [
    'angle-resolved photoemission',
    'topological materials',
    'high temperature superconductivity',
    'quantum computing',
    'CRISPR gene editing',
  ];
}

interface TieredSeed {
  seeds: string[];
  sourceType: SourceType;
  tier: 'TIER_1_OFFICIAL' | 'TIER_2_ACADEMIC' | 'TIER_3_WEB';
}

function buildSeeds(keywords: string[]): TieredSeed[] {
  const seeds: TieredSeed[] = [];

  // === TIER 1: 大学官网 faculty 目录 (永久种子，不限关键词) ===
  // 全球顶级大学的 physics/chemistry/biology/engineering 系列 faculty 页面
  const FACULTY_URLS = [
    // 北美
    'https://physics.stanford.edu/people/faculty',
    'https://physics.mit.edu/faculty',
    'https://physics.berkeley.edu/people/faculty',
    'https://www.physics.harvard.edu/people/faculty',
    'https://phas.ubc.ca/faculty',
    'https://pma.caltech.edu/people/faculty',
    'https://physics.princeton.edu/people/faculty',
    // 欧洲
    'https://www.physik.uni-wuerzburg.de/en/ep4/team',
    'https://www.synchrotron-soleil.fr/en/beamlines',
    // 东亚
    'http://english.iop.cas.cn/peoples/faculty/',
    'https://phys.fudan.edu.cn',
    'https://kondo.issp.u-tokyo.ac.jp',
  ];
  seeds.push({ sourceType: 'institutional', tier: 'TIER_1_OFFICIAL', seeds: FACULTY_URLS });

  // === TIER 2: arXiv 搜索 (每个关键词一个查询) ===
  seeds.push({ sourceType: 'arxiv', tier: 'TIER_2_ACADEMIC', seeds: keywords });

  // === TIER 3: Google Scholar/WWW (每个关键词一个查询) ===
  seeds.push({ sourceType: 'google-scholar', tier: 'TIER_3_WEB', seeds: keywords });

  return seeds;
}

/** 运行时缓存的种子列表，由 getKeywords() 和 buildSeeds() 生成 */
let _cachedSeeds: TieredSeed[] | null = null;

function getSeeds(): TieredSeed[] {
  if (!_cachedSeeds) {
    _cachedSeeds = buildSeeds(getKeywords());
  }
  return _cachedSeeds;
}

// ---------------------------------------------------------------------------
// Scheduled task: Daily re-crawl (2 AM)
// TIER_1 → priority=1, maxPages=100; TIER_2 → priority=3, maxPages=50
// ---------------------------------------------------------------------------
async function runDailyCrawl(): Promise<void> {
  const taskName = 'daily-crawl';
  const keywords = getKeywords();
  logger.info({ keywords }, 'Starting daily tiered crawl');

  await runScheduledTask(taskName, async () => {
    const seedGroups = getSeeds();

    for (const seedGroup of seedGroups) {
      if (seedGroup.seeds.length === 0) continue;

      const isTier1 = seedGroup.tier === 'TIER_1_OFFICIAL';
      const isTier2 = seedGroup.tier === 'TIER_2_ACADEMIC';

      await crawlQueue.add(`daily-${seedGroup.sourceType}-${seedGroup.tier}`, {
        seeds: seedGroup.seeds,
        sourceType: seedGroup.sourceType,
        tier: seedGroup.tier,
        maxPagesPerSeed: isTier1 ? 100 : isTier2 ? 50 : 30,
        depth: 2,
      }, {
        priority: isTier1 ? 1 : isTier2 ? 3 : 5,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Scheduled task: Re-extraction (4 AM)
// ---------------------------------------------------------------------------
async function runReExtraction(): Promise<void> {
  const taskName = 're-extraction';
  logger.info('Starting re-extraction...');

  await runScheduledTask(taskName, async () => {
    const jobCounts = await extractQueue.getJobCounts();
    logger.info({ jobCounts }, 'Extract queue status');
  });
}

// ---------------------------------------------------------------------------
// Scheduled task: Graph update (6 AM)
// ---------------------------------------------------------------------------
async function runGraphUpdate(): Promise<void> {
  const taskName = 'graph-update';
  logger.info('Starting graph update...');

  await runScheduledTask(taskName, async () => {
    await buildGraphQueue.add('scheduled-graph-update', {
      entities: [], relationships: [], timelineEvents: [], fullBuild: true,
    }, { priority: 5, removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } });
  });
}

// ---------------------------------------------------------------------------
// Scheduled task: Weekly discovery (Sunday 12 PM)
// ---------------------------------------------------------------------------
async function runWeeklyDiscovery(): Promise<void> {
  const taskName = 'weekly-discovery';
  const keywords = getKeywords();
  logger.info({ keywords }, 'Starting weekly discovery');

  await runScheduledTask(taskName, async () => {
    // arXiv 引用网络发现
    await discoveryQueue.add('weekly-discovery-arxiv', {
      method: 'citation-graph',
      sources: ['arxiv', 'crossref'],
      queries: keywords,
      maxNewNodes: 200,
      minConfidence: 0.7,
    }, { priority: 1, removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } });

    // Web 搜索发现
    await discoveryQueue.add('weekly-discovery-web', {
      method: 'web-search',
      sources: ['google-scholar', 'researchgate'],
      queries: keywords.map(k => `${k} research group latest`),
      maxNewNodes: 100,
      minConfidence: 0.6,
    }, { priority: 2, removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } });
  });
}

// ---------------------------------------------------------------------------
// Scheduled task: Validate graph consistency (daily at 7 AM)
// ---------------------------------------------------------------------------
async function runValidation(): Promise<void> {
  const taskName = 'graph-validation';
  logger.info('Starting graph validation...');

  await runScheduledTask(taskName, async () => {
    await validateQueue.add('daily-validation', {
      checks: ['orphan-nodes', 'broken-relationships', 'inconsistent-timeline', 'duplicate-entities', 'confidence-threshold'],
      autoRepair: true, reportDestination: 'slack',
    }, { priority: 1, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } });
  });
}

// ---------------------------------------------------------------------------
// Scheduled task: Auto seed discovery (Monday 3AM)
// 从图谱中自动发现高影响力但缺少完整信息的研究者 → 加入种子队列
// ---------------------------------------------------------------------------
async function runAutoSeedFinder(): Promise<void> {
  const taskName = 'auto-seed-finder';
  logger.info('Starting auto seed discovery...');

  await runScheduledTask(taskName, async () => {
    // 发现缺少 homepage/ORCID 的高引用研究者
    const candidates: { name: string; uuid: string; totalCitations: number }[] = [];
    try {
      // 简化版: 通过 Neo4j Cypher 发现 (如果是完整实现则通过 CitationAnalyzer)
      // 此处通过 crawl queue 触发发现作业
      await discoveryQueue.add('auto-seed-discovery', {
        method: 'citation-graph',
        sources: ['semantic-scholar'],
        maxNewNodes: 50,
        minConfidence: 0.6,
        queries: ['highly cited researcher'], // S2 会按引用排序
      }, { priority: 3, removeOnComplete: { count: 20 }, removeOnFail: { count: 20 } });

      logger.info({ candidatesFound: candidates.length }, 'Auto seed candidates discovered');
    } catch (err: any) {
      logger.warn(`Auto seed discovery failed: ${err.message}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Cron schedule definitions
// ---------------------------------------------------------------------------
interface CronEntry {
  cron: string;
  name: string;
  handler: () => Promise<void>;
}

const schedules: CronEntry[] = [
  { cron: '0 2 * * *',    name: 'daily-crawl',        handler: runDailyCrawl },
  { cron: '0 4 * * *',    name: 're-extraction',      handler: runReExtraction },
  { cron: '0 6 * * *',    name: 'graph-update',       handler: runGraphUpdate },
  { cron: '0 7 * * *',    name: 'graph-validation',   handler: runValidation },
  { cron: '0 12 * * 0',   name: 'weekly-discovery',   handler: runWeeklyDiscovery }, // Sunday noon
  { cron: '0 3 * * 1',    name: 'auto-seed-finder',    handler: runAutoSeedFinder },  // Monday 3AM
];

// ---------------------------------------------------------------------------
// Service entry point
// ---------------------------------------------------------------------------
async function main() {
  logger.info('ARP Scheduler service starting...');

  // Verify Redis connectivity
  try {
    await connection.ping();
    logger.info('Redis connection verified');
  } catch (err: any) {
    logger.fatal({ err: err.message }, 'Redis is not reachable — exiting');
    process.exit(1);
  }

  // Register all cron jobs
  for (const { cron: cronExpr, name, handler } of schedules) {
    const task = cron.schedule(cronExpr, async () => {
      logger.info({ task: name, cron: cronExpr }, 'Cron triggered');
      try {
        await handler();
      } catch (err: any) {
        logger.error({ task: name, err }, 'Scheduled task threw unhandled error');
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ ?? 'UTC',
    });

    logger.info({ task: name, cron: cronExpr }, 'Cron job registered');
  }

  // Run daily crawl immediately on startup (optional — controlled by env)
  if (process.env.RUN_ON_STARTUP === 'true') {
    logger.info('Running daily crawl on startup...');
    await runDailyCrawl();
  }

  logger.info('ARP Scheduler service ready');

  // Health check endpoint via simple HTTP (optional, for k8s liveness probes)
  if (process.env.HEALTH_PORT) {
    const http = await import('node:http');
    const healthPort = Number(process.env.HEALTH_PORT) || 3005;
    http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        tasks: Object.fromEntries(
          Array.from(taskHistory.entries()).map(([name, history]) => [
            name,
            history[history.length - 1],
          ]),
        ),
      }));
    }).listen(healthPort, () => {
      logger.info({ port: healthPort }, 'Health check server listening');
    });
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down scheduler...');
    // node-cron tasks are automatically destroyed on process exit
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Scheduler service crashed');
  process.exit(1);
});
