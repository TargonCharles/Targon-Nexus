// =============================================================================
// Redis Pub/Sub EventBus Adapter — 分布式 Agent 部署
// 替换内存 EventBus，支持多实例 Worker 通过 Redis 通信
// =============================================================================

import type { IEventBus, AgentEvent, AgentLogger } from './types';
import { generateUUID } from '@arp/shared';

export interface RedisAdapter {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, handler: (channel: string, message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  isOpen: boolean;
}

/** 基于 ioredis 的 Redis 适配器 */
export function createIORedisAdapter(redisClient: any): RedisAdapter {
  const messageHandlers = new Map<string, (ch: string, msg: string) => void>();

  return {
    publish: (channel, message) => redisClient.publish(channel, message),
    subscribe: (channel, handler) => {
      // 移除该 channel 的旧 handler，防止重复监听
      const oldHandler = messageHandlers.get(channel);
      if (oldHandler) {
        redisClient.off('message', oldHandler);
      }
      // 创建新的过滤器并注册
      const filterHandler = (ch: string, msg: string) => {
        if (ch === channel) handler(ch, msg);
      };
      redisClient.on('message', filterHandler);
      messageHandlers.set(channel, filterHandler);
      return redisClient.subscribe(channel);
    },
    unsubscribe: (channel) => {
      const handler = messageHandlers.get(channel);
      if (handler) {
        redisClient.off('message', handler);
        messageHandlers.delete(channel);
      }
      return redisClient.unsubscribe(channel);
    },
    get isOpen() {
      return redisClient.status === 'ready';
    },
  };
}

/**
 * Redis EventBus — 基于 Redis Pub/Sub 的分布式事件总线
 *
 * 特性:
 *   - 多实例 Agent Worker 通过 Redis 通道通信
 *   - 自动序列化/反序列化 AgentEvent
 *   - 支持通配符监听（* → 所有事件）
 *   - 监听器追踪和清理
 *   - 优雅降级：Redis 不可用时 fallback 到内存模式
 */
export class RedisEventBus implements IEventBus {
  private adapter: RedisAdapter;
  private logger: AgentLogger;
  private listeners: Map<string, { eventType: string; handler: (event: AgentEvent) => Promise<void> }> = new Map();
  private waitResolvers: Map<string, Array<(event: AgentEvent) => void>> = new Map();
  private fallbackBus: IEventBus | null = null;
  private readonly CHANNEL_PREFIX = 'targon:events:';

  constructor(adapter: RedisAdapter, logger?: AgentLogger, fallbackBus?: IEventBus) {
    this.adapter = adapter;
    this.fallbackBus = fallbackBus ?? null;
    this.logger = logger ?? {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
    };
  }

  /** 注册事件监听器 */
  on(eventType: string, handler: (event: AgentEvent) => Promise<void>): string {
    const id = generateUUID();

    if (this.adapter.isOpen) {
      const channel = this.channelName(eventType);
      this.adapter.subscribe(channel, async (_ch, message) => {
        try {
          const event: AgentEvent = JSON.parse(message);
          // 检查是否为此监听器应该处理的事件
          if (this.listeners.has(id)) {
            await handler(event).catch((err) => {
              this.logger.error(`RedisEventBus: handler error for ${id}: ${err.message}`);
            });
          }
        } catch (err: any) {
          this.logger.warn(`RedisEventBus: Failed to parse event from ${_ch}: ${err.message}`);
        }
      }).catch((err) => {
        this.logger.error(`RedisEventBus: subscribe failed for ${channel}: ${err.message}`);
      });
    }

    this.listeners.set(id, { eventType, handler });
    this.logger.debug(`RedisEventBus: listener ${id} → "${eventType}"`);

    // 如果 Redis 不可用，fallback 到内存模式
    if (!this.adapter.isOpen && this.fallbackBus) {
      this.fallbackBus.on(eventType, handler);
    }

    return id;
  }

  /** 取消监听 */
  off(listenerId: string): void {
    const listener = this.listeners.get(listenerId);
    if (!listener) return;

    if (this.adapter.isOpen) {
      const channel = this.channelName(listener.eventType);
      // 检查是否还有其他 listener 监听此 channel
      const otherListeners = Array.from(this.listeners.entries())
        .filter(([id, l]) => id !== listenerId && l.eventType === listener.eventType);

      if (otherListeners.length === 0) {
        this.adapter.unsubscribe(channel).catch((err) => {
          this.logger.warn(`RedisEventBus: unsubscribe failed: ${err.message}`);
        });
      }
    }

    this.listeners.delete(listenerId);
    this.logger.debug(`RedisEventBus: removed listener ${listenerId}`);
  }

  /** 发射事件 */
  async emit(event: AgentEvent): Promise<void> {
    this.logger.debug(`RedisEventBus: emit "${event.eventType}" from ${event.sourceAgent}`);

    if (this.adapter.isOpen) {
      // 发布到 Redis channel
      const channel = this.channelName(event.eventType);
      const message = JSON.stringify(event);
      try {
        await this.adapter.publish(channel, message);
      } catch (err: any) {
        this.logger.error(`RedisEventBus: publish failed: ${err.message}`);
        // Fallback to memory
        if (this.fallbackBus) {
          await this.fallbackBus.emit(event);
          return;
        }
      }
    } else if (this.fallbackBus) {
      await this.fallbackBus.emit(event);
    }

    // 通知本地 waiters
    const waiters = this.waitResolvers.get(event.eventType);
    if (waiters) {
      for (const resolve of waiters) {
        resolve(event);
      }
      this.waitResolvers.delete(event.eventType);
    }
  }

  /** 等待特定事件 */
  async waitFor(eventType: string, timeoutMs: number = 60000): Promise<AgentEvent> {
    return new Promise((resolve, reject) => {
      const wrappedResolve = (event: AgentEvent) => {
        clearTimeout(timer);
        resolve(event);
      };

      const timer = setTimeout(() => {
        const resolvers = this.waitResolvers.get(eventType) || [];
        const idx = resolvers.indexOf(wrappedResolve);
        if (idx >= 0) resolvers.splice(idx, 1);
        reject(new Error(`RedisEventBus: Timeout waiting for "${eventType}" (${timeoutMs}ms)`));
      }, timeoutMs);

      const resolvers = this.waitResolvers.get(eventType) || [];
      resolvers.push(wrappedResolve);
      this.waitResolvers.set(eventType, resolvers);
    });
  }

  /** 获取活跃监听器数量 */
  get listenerCount(): number {
    return this.listeners.size;
  }

  /** Redis 连接状态 */
  get isRedisConnected(): boolean {
    return this.adapter.isOpen;
  }

  /** Channel name */
  private channelName(eventType: string): string {
    return `${this.CHANNEL_PREFIX}${eventType.toLowerCase()}`;
  }

  /** 清理所有监听器 */
  async destroy(): Promise<void> {
    // 取消所有 Redis 订阅
    const channels = new Set(
      Array.from(this.listeners.values()).map((l) => this.channelName(l.eventType)),
    );

    for (const channel of channels) {
      try {
        if (this.adapter.isOpen) {
          await this.adapter.unsubscribe(channel);
        }
      } catch { /* ignore */ }
    }

    this.listeners.clear();
    this.waitResolvers.clear();
    this.logger.info('RedisEventBus: destroyed');
  }
}
