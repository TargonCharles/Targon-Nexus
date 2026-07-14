// =============================================================================
// In-Memory Event Bus
// 所有 Agent 通过 Event Bus 通信，单向事件流，无循环依赖
// 后续可替换为 Redis Pub/Sub adapter
// =============================================================================

import type { IEventBus, AgentEvent, AgentLogger } from './types';
import { generateUUID } from '@arp/shared';

interface Listener {
  id: string;
  eventType: string;
  handler: (event: AgentEvent) => Promise<void>;
}

export class EventBus implements IEventBus {
  private listeners: Listener[] = [];
  private waitResolvers: Map<string, Array<(event: AgentEvent) => void>> = new Map();
  private logger: AgentLogger;

  constructor(logger?: AgentLogger) {
    this.logger = logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  /** 注册事件监听器，返回 listenerId 供取消注册 */
  on(eventType: string, handler: (event: AgentEvent) => Promise<void>): string {
    const id = generateUUID();
    this.listeners.push({ id, eventType, handler });
    this.logger.debug(`EventBus: registered listener ${id} for "${eventType}"`);
    return id;
  }

  /** 取消监听 */
  off(listenerId: string): void {
    const before = this.listeners.length;
    this.listeners = this.listeners.filter((l) => l.id !== listenerId);
    if (this.listeners.length < before) {
      this.logger.debug(`EventBus: removed listener ${listenerId}`);
    }
  }

  /** 发射事件 — 通知所有匹配的监听器 + 等待中的 waitFor */
  async emit(event: AgentEvent): Promise<void> {
    this.logger.debug(`EventBus: emit "${event.eventType}" from ${event.sourceAgent}`);

    // 通知 listeners
    const matching = this.listeners.filter((l) => l.eventType === event.eventType || l.eventType === '*');
    const results = await Promise.allSettled(
      matching.map((l) => l.handler(event).catch((err) => {
        this.logger.error(`EventBus: listener ${l.id} error: ${err.message}`);
      })),
    );

    // 通知 waiters
    const waiters = this.waitResolvers.get(event.eventType);
    if (waiters) {
      for (const resolve of waiters) {
        resolve(event);
      }
      this.waitResolvers.delete(event.eventType);
    }
  }

  /** 等待特定类型的事件（带超时） */
  async waitFor(eventType: string, timeoutMs: number = 60000): Promise<AgentEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // 清理 resolver
        const resolvers = this.waitResolvers.get(eventType) || [];
        const idx = resolvers.indexOf(resolve);
        if (idx >= 0) resolvers.splice(idx, 1);
        reject(new Error(`Timeout waiting for event "${eventType}" (${timeoutMs}ms)`));
      }, timeoutMs);

      const wrappedResolve = (event: AgentEvent) => {
        clearTimeout(timer);
        resolve(event);
      };

      const resolvers = this.waitResolvers.get(eventType) || [];
      resolvers.push(wrappedResolve);
      this.waitResolvers.set(eventType, resolvers);
    });
  }

  /** 获取活跃监听器数量 */
  get listenerCount(): number {
    return this.listeners.length;
  }
}
