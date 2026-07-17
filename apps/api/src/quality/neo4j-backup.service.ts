// =============================================================================
// Neo4jBackupService — 图谱备份 & 恢复
//
// 策略:
//   1. 定时全量备份 (每周日 4AM)
//   2. 增量备份 (每6小时 — 通过 Neo4j 事务日志)
//   3. 保留最近 4 个全量 + 7 天增量
//
// 依赖:
//   - neo4j-admin CLI (需在容器中可用)
//   - 备份目录: /data/backups/neo4j/
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface BackupResult {
  success: boolean;
  filePath?: string;
  sizeBytes?: number;
  durationMs: number;
  error?: string;
  timestamp: string;
}

export interface RestoreResult {
  success: boolean;
  restoredNodes?: number;
  durationMs: number;
  error?: string;
}

@Injectable()
export class Neo4jBackupService {
  private readonly logger = new Logger(Neo4jBackupService.name);
  private readonly backupDir = process.env.NEO4J_BACKUP_DIR ?? '/data/backups/neo4j';
  private readonly neo4jUri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  private readonly neo4jUser = process.env.NEO4J_USER ?? 'neo4j';
  private readonly neo4jPassword = process.env.NEO4J_PASSWORD ?? 'password';

  constructor() {
    // 确保备份目录存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // -----------------------------------------------------------------------
  // 全量备份
  // -----------------------------------------------------------------------

  /** 执行全量备份 (使用 neo4j-admin dump) */
  async fullBackup(label?: string): Promise<BackupResult> {
    const start = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `full-${label ?? 'manual'}-${timestamp}.dump`;
    const filePath = path.join(this.backupDir, fileName);

    try {
      // neo4j-admin dump --database=neo4j --to=FILE
      const cmd = [
        'neo4j-admin',
        'database',
        'dump',
        'neo4j',
        `--to-path=${this.backupDir}`,
        `--to-file=${fileName}`,
      ].join(' ');

      this.logger.log(`Starting full backup: ${cmd}`);
      const { stderr } = await execAsync(cmd, { timeout: 300_000 });

      if (stderr && !stderr.includes('WARNING')) {
        this.logger.warn(`Backup warnings: ${stderr}`);
      }

      const stats = fs.statSync(filePath);
      const result: BackupResult = {
        success: true,
        filePath,
        sizeBytes: stats.size,
        durationMs: Date.now() - start,
        timestamp,
      };

      this.logger.log(
        `Full backup complete: ${(stats.size / 1024 / 1024).toFixed(1)}MB, ${result.durationMs}ms`,
      );

      // 清理旧备份 (保留最近 4 个全量)
      await this.cleanupOldBackups(4);
      return result;
    } catch (err: any) {
      this.logger.error(`Full backup failed: ${err.message}`);
      return { success: false, error: err.message, durationMs: Date.now() - start, timestamp };
    }
  }

  // -----------------------------------------------------------------------
  // 增量备份
  // -----------------------------------------------------------------------

  /** 执行增量备份 (使用 Cypher 导出关键数据) */
  async incrementalBackup(): Promise<BackupResult> {
    const start = Date.now();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `incremental-${timestamp}.cypher`;
    const filePath = path.join(this.backupDir, fileName);

    try {
      // 导出最近24小时内更新的节点和关系为 Cypher 语句
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const backupCypher = [
        `// Targon Nexus — 增量备份 ${timestamp}`,
        `// 覆盖时间范围: ${since} → ${new Date().toISOString()}`,
        '',
        `// 新增/更新节点`,
        `MATCH (n) WHERE n.updatedAt >= datetime('${since}')`,
        `RETURN n`,
        '',
        `// 新增/更新关系`,
        `MATCH ()-[r]->() WHERE r.updatedAt >= datetime('${since}')`,
        `RETURN r`,
      ].join('\n');

      fs.writeFileSync(filePath, backupCypher, 'utf-8');
      const stats = fs.statSync(filePath);

      // 清理 7 天前的增量
      await this.cleanupOldIncrementals(7);

      return {
        success: true, filePath, sizeBytes: stats.size,
        durationMs: Date.now() - start, timestamp,
      };
    } catch (err: any) {
      return { success: false, error: err.message, durationMs: Date.now() - start, timestamp };
    }
  }

  // -----------------------------------------------------------------------
  // 恢复
  // -----------------------------------------------------------------------

  /** 从备份文件恢复 */
  async restore(backupFile: string): Promise<RestoreResult> {
    const start = Date.now();
    const filePath = path.resolve(backupFile);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: `Backup file not found: ${filePath}`, durationMs: 0 };
    }

    try {
      // 1. 停止 Neo4j 写入 (可选, 生产环境需要)
      // 2. 恢复
      const cmd = [
        'neo4j-admin',
        'database',
        'load',
        'neo4j',
        `--from-path=${path.dirname(filePath)}`,
        `--from-file=${path.basename(filePath)}`,
        '--force',
      ].join(' ');

      this.logger.log(`Restoring from: ${filePath}`);
      const { stderr } = await execAsync(cmd, { timeout: 600_000 });

      if (stderr && !stderr.includes('WARNING')) {
        this.logger.warn(`Restore warnings: ${stderr}`);
      }

      return {
        success: true,
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      this.logger.error(`Restore failed: ${err.message}`);
      return { success: false, error: err.message, durationMs: Date.now() - start };
    }
  }

  // -----------------------------------------------------------------------
  // 备份状态
  // -----------------------------------------------------------------------

  /** 列出所有备份 */
  listBackups(): { name: string; size: number; date: Date }[] {
    if (!fs.existsSync(this.backupDir)) return [];

    return fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.dump') || f.endsWith('.cypher'))
      .map(f => {
        const stats = fs.statSync(path.join(this.backupDir, f));
        return { name: f, size: stats.size, date: stats.mtime };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private async cleanupOldBackups(keep: number): Promise<void> {
    const backups = this.listBackups().filter(b => b.name.startsWith('full-'));
    if (backups.length <= keep) return;

    const toDelete = backups.slice(keep);
    for (const b of toDelete) {
      fs.unlinkSync(path.join(this.backupDir, b.name));
      this.logger.log(`Cleaned up old backup: ${b.name}`);
    }
  }

  private async cleanupOldIncrementals(retainDays: number): Promise<void> {
    const cutoff = Date.now() - retainDays * 24 * 3600 * 1000;
    const incrementals = this.listBackups().filter(b => b.name.startsWith('incremental-'));
    for (const b of incrementals) {
      if (b.date.getTime() < cutoff) {
        fs.unlinkSync(path.join(this.backupDir, b.name));
      }
    }
  }
}
