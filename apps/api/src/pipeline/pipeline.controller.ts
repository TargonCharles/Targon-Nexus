import { Controller, Post, Body, Get, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Neo4jService } from '../neo4j/neo4j.service';
import { PipelineService, PipelineResult } from './pipeline.service';
import { EnrichService } from './enrich.service';
import { CsvImportService } from './csv-import.service';
import { DedupService } from './dedup.service';
import { SeedService } from './seed.service';
import { LockService } from '../common/lock.service';

const PIPELINE_LOCK_KEY = 'pipeline:global';

/**
 * Pipeline Controller — 数据管道管理端点
 *
 * 业务逻辑已下沉到专用 Service：
 *   - DedupService   — 人物去重（ORCID / 姓名 / 分词匹配）
 *   - SeedService    — Cypher 种子数据导入
 *   - LockService    — 分布式互斥锁（保护管道串行执行）
 */
@ApiTags('数据管道')
@Controller('pipeline')
export class PipelineController {
  private readonly logger = new Logger(PipelineController.name);
  private lastResult: PipelineResult | null = null;

  constructor(
    private readonly pipelineService: PipelineService,
    private readonly enrichService: EnrichService,
    private readonly csvImportService: CsvImportService,
    private readonly dedupService: DedupService,
    private readonly seedService: SeedService,
    private readonly lockService: LockService,
    private readonly neo4j: Neo4jService,
  ) {}

  @Post('run')
  @ApiOperation({ summary: '触发数据管道 — 爬取指定 URL 并构建知识图谱' })
  async run(@Body() body: {
    seeds: string[];
    sourceType?: 'lab-homepage' | 'personal-homepage' | 'arxiv' | 'custom';
    maxPagesPerSeed?: number;
  }) {
    if (!body.seeds?.length) {
      throw new BadRequestException('请提供 seeds 参数');
    }

    const result = await this.lockService.withLock(PIPELINE_LOCK_KEY, async () => {
      const r = await this.pipelineService.run({
        seeds: body.seeds,
        sourceType: body.sourceType ?? 'custom',
        maxPagesPerSeed: body.maxPagesPerSeed ?? 3,
      });
      this.lastResult = r;
      return { success: true, data: r };
    });

    if (!result) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中，请稍后再试' } };
    }

    return result;
  }

  @Get('status')
  @ApiOperation({ summary: '查看最近一次管道运行结果' })
  status() {
    return { success: true, data: this.lastResult, running: this.lockService.activeCount > 0 };
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

  @Post('dedup')
  @ApiOperation({ summary: '合并重复人物节点 — 按 ORCID / 姓名匹配' })
  async dedup() {
    const result = await this.lockService.withLock(PIPELINE_LOCK_KEY, async () => {
      const { merges, count } = await this.dedupService.deduplicate();
      return { success: true, data: { merges, count } };
    });

    if (!result) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中' } };
    }

    return result;
  }

  @Post('import/csv')
  @ApiOperation({ summary: '从 datasets/ CSV 批量导入所有种子数据到 Neo4j' })
  async importCsv() {
    const result = await this.lockService.withLock(PIPELINE_LOCK_KEY, async () => {
      const data = await this.csvImportService.importAll();
      return { success: true, data };
    });

    if (!result) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中' } };
    }

    return result;
  }

  /**
   * 一键导入种子数据 — 使用注入的 Neo4jService。
   * ⚠️ 需要认证，且 cypher 文件路径被限定在 graph/cypher/ 目录下防止路径遍历。
   */
  @Post('seed')
  @ApiOperation({ summary: '一键导入 Targon Nexus 知识图谱种子数据' })
  async seed() {
    const result = await this.lockService.withLock(PIPELINE_LOCK_KEY, async () => {
      try {
        const data = await this.seedService.seed();
        return { success: true, data };
      } catch (err: any) {
        return { success: false, error: { code: 'SEED_FAILED', message: err.message } };
      }
    });

    if (!result) {
      return { success: false, error: { code: 'PIPELINE_BUSY', message: '管道正在运行中' } };
    }

    return result;
  }
}
