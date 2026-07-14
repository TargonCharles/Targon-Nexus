// ===========================================================================
// LockService — 分布式锁抽象
//
// 默认使用进程内互斥锁（单实例部署），可切换为 Redis 锁（多实例）。
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';

export interface ILock {
  /** 释放锁 */
  release(): Promise<void>;
}

@Injectable()
export class LockService {
  private readonly logger = new Logger(LockService.name);
  private readonly locks = new Map<string, boolean>();

  /**
   * 尝试获取锁。
   *
   * @param key      — 锁的标识符
   * @param ttlMs    — 锁的自动过期时间（毫秒），仅 Redis 模式生效
   * @returns 锁句柄，获取失败返回 null
   */
  async acquire(key: string, ttlMs: number = 300_000): Promise<ILock | null> {
    // 进程内实现（TODOnext: 切换到 Redis SETNX + PEXPIRE）
    if (this.locks.get(key)) {
      this.logger.warn(`Lock "${key}" already held`);
      return null;
    }

    this.locks.set(key, true);
    this.logger.debug(`Lock acquired: "${key}"`);

    return {
      release: async () => {
        this.locks.delete(key);
        this.logger.debug(`Lock released: "${key}"`);
      },
    };
  }

  /**
   * 在锁保护下执行回调。
   *
   * @param key  — 锁标识符
   * @param fn   — 受保护的回调
   * @param ttlMs— 锁超时（毫秒）
   * @returns 回调的返回值；若无法获取锁，返回 null
   */
  async withLock<T>(key: string, fn: () => Promise<T>, ttlMs?: number): Promise<T | null> {
    const lock = await this.acquire(key, ttlMs);
    if (!lock) return null;

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  /** 当前锁的活跃数量 */
  get activeCount(): number {
    return this.locks.size;
  }
}
