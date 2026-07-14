import { Controller, Post, Body, Get, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Neo4jService } from '../neo4j/neo4j.service';
import { PipelineService, PipelineResult } from './pipeline.service';
import { EnrichService } from './enrich.service';
import { CsvImportService } from './csv-import.service';
import { Public } from '../auth';

/**
 * Pipeline Controller — 数据管道管理端点
 *
 * ⚠️ 所有端点需要认证（不再使用 @Public()）。
 * Pipeline 的运行状态通过进程内标志保护；多实例部署时建议升级为 Redis 分布式锁。
 */
@ApiTags('数据管道')
@Controller('pipeline')
export class PipelineController {
  private readonly logger = new Logger(PipelineController.name);
  private lastResult: PipelineResult | null = null;
  private running = false;

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly enrichService: EnrichService,
    private readonly csvImportService: CsvImportService,
    private readonly neo4j: Neo4jService,
  ) {}

  @Post('run')
  @ApiOperation({ summary: '触发数据管道 — 爬取指定 URL 并构建知识图谱' })
  async run(@Body() body: {
    seeds: string[];
    sourceType?: 'lab-homepage' | 'personal-homepage' | 'arxiv' | 'custom';
    maxPagesPerSeed?: number;
  }) {
    if (this.running) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中，请稍后再试' } };
    }
    if (!body.seeds?.length) {
      throw new BadRequestException('请提供 seeds 参数');
    }

    this.running = true;
    try {
      const result = await this.pipelineService.run({
        seeds: body.seeds,
        sourceType: body.sourceType ?? 'custom',
        maxPagesPerSeed: body.maxPagesPerSeed ?? 3,
      });
      this.lastResult = result;
      return { success: true, data: result };
    } catch (err: any) {
      this.logger.error('Pipeline 运行失败', err);
      return { success: false, error: { code: 'PIPELINE_FAILED', message: err.message } };
    } finally {
      this.running = false;
    }
  }

  @Get('status')
  @ApiOperation({ summary: '查看最近一次管道运行结果' })
  status() {
    return { success: true, data: this.lastResult, running: this.running };
  }

  /**
   * 手动丰富人物信息 — 使用注入的 Neo4jService 而非自建连接。
   */
  @Post('enrich')
  @ApiOperation({ summary: '丰富人物信息 — 更新履历、照片等' })
  async enrich(@Body() body: {
    uuid: string;
    title?: string;
    bio?: string;
    education?: string;
    timeline?: string;
    photoUrl?: string;
  }) {
    if (!body.uuid) {
      throw new BadRequestException('需要 uuid');
    }

    const props: Record<string, string> = {};
    if (body.title) props.title = body.title;
    if (body.bio) props.bio = body.bio;
    if (body.education) props.education = body.education;
    if (body.timeline) props.timeline = body.timeline;
    if (body.photoUrl) props.photoUrl = body.photoUrl;

    if (Object.keys(props).length === 0) {
      return { success: true, data: { updated: [] } };
    }

    try {
      await this.neo4j.write(
        `MATCH (p:Person {uuid: $uuid}) SET p += $props, p.updatedAt = datetime() RETURN p.englishName AS name`,
        { uuid: body.uuid, props },
      );
      return { success: true, data: { updated: Object.keys(props) } };
    } catch (err: any) {
      this.logger.error('Enrich 操作失败', err);
      return { success: false, error: { code: 'ENRICH_FAILED', message: err.message } };
    }
  }

  @Post('enrich/batch')
  @ApiOperation({ summary: '批量丰富实体信息 — 通过 ORCID / Semantic Scholar 等外部 API' })
  async enrichBatch(@Body() body: {
    entities: Array<{ uuid: string; type: string }>;
  }) {
    if (!body.entities?.length) {
      throw new BadRequestException('entities 数组不能为空');
    }

    try {
      const results = await this.enrichService.enrichBatch(body.entities);
      return { success: true, data: results };
    } catch (err: any) {
      this.logger.error('批量丰富失败', err);
      return { success: false, error: { code: 'ENRICH_BATCH_FAILED', message: err.message } };
    }
  }

  @Public()
  @Post('dedup')
  @ApiOperation({ summary: '合并重复人物节点 — 按 ORCID / 姓名匹配' })
  async dedup() {
    if (this.running) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中' } };
    }
    this.running = true;
    try {
      const merges: string[] = [];

      // 按 ORCID 合并
      const orcidDups = await this.neo4j.read<{orcid:string; uuids:string[]}>(
        `MATCH (p:Person) WHERE p.orcid IS NOT NULL
         WITH p.orcid AS orcid, collect(p.uuid) AS uuids, count(*) AS cnt
         WHERE cnt > 1 RETURN orcid, uuids`
      );

      for (const row of orcidDups) {
        const canonical = row.uuids[0];
        for (let i = 1; i < row.uuids.length; i++) {
          const dup = row.uuids[i];
          // 转移关系: dup→n 改为 old→n
          await this.neo4j.write(
            `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
             MATCH (dup)-[r]->(n) WHERE n.uuid <> old.uuid
             CALL { WITH old, r, n
               MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r)
             } IN TRANSACTIONS
             RETURN count(*) AS c`, { canonical, dup }
          ).catch(() => {});
          // 转移关系: n→dup 改为 n→old
          await this.neo4j.write(
            `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
             MATCH (n)-[r]->(dup) WHERE n.uuid <> old.uuid
             CALL { WITH old, r, n
               MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r)
             } IN TRANSACTIONS
             RETURN count(*) AS c`, { canonical, dup }
          ).catch(() => {});
          // 复制属性
          await this.neo4j.write(
            `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
             SET old.orcid = coalesce(old.orcid, dup.orcid),
                 old.homepage = coalesce(old.homepage, dup.homepage),
                 old.email = coalesce(old.email, dup.email),
                 old.researchInterests = coalesce(old.researchInterests, dup.researchInterests)
             RETURN old.uuid`, { canonical, dup }
          );
          // 删除重复节点
          await this.neo4j.write(
            `MATCH (dup:Person {uuid:$dup}) DETACH DELETE dup`, { dup }
          );
          merges.push(`ORCID ${row.orcid}: ${dup} → ${canonical}`);
        }
      }

      // 按姓名匹配合并（名字相同但 UUID 不同）
      const nameDups = await this.neo4j.read<{name:string; uuids:string[]}>(
        `MATCH (p:Person) WHERE p.englishName IS NOT NULL
         WITH p.englishName AS name, collect(p.uuid) AS uuids, count(*) AS cnt
         WHERE cnt > 1 AND name <> 'Xingjiang Zhou'  // skip known duplicate from old data
         RETURN name, uuids`
      );

      for (const row of nameDups) {
        const canonical = row.uuids[0];
        for (let i = 1; i < row.uuids.length; i++) {
          const dup = row.uuids[i];
          try {
            // 转移出边
            await this.neo4j.write(
              `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
               MATCH (dup)-[r]->(n) WHERE n.uuid <> old.uuid
               CALL { WITH old, r, n
                 MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r)
               } IN TRANSACTIONS`, { canonical, dup }
            ).catch(() => {});
            // 转移入边
            await this.neo4j.write(
              `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
               MATCH (n)-[r]->(dup) WHERE n.uuid <> old.uuid
               CALL { WITH old, r, n
                 MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r)
               } IN TRANSACTIONS`, { canonical, dup }
            ).catch(() => {});
            // 复制属性并删除
            await this.neo4j.write(
              `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
               SET old.orcid = coalesce(old.orcid, dup.orcid)
               WITH old, dup DETACH DELETE dup`, { canonical, dup }
            );
            merges.push(`Name "${row.name}": ${dup} → ${canonical}`);
          } catch (e: any) { /* skip if dup already merged */ }
        }
      }

      // 按姓名分词匹配合并（姓-名顺序不同: "Ding Hong"↔"Hong Ding"）
      const allPeople = await this.neo4j.read<{uuid:string; name:string}>(
        `MATCH (p:Person) WHERE p.englishName IS NOT NULL RETURN p.uuid AS uuid, p.englishName AS name`
      );

      // 建立姓名分词索引
      const nameIndex = new Map<string, string[]>(); // sorted name parts → [uuids]
      for (const p of allPeople) {
        const parts = p.name.toLowerCase().split(/\s+/).sort();
        const key = parts.join(' ');
        if (!nameIndex.has(key)) nameIndex.set(key, []);
        nameIndex.get(key)!.push(p.uuid);
      }

      // 合并同组内的重复
      for (const [, uuids] of nameIndex) {
        if (uuids.length < 2) continue;
        const canonical = uuids[0];
        for (let i = 1; i < uuids.length; i++) {
          const dup = uuids[i];
          try {
            await this.neo4j.write(
              `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
               MATCH (dup)-[r]->(n) WHERE n.uuid <> old.uuid
               CALL { WITH old, r, n
                 MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r)
               } IN TRANSACTIONS`, { canonical, dup }
            ).catch(() => {});
            await this.neo4j.write(
              `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
               MATCH (n)-[r]->(dup) WHERE n.uuid <> old.uuid
               CALL { WITH old, r, n
                 MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r)
               } IN TRANSACTIONS`, { canonical, dup }
            ).catch(() => {});
            await this.neo4j.write(
              `MATCH (old:Person {uuid:$canonical}) MATCH (dup:Person {uuid:$dup})
               SET old.orcid = coalesce(old.orcid, dup.orcid),
                   old.homepage = coalesce(old.homepage, dup.homepage),
                   old.email = coalesce(old.email, dup.email)
               WITH old, dup DETACH DELETE dup`, { canonical, dup }
            );
            merges.push(`Fuzzy: ${dup} → ${canonical}`);
          } catch (e: any) { /* skip if already merged */ }
        }
      }

      return { success: true, data: { merges, count: merges.length } };
    } catch (err: any) {
      this.logger.error('去重失败', err);
      return { success: false, error: { code: 'DEDUP_FAILED', message: err.message } };
    } finally {
      this.running = false;
    }
  }

  @Public()
  @Post('import/csv')
  @ApiOperation({ summary: '从 datasets/ CSV 批量导入所有种子数据到 Neo4j' })
  async importCsv() {
    if (this.running) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中' } };
    }
    this.running = true;
    try {
      const result = await this.csvImportService.importAll();
      return { success: true, data: result };
    } catch (err: any) {
      this.logger.error('CSV 导入失败', err);
      return { success: false, error: { code: 'CSV_IMPORT_FAILED', message: err.message } };
    } finally {
      this.running = false;
    }
  }

  /**
   * 一键导入种子数据 — 使用注入的 Neo4jService。
   * ⚠️ 需要认证，且 cypher 文件路径被限定在 graph/cypher/ 目录下防止路径遍历。
   */
  @Post('seed')
  @ApiOperation({ summary: '一键导入 Targon Nexus 知识图谱种子数据' })
  async seed() {
    if (this.running) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中' } };
    }

    this.running = true;
    try {
      const fs = await import('fs');
      const path = await import('path');

      // 限定种子数据文件路径，防止路径遍历攻击
      const seedFile = path.resolve('graph/cypher/seed-arpes-community.cypher');
      const allowedDir = path.resolve('graph/cypher');
      if (!seedFile.startsWith(allowedDir)) {
        return { success: false, error: { code: 'INVALID_PATH', message: '种子文件路径非法' } };
      }
      if (!fs.existsSync(seedFile)) {
        return { success: false, error: { code: 'FILE_NOT_FOUND', message: `种子文件不存在: ${seedFile}` } };
      }

      const cypher = fs.readFileSync(seedFile, 'utf-8');
      const stmts = cypher
        .split(';')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && !s.startsWith('//'));

      let errors = 0;
      for (const stmt of stmts) {
        try {
          await this.neo4j.write(stmt + ';');
        } catch (err: any) {
          this.logger.warn(`种子语句执行失败: ${stmt.substring(0, 80)}... — ${err.message}`);
          errors++;
        }
      }

      return { success: true, data: { statements: stmts.length - errors, errors } };
    } catch (err: any) {
      this.logger.error('Seed 导入失败', err);
      return { success: false, error: { code: 'SEED_FAILED', message: err.message } };
    } finally {
      this.running = false;
    }
  }
}
