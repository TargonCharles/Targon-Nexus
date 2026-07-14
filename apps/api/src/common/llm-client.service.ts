// ===========================================================================
// LlmClientService — 统一的 LLM 调用抽象
//
// 封装 OpenAI 兼容客户端的创建和调用，提供:
//   - API key / base URL / model 的集中管理
//   - JSON 模式的提取调用
//   - 回退到启发式提取
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';

export interface LlmConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class LlmClientService {
  private readonly logger = new Logger(LlmClientService.name);

  private get apiKey(): string | undefined {
    return process.env.LLM_API_KEY;
  }

  private get baseUrl(): string {
    return process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1';
  }

  private get defaultModel(): string {
    return process.env.LLM_MODEL ?? 'gpt-4o-mini';
  }

  /** 检查 LLM 是否可用 */
  isAvailable(): boolean {
    const key = this.apiKey;
    return !!key && key !== 'sk-local' && key !== 'sk-your-api-key-here';
  }

  /** 创建 OpenAI 兼容客户端 */
  private async createClient(): Promise<any> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new Error('LLM_API_KEY not configured');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI: any = require('openai');
    return new (OpenAI.default ?? OpenAI)({
      apiKey,
      baseURL: this.baseUrl,
    });
  }

  /**
   * 调用 LLM 完成一次对话。
   *
   * @param messages — 对话消息列表
   * @param config   — 模型 / 温度 / token 限制
   * @returns 模型返回的文本内容
   */
  async complete(
    messages: LlmMessage[],
    config: LlmConfig = {},
  ): Promise<string> {
    const client = await this.createClient();
    const resp = await client.chat.completions.create({
      model: config.model ?? this.defaultModel,
      temperature: config.temperature ?? 0.1,
      max_tokens: config.maxTokens ?? 2000,
      messages,
    });

    return resp.choices[0]?.message?.content ?? '';
  }
}
