// ===========================================================================
// HttpClientService — 统一的 HTTP 请求抽象
//
// 封装 fetch 调用，提供:
//   - 默认 User-Agent
//   - 超时控制
//   - 重试（指数退避）
//   - Content-Type 感知
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

const DEFAULT_UA = 'TargonNexus/1.5 (Academic Research; +https://targon-nexus.org)';

@Injectable()
export class HttpClientService {
  private readonly logger = new Logger(HttpClientService.name);

  /** 发起 HTTP GET 请求并返回文本 */
  async getText(url: string, opts: FetchOptions = {}): Promise<string> {
    const resp = await this.fetchWithRetry(url, opts);
    return resp.text();
  }

  /** 发起 HTTP GET 请求并返回 JSON */
  async getJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
    const resp = await this.fetchWithRetry(url, opts);
    return resp.json() as Promise<T>;
  }

  /** 基础的 fetch，带超时和 User-Agent */
  async fetch(url: string, opts: FetchOptions = {}): Promise<Response> {
    return this.fetchWithRetry(url, opts);
  }

  // -- Internal ------------------------------------------------------------

  private async fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
    const {
      timeoutMs = 30_000,
      retries = 1,
      retryDelayMs = 1000,
      ...init
    } = opts;

    const headers = new Headers(init.headers);
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', DEFAULT_UA);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const signal = init.signal ?? AbortSignal.timeout(timeoutMs);
        const resp = await fetch(url, { ...init, headers, signal });

        if (!resp.ok && attempt < retries && (resp.status >= 500 || resp.status === 429)) {
          this.logger.warn(`Fetch ${url} returned ${resp.status}, retry ${attempt + 1}/${retries}`);
          await this.sleep(retryDelayMs * Math.pow(2, attempt));
          continue;
        }

        return resp;
      } catch (err: any) {
        lastError = err;
        if (attempt < retries) {
          this.logger.warn(`Fetch ${url} failed: ${err.message}, retry ${attempt + 1}/${retries}`);
          await this.sleep(retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error(`Fetch failed: ${url}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
