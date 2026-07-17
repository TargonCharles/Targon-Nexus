// Shared Redis connection factory — eliminates duplicated boilerplate
// across all ARP microservices (crawler, extractor, graph-builder,
// scheduler, worker).
//
// Uses dynamic require for `ioredis` to avoid hard dependency in the
// shared package. The calling service must have ioredis installed.

export interface RedisConnectionOptions {
  url?: string;
  maxRetriesPerRequest?: number | null;
  enableOfflineQueue?: boolean;
  connectTimeout?: number;
}

export interface RedisConnection {
  quit(): Promise<void>;
  ping(): Promise<string>;
}

/**
 * Create a Redis connection with sensible defaults for BullMQ-based
 * microservices. Uses lazy require so the shared package stays zero-dep.
 *
 * Return type is compatible with BullMQ Queue/Worker connection parameter.
 *
 * @example
 *   const connection = createRedisConnection();
 *   const myQueue = new Queue('my-queue', { connection });
 */
export function createRedisConnection(
  opts: RedisConnectionOptions = {},
): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Redis = require('ioredis') as {
    default?: new (url: string, opts?: Record<string, unknown>) => any;
    new (url: string, opts?: Record<string, unknown>): any;
  };

  const RedisCtor =
    typeof Redis === 'function' ? Redis : (Redis as any).default ?? Redis;

  const url = opts.url ?? process.env.REDIS_URL ?? 'redis://:redispass@localhost:6379';
  const maxRetries = opts.maxRetriesPerRequest ?? null;

  return new RedisCtor(url, {
    maxRetriesPerRequest: maxRetries,
    enableOfflineQueue: opts.enableOfflineQueue ?? true,
    connectTimeout: opts.connectTimeout ?? 10000,
    lazyConnect: false,
  });
}
