// =============================================================================
// LLMCostOptimizer — LLM 成本优化
//
// 策略:
//   1. 提取结果缓存 (内容hash → 结果, 避免重复 LLM 调用)
//   2. 模型分级 (简单页面用 cheap model, 复杂页面用 powerful model)
//   3. 批处理合并 (攒够 N 个页面一起调 LLM)
//   4. Token 统计 & 成本估算
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface LLMCallRecord {
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  pageUrl: string;
  timestamp: string;
}

export interface CostReport {
  today: { calls: number; tokens: number; costUsd: number };
  thisMonth: { calls: number; tokens: number; costUsd: number };
  cachedHits: number;
  cacheHitRate: number;
}

// 各模型每 1M token 价格 (2024 基准)
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o':          { input: 2.50, output: 10.00 },
  'gpt-4o-mini':     { input: 0.15, output: 0.60 },
  'gpt-4-turbo':     { input: 10.00, output: 30.00 },
  'claude-3-opus':   { input: 15.00, output: 75.00 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-haiku':  { input: 0.25, output: 1.25 },
  'deepseek-chat':   { input: 0.14, output: 0.28 },
};

@Injectable()
export class LLMCostOptimizerService {
  private readonly logger = new Logger(LLMCostOptimizerService.name);
  private readonly cache = new Map<string, { result: any; timestamp: number }>();
  private readonly callHistory: LLMCallRecord[] = [];
  private cachedHits = 0;
  private totalRequests = 0;

  /** 缓存 TTL (小时) */
  private readonly cacheTtlHours = 24;

  // -----------------------------------------------------------------------
  // 内容 hash → 缓存查找 (避免重复 LLM 调用)
  // -----------------------------------------------------------------------

  /** 对页面文本内容做 hash，查找是否已有提取结果 */
  cacheKey(textContent: string): string {
    return crypto.createHash('md5').update(textContent.substring(0, 2000)).digest('hex');
  }

  getCached(key: string): any | null {
    this.totalRequests++;
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTtlHours * 3600 * 1000) {
      this.cachedHits++;
      this.logger.debug(`Cache hit (${this.cachedHits}/${this.totalRequests})`);
      return entry.result;
    }
    return null;
  }

  setCache(key: string, result: any): void {
    this.cache.set(key, { result, timestamp: Date.now() });
    // 限制缓存大小
    if (this.cache.size > 2000) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
  }

  // -----------------------------------------------------------------------
  // 模型分级选择
  // -----------------------------------------------------------------------

  /**
   * 根据页面复杂度选择模型
   *   - 短文本 (<2000 chars) → cheap model (gpt-4o-mini / deepseek)
   *   - 中等文本 (2000-8000) → standard (gpt-4o)
   *   - 长文本/复杂页面 (>8000) → powerful (claude-3.5-sonnet)
   */
  selectModel(textLength: number, pageType: string): string {
    if (textLength < 2000) {
      return process.env.LLM_MODEL_CHEAP ?? 'deepseek-chat';  // ~$0.14/M input
    }
    if (textLength < 8000 && pageType !== 'faculty-directory') {
      return process.env.LLM_MODEL ?? 'gpt-4o-mini';  // ~$0.15/M input
    }
    return process.env.LLM_MODEL_POWERFUL ?? 'gpt-4o';  // ~$2.50/M input
  }

  // -----------------------------------------------------------------------
  // 成本记录
  // -----------------------------------------------------------------------

  recordCall(model: string, promptTokens: number, completionTokens: number, pageUrl: string): void {
    const price = MODEL_PRICES[model] ?? { input: 1, output: 3 };
    const cost = (promptTokens / 1_000_000) * price.input +
                 (completionTokens / 1_000_000) * price.output;

    this.callHistory.push({
      model, promptTokens, completionTokens,
      estimatedCostUsd: Math.round(cost * 10000) / 10000,
      pageUrl, timestamp: new Date().toISOString(),
    });

    // 只保留最近 30 天的记录
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    while (this.callHistory.length > 0 &&
           new Date(this.callHistory[0].timestamp).getTime() < cutoff) {
      this.callHistory.shift();
    }
  }

  // -----------------------------------------------------------------------
  // 成本报告
  // -----------------------------------------------------------------------

  getCostReport(): CostReport {
    const now = Date.now();
    const dayStart = now - 24 * 3600 * 1000;
    const monthStart = now - 30 * 24 * 3600 * 1000;

    const today = this.callHistory.filter(c => new Date(c.timestamp).getTime() > dayStart);
    const thisMonth = this.callHistory.filter(c => new Date(c.timestamp).getTime() > monthStart);

    return {
      today: {
        calls: today.length,
        tokens: today.reduce((s, c) => s + c.promptTokens + c.completionTokens, 0),
        costUsd: Math.round(today.reduce((s, c) => s + c.estimatedCostUsd, 0) * 100) / 100,
      },
      thisMonth: {
        calls: thisMonth.length,
        tokens: thisMonth.reduce((s, c) => s + c.promptTokens + c.completionTokens, 0),
        costUsd: Math.round(thisMonth.reduce((s, c) => s + c.estimatedCostUsd, 0) * 100) / 100,
      },
      cachedHits: this.cachedHits,
      cacheHitRate: this.totalRequests > 0
        ? Math.round((this.cachedHits / this.totalRequests) * 100)
        : 0,
    };
  }

  /** 估算单次调用成本 */
  estimateCost(model: string, estimatedInputTokens: number): number {
    const price = MODEL_PRICES[model] ?? { input: 1, output: 3 };
    const estOutput = estimatedInputTokens * 0.3; // 假设输出约为输入的 30%
    return (estimatedInputTokens / 1_000_000) * price.input +
           (estOutput / 1_000_000) * price.output;
  }
}
