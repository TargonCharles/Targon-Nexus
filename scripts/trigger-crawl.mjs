// Trigger a real crawl job
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const conn = new Redis('redis://localhost:6379');
const q = new Queue('crawl', { connection: conn });

const job = await q.add('manual-live-test', {
  seeds: ['https://physics.stanford.edu/people/faculty'],
  sourceType: 'institutional',
  tier: 'TIER_1_OFFICIAL',
  maxPagesPerSeed: 3,
  depth: 1
}, { priority: 1 });

console.log('Crawl job enqueued:', job.id);
await q.close();
conn.quit();
