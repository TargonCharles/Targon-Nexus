import { Worker, Queue, Job, MetricsTime } from 'bullmq';
import type {
  CrawlJob,
  ParseJob,
  ExtractJob,
  ResolveJob,
  BuildGraphJob,
  ValidateJob,
  JobResult,
  DeadLetterJob,
} from '@arp/types';
import { createLogger, createRedisConnection } from '@arp/shared';

const logger = createLogger('worker');

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------
const connection = createRedisConnection();

// Dead-letter queue for jobs that exhaust retries
const deadLetterQueue = new Queue<DeadLetterJob>('dead-letter', { connection });

// ---------------------------------------------------------------------------
// Lazy-load real service modules (dynamic imports).
// Falls back to stub when the service package is not installed or when
// RUN_MODE=stub is set — useful for development and testing.
// ---------------------------------------------------------------------------

const RUN_MODE = process.env.WORKER_RUN_MODE ?? 'live';

// Singleton Neo4j driver — created once and reused across all validate jobs
let _neo4jDriver: any = null;
async function getNeo4jDriver(): Promise<any> {
  if (_neo4jDriver) return _neo4jDriver;
  const neo4j = await import('neo4j-driver');
  const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? 'password';
  _neo4jDriver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 5,
  });
  logger.info('Neo4j driver initialized (singleton)');
  return _neo4jDriver;
}

/** 包装器：在 stub 模式下跳过实际执行，直接返回成功 */
function withStubFallback<T extends JobResult>(
  type: string,
  job: Job,
  stubResult: () => T,
  realHandler: () => Promise<T>,
): Promise<T> {
  if (RUN_MODE === 'stub') {
    return job.updateProgress(100).then(() => stubResult());
  }
  return realHandler();
}

async function handleCrawl(job: Job<CrawlJob>): Promise<JobResult> {
  logger.info({ jobId: job.id, seeds: job.data.seeds.length }, 'Processing crawl job');
  await job.updateProgress(10);

  if (RUN_MODE === 'stub') {
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'crawl',
      status: 'completed',
      result: { seeds: job.data.seeds.length, sourceType: job.data.sourceType },
    };
  }

  try {
    const { runCrawl } = await import('@arp/crawler');
    const result = await runCrawl(job);
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'crawl',
      status: result.status === 'completed' ? 'completed' : 'failed',
      result,
    };
  } catch (err: any) {
    logger.error({ jobId: job.id, err: err.message }, 'Crawl handler failed');
    throw err;
  }
}

async function handleParse(job: Job<ParseJob>): Promise<JobResult> {
  logger.info({ jobId: job.id, pages: job.data.pages?.length }, 'Processing parse job');

  if (RUN_MODE === 'stub') {
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'parse',
      status: 'completed',
      result: { pageCount: job.data.pages?.length ?? 0 },
    };
  }

  // Parse is part of the crawler pipeline
  try {
    const crawler = await import('@arp/crawler');
    // In practice, the crawler's parse step is invoked via its own queue;
    // the worker orchestrator routes parsed pages directly to extraction.
    // Here we pass through to the extract queue.
    const { Queue } = await import('bullmq');
    const extractQueue = new Queue<ExtractJob>('extract', { connection });
    await extractQueue.add('parse-result', {
      pages: job.data.pages.map((p) => ({
        url: p.url,
        textContent: p.textContent,
        metadata: p.metadata,
      })),
    });
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'parse',
      status: 'completed',
      result: { pageCount: job.data.pages?.length ?? 0 },
    };
  } catch (err: any) {
    logger.error({ jobId: job.id, err: err.message }, 'Parse handler failed');
    throw err;
  }
}

async function handleExtract(job: Job<ExtractJob>): Promise<JobResult> {
  logger.info({ jobId: job.id, pages: job.data.pages.length }, 'Processing extract job');

  if (RUN_MODE === 'stub') {
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'extract',
      status: 'completed',
      result: { pageCount: job.data.pages.length },
    };
  }

  try {
    const { extractBatch } = await import('@arp/extractor');
    await job.updateProgress(10);
    const results = await extractBatch(job.data.pages);
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'extract',
      status: 'completed',
      result: {
        pageCount: job.data.pages.length,
        entityCount: results.reduce((sum, r) => sum + r.entities.length, 0),
        relationshipCount: results.reduce((sum, r) => sum + r.relationships.length, 0),
      },
    };
  } catch (err: any) {
    logger.error({ jobId: job.id, err: err.message }, 'Extract handler failed');
    throw err;
  }
}

async function handleResolve(job: Job<ResolveJob>): Promise<JobResult> {
  logger.info(
    { jobId: job.id, entities: job.data.entities.length },
    'Processing resolve job',
  );

  if (RUN_MODE === 'stub') {
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'resolve',
      status: 'completed',
      result: { entityCount: job.data.entities.length },
    };
  }

  // Resolve is part of the extractor pipeline; forward to graph-builder
  try {
    const { Queue } = await import('bullmq');
    const buildQueue = new Queue<BuildGraphJob>('build-graph', { connection });
    await buildQueue.add('resolved-entities', {
      entities: job.data.entities,
      relationships: job.data.relationships,
      timelineEvents: [],
    });
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'resolve',
      status: 'completed',
      result: { entityCount: job.data.entities.length },
    };
  } catch (err: any) {
    logger.error({ jobId: job.id, err: err.message }, 'Resolve handler failed');
    throw err;
  }
}

async function handleBuildGraph(job: Job<BuildGraphJob>): Promise<JobResult> {
  logger.info(
    { jobId: job.id, entities: job.data.entities.length, fullBuild: job.data.fullBuild },
    'Processing build-graph job',
  );

  if (RUN_MODE === 'stub') {
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'build-graph',
      status: 'completed',
      result: { entityCount: job.data.entities.length },
    };
  }

  try {
    const { buildGraph } = await import('@arp/graph-builder');
    const result = await buildGraph(job);
    await job.updateProgress(100);
    return {
      jobId: job.id!,
      type: 'build-graph',
      status: result.status === 'completed' ? 'completed' : 'failed',
      result,
    };
  } catch (err: any) {
    logger.error({ jobId: job.id, err: err.message }, 'BuildGraph handler failed');
    throw err;
  }
}

async function handleValidate(job: Job<ValidateJob>): Promise<JobResult> {
  logger.info(
    { jobId: job.id, checks: job.data.checks },
    'Processing validate job',
  );

  // Reuse singleton Neo4j driver instead of creating a new one per job
  try {
    const driver = await getNeo4jDriver();
    const session = driver.session();
    const results: Record<string, { passed: boolean; issues: number; detail?: string }> = {};

    try {
      for (const check of job.data.checks) {
        switch (check) {
          case 'orphan-nodes': {
            const r = await session.run(
              `MATCH (n) WHERE NOT (n)--() RETURN count(n) AS orphans`
            );
            const count = r.records[0]?.get('orphans').toNumber() ?? 0;
            results[check] = { passed: count === 0, issues: count };
            break;
          }
          case 'broken-relationships': {
            const r = await session.run(
              `MATCH ()-[rel]->() WHERE rel.confidence IS NULL OR rel.confidence < 0 RETURN count(rel) AS broken`
            );
            const count = r.records[0]?.get('broken').toNumber() ?? 0;
            results[check] = { passed: count === 0, issues: count };
            break;
          }
          case 'inconsistent-timeline': {
            const r = await session.run(
              `MATCH (e:TimelineEvent) WHERE e.date IS NULL OR e.date = '' RETURN count(e) AS inconsistent`
            );
            const count = r.records[0]?.get('inconsistent').toNumber() ?? 0;
            results[check] = { passed: count === 0, issues: count };
            break;
          }
          case 'duplicate-entities': {
            const r = await session.run(
              `MATCH (n:Person) WITH n.name AS name, collect(n.uuid) AS ids, count(*) AS cnt WHERE cnt > 1 RETURN count(*) AS dupes`
            );
            const count = r.records[0]?.get('dupes').toNumber() ?? 0;
            results[check] = { passed: count === 0, issues: count };
            break;
          }
          case 'confidence-threshold': {
            const r = await session.run(
              `MATCH (n) WHERE n.confidence IS NOT NULL AND n.confidence < 0.3 RETURN count(n) AS lowConf`
            );
            const count = r.records[0]?.get('lowConf').toNumber() ?? 0;
            results[check] = { passed: count === 0, issues: count };
            break;
          }
          default:
            results[check] = { passed: true, issues: 0, detail: 'Unknown check — skipped' };
        }
      }
    } finally {
      await session.close();
    }

    return {
      jobId: job.id!,
      type: 'validate',
      status: 'completed',
      result: { checks: results, autoRepair: job.data.autoRepair },
    };
  } catch (err: any) {
    logger.error({ jobId: job.id, err: err.message }, 'Validate handler failed');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Job handler registry
// ---------------------------------------------------------------------------
const HANDLERS: Record<string, (job: Job<any>) => Promise<JobResult>> = {
  'crawl':       handleCrawl,
  'parse':       handleParse,
  'extract':     handleExtract,
  'resolve':     handleResolve,
  'build-graph': handleBuildGraph,
  'validate':    handleValidate,
};

// ---------------------------------------------------------------------------
// Dead-letter handler
// ---------------------------------------------------------------------------
async function enqueueDeadLetter(job: Job<any>, finalError: Error): Promise<void> {
  const deadJob: DeadLetterJob = {
    originalJobId: job.id!,
    originalQueue: job.queueName,
    originalData: job.data,
    error: finalError.message,
    stack: finalError.stack,
    failedAt: new Date().toISOString(),
    attemptsMade: job.attemptsMade,
  };

  await deadLetterQueue.add(`dlq-${job.id}`, deadJob, {
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 100 },
  });

  logger.error(
    { originalJobId: job.id, queue: job.queueName, attempts: job.attemptsMade },
    'Job moved to dead-letter queue',
  );
}

// ---------------------------------------------------------------------------
// Common worker options
// ---------------------------------------------------------------------------
const defaultWorkerOpts = {
  connection,
  concurrency: 4,
  metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { count: 500, age: 7 * 24 * 3600 },
  removeOnFail: { count: 500, age: 7 * 24 * 3600 },
};

// ---------------------------------------------------------------------------
// Create workers for each queue type
// ---------------------------------------------------------------------------
function createTypedWorker<T>(
  queueName: string,
  handler: (job: Job<T>) => Promise<JobResult>,
  extraOpts: Record<string, any> = {},
): Worker<T> {
  const worker = new Worker<T>(
    queueName,
    async (job) => {
      logger.info(
        { queue: queueName, jobId: job.id, attempt: job.attemptsMade + 1 },
        'Job started',
      );

      try {
        const result = await handler(job);
        logger.info(
          { queue: queueName, jobId: job.id, status: result.status },
          'Job completed',
        );
        return result;
      } catch (err: any) {
        if (job.attemptsMade >= (job.opts?.attempts ?? 3) - 1) {
          await enqueueDeadLetter(job, err);
        }
        throw err;
      }
    },
    { ...defaultWorkerOpts, ...extraOpts },
  );

  worker.on('completed', (job) => {
    logger.debug({ queue: queueName, jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    const attemptsLeft = (job?.opts?.attempts ?? 3) - (job?.attemptsMade ?? 0);
    logger.warn(
      { queue: queueName, jobId: job?.id, attemptsLeft, err: err.message },
      'Job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ queue: queueName, err: err.message }, 'Worker error');
  });

  return worker;
}

// ---------------------------------------------------------------------------
// Service entry point
// ---------------------------------------------------------------------------
async function main() {
  logger.info('ARP Worker service starting...');
  logger.info({ runMode: RUN_MODE }, 'Worker run mode');

  try {
    await connection.ping();
    logger.info('Redis connection verified');
  } catch (err: any) {
    logger.fatal({ err: err.message }, 'Redis is not reachable — exiting');
    process.exit(1);
  }

  const workers: Worker[] = [];

  workers.push(createTypedWorker<CrawlJob>('crawl', handleCrawl, { concurrency: 2 }));
  workers.push(createTypedWorker<ParseJob>('parse', handleParse, { concurrency: 4 }));
  workers.push(createTypedWorker<ExtractJob>('extract', handleExtract, { concurrency: 1 }));
  workers.push(createTypedWorker<ResolveJob>('resolve', handleResolve, { concurrency: 2 }));
  workers.push(createTypedWorker<BuildGraphJob>('build-graph', handleBuildGraph, { concurrency: 2 }));
  workers.push(createTypedWorker<ValidateJob>('validate', handleValidate, { concurrency: 2 }));

  const dlqWorker = new Worker<DeadLetterJob>(
    'dead-letter',
    async (job) => {
      logger.error(
        {
          originalJobId: job.data.originalJobId,
          originalQueue: job.data.originalQueue,
          error: job.data.error,
          attempts: job.data.attemptsMade,
        },
        'DEAD LETTER — job exhausted all retries',
      );
      return { logged: true };
    },
    { connection, attempts: 1, removeOnComplete: { count: 200 } },
  );
  workers.push(dlqWorker);

  logger.info(
    { queueCount: workers.length, queues: workers.map((w) => w.name) },
    'ARP Worker service ready — processing jobs',
  );

  const shutdown = async () => {
    logger.info('Shutting down worker...');
    const closePromises = workers.map((w) => w.close());
    await Promise.all(closePromises);
    await connection.quit();
    logger.info('Worker shut down complete');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Worker service crashed');
  process.exit(1);
});
