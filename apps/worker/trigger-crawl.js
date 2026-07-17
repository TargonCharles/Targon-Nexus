const { Queue } = require('bullmq');
const Redis = require('ioredis');
const conn = new Redis('redis://:redispass@localhost:6379');

async function main() {
  const q = new Queue('crawl', { connection: conn });
  const job = await q.add('fresh-test', {
    seeds: ['https://physics.stanford.edu/people/faculty'],
    sourceType: 'institutional',
    tier: 'TIER_1_OFFICIAL',
    maxPagesPerSeed: 1,
    depth: 1
  }, { priority: 1 });
  console.log('Job', job.id, 'enqueued');
  await q.close();
  conn.quit();
}
main().catch(e => { console.error(e.message); conn.quit(); });
