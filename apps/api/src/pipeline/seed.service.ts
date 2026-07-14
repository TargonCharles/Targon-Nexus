// ===========================================================================
// SeedService — 种子数据导入逻辑（从 PipelineController 下沉）
//
// 职责：
//   1. 路径安全校验（防目录遍历攻击）
//   2. 读取 Cypher 种子文件
//   3. 分割并逐条执行 Cypher 语句
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { promises as fsp } from 'fs';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { Neo4jService } from '../neo4j/neo4j.service';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  /** 允许的种子文件基础目录 */
  private readonly ALLOWED_DIR = resolve('graph/cypher');

  /** 默认种子文件 */
  private readonly DEFAULT_SEED_FILE = resolve('graph/cypher/seed-arpes-community.cypher');

  constructor(private readonly neo4j: Neo4jService) {}

  /** 导入种子数据 */
  async seed(seedFile?: string): Promise<{ statements: number; errors: number }> {
    const filePath = seedFile ? resolve(seedFile) : this.DEFAULT_SEED_FILE;

    // 路径安全校验
    if (!filePath.startsWith(this.ALLOWED_DIR)) {
      throw new Error(`Seed file path not allowed: ${filePath}`);
    }

    if (!existsSync(filePath)) {
      throw new Error(`Seed file not found: ${filePath}`);
    }

    const cypher = await fsp.readFile(filePath, 'utf-8');
    const stmts = cypher
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('//'));

    let errors = 0;
    for (const stmt of stmts) {
      try {
        await this.neo4j.write(stmt + ';');
      } catch (err: any) {
        this.logger.warn(`Seed statement failed: ${stmt.substring(0, 80)}... — ${err.message}`);
        errors++;
      }
    }

    return { statements: stmts.length - errors, errors };
  }
}
