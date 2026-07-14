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

// ---------------------------------------------------------------------------
// Seed sources — known ARPES labs, institutions, and researchers
// ---------------------------------------------------------------------------
const ARPES_SEEDS: Record<SourceType, string[]> = {
  'lab-homepage': [
    'https://www.phas.ubc.ca/arpes',
    'https://www.stanford.edu/group/topological-materials/',
    'https://www.phas.ubc.ca/~quantmat/',
  ],
  'personal-homepage': [
    'https://physics.stanford.edu/people/faculty/zhi-xun-shen',
    'https://www.phas.ubc.ca/users/andrea-damascelli',
  ],
  'arxiv': [
    'ARPES',
    'angle-resolved photoemission',
    'topological insulator ARPES',
    'high-Tc superconductor ARPES',
  ],
  'google-scholar': [],
  'institutional': [],
  'conference': [],
  'journal': [],
  'custom': [],
};

// ---------------------------------------------------------------------------
// Scheduled task: Daily re-crawl (2 AM)
// ---------------------------------------------------------------------------
async function runDailyCrawl(): Promise<void> {
  const taskName = 'daily-crawl';
  logger.info('Starting daily re-crawl...');

  const startTime = Date.now();

  try {
    // Crawl known lab homepages
    const labSeeds = ARPES_SEEDS['lab-homepage'];
    if (labSeeds.length > 0) {
      await crawlQueue.add(
        'daily-crawl-labs',
        {
          seeds: labSeeds,
          sourceType: 'lab-homepage',
          maxPagesPerSeed: 50,
          depth: 2,
        },
        {
          priority: 2,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      );
    }

    // Crawl arXiv for new papers
    const arxivSeeds = ARPES_SEEDS['arxiv'];
    if (arxivSeeds.length > 0) {
      await crawlQueue.add(
        'daily-crawl-arxiv',
        {
          seeds: arxivSeeds,
          sourceType: 'arxiv',
          maxPagesPerSeed: 30,
          depth: 1,
        },
        {
          priority: 3,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 100 },
        },
      );
    }

    const duration = Date.now() - startTime;
    recordTask(taskName, {
      taskName,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: duration,
    });

    logger.info({ durationMs: duration }, 'Daily re-crawl dispatched');
  } catch (err: any) {
    logger.error({ err }, 'Daily re-crawl failed');
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
// Scheduled task: Re-extraction (4 AM)
// ---------------------------------------------------------------------------
async function runReExtraction(): Promise<void> {
  const taskName = 're-extraction';
  logger.info('Starting re-extraction...');

  const startTime = Date.now();

  try {
    // Pull pages that haven't been extracted yet from the parse queue
    // In production this would query the DB for delta pages since last extraction
    const jobCounts = await extractQueue.getJobCounts();
    logger.info({ jobCounts }, 'Extract queue status');

    recordTask(taskName, {
      taskName,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      metadata: { waitingJobs: jobCounts.waiting },
    });
  } catch (err: any) {
    logger.error({ err }, 'Re-extraction failed');
    recordTask(taskName, {
      taskName,
      status: 'failed',
      startedAt: new Date(startTime).toISOString(),
      error: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Scheduled task: Graph update (6 AM)
// ---------------------------------------------------------------------------
async function runGraphUpdate(): Promise<void> {
  const taskName = 'graph-update';
  logger.info('Starting graph update...');

  const startTime = Date.now();

  try {
    // Trigger a global graph rebuild with all resolved entities
    await buildGraphQueue.add(
      'scheduled-graph-update',
      {
        entities: [], // Would be populated from resolve queue results
        relationships: [],
        timelineEvents: [],
        fullBuild: true,
      },
      {
        priority: 5,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    );

    const duration = Date.now() - startTime;
    recordTask(taskName, {
      taskName,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: duration,
    });

    logger.info({ durationMs: duration }, 'Graph update dispatched');
  } catch (err: any) {
    logger.error({ err }, 'Graph update failed');
    recordTask(taskName, {
      taskName,
      status: 'failed',
      startedAt: new Date(startTime).toISOString(),
      error: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Scheduled task: Weekly discovery (Sunday 12 PM)
// ---------------------------------------------------------------------------
async function runWeeklyDiscovery(): Promise<void> {
  const taskName = 'weekly-discovery';
  logger.info('Starting weekly discovery...');

  const startTime = Date.now();

  try {
    await discoveryQueue.add(
      'weekly-discovery',
      {
        method: 'citation-graph',
        sources: ['arxiv', 'crossref', 'dblp'],
        maxNewNodes: 200,
        minConfidence: 0.7,
      },
      {
        priority: 1,
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );

    await discoveryQueue.add(
      'weekly-discovery-web',
      {
        method: 'web-search',
        sources: ['google-scholar', 'researchgate'],
        queries: [
          'ARPES angle-resolved photoemission spectroscopy 2025',
          'ARPES lab new group',
          'ARPES topological materials',
        ],
        maxNewNodes: 100,
        minConfidence: 0.6,
      },
      {
        priority: 2,
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 20 },
      },
    );

    const duration = Date.now() - startTime;
    recordTask(taskName, {
      taskName,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: duration,
    });

    logger.info({ durationMs: duration }, 'Weekly discovery dispatched');
  } catch (err: any) {
    logger.error({ err }, 'Weekly discovery failed');
    recordTask(taskName, {
      taskName,
      status: 'failed',
      startedAt: new Date(startTime).toISOString(),
      error: err.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Scheduled task: Validate graph consistency (daily at 7 AM)
// ---------------------------------------------------------------------------
async function runValidation(): Promise<void> {
  const taskName = 'graph-validation';
  logger.info('Starting graph validation...');

  const startTime = Date.now();

  try {
    await validateQueue.add(
      'daily-validation',
      {
        checks: [
          'orphan-nodes',
          'broken-relationships',
          'inconsistent-timeline',
          'duplicate-entities',
          'confidence-threshold',
        ],
        autoRepair: true,
        reportDestination: 'slack',
      },
      {
        priority: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );

    const duration = Date.now() - startTime;
    recordTask(taskName, {
      taskName,
      status: 'completed',
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: duration,
    });

    logger.info({ durationMs: duration }, 'Graph validation dispatched');
  } catch (err: any) {
    logger.error({ err }, 'Graph validation failed');
  }
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
