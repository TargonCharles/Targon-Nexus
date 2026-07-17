import { Controller, Get, Post, Query, Body, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '../auth';
import { SearchService, EntityType, isValidEntityType, VALID_ENTITY_TYPES } from './search.service';
import { OnDemandCrawlService } from './on-demand-crawl.service';
import { GraphPipeline } from '../agents/graph-pipeline.service';

@Public()
@ApiTags('搜索')
@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly crawlService: OnDemandCrawlService,
    private readonly pipeline: GraphPipeline,
  ) {}

  @Get()
  @ApiOperation({ summary: '分面搜索 — 支持类型/国家/领域多维度筛选' })
  @ApiQuery({ name: 'q', required: true, description: '搜索关键词' })
  @ApiQuery({ name: 'type', required: false, description: '实体类型: person|lab|university|equipment|research_direction|paper' })
  @ApiQuery({ name: 'country', required: false, description: '国家筛选' })
  @ApiQuery({ name: 'field', required: false, description: '研究领域筛选' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  async search(
    @Query('q') q: string,
    @Query('type') type?: string,
    @Query('country') country?: string,
    @Query('field') field?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!q?.trim()) return { success: false, error: { code: 'MISSING_QUERY', message: '缺少搜索关键词' } };

    if (type && !isValidEntityType(type)) {
      throw new BadRequestException(`无效的实体类型 "${type}"，有效值: ${VALID_ENTITY_TYPES.join(', ')}`);
    }

    const p = Math.max(1, parseInt(page as string) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(pageSize as string) || 20));
    const result = await this.searchService.search(q.trim(), {
      type: type as EntityType | undefined,
      country: country?.trim() || undefined,
      field: field?.trim() || undefined,
      page: p,
      pageSize: ps,
    });
    return { success: true, data: result.items, meta: { page: p, pageSize: ps, total: result.total }, facets: result.facets };
  }

  @Get('autocomplete')
  @ApiOperation({ summary: '搜索自动补全' })
  async autocomplete(@Query('q') q: string) {
    if (!q || q.length < 2) return { success: true, data: [] };
    return { success: true, data: await this.searchService.autocomplete(q) };
  }

  /** ====== 超越 LLM 的核心 API ====== */

  /**
   * 智能富化搜索 — 每次搜索都并行调用外部学术 API (arXiv + Semantic Scholar)，
   * 用 LLM 从真实数据中提取结构化实体，返回可验证、可追溯的结果。
   *
   * 与 LLM 聊天机器人的本质差异:
   *   1. 数据来自实时 API，非冻结训练数据
   *   2. 每个实体链接到真实论文 DOI / 来源 URL
   *   3. 结构化: 可点击进入人物页 → 探索关系图谱
   *   4. 每次搜索都在增长知识图谱
   */
  @Get('enrich')
  @ApiOperation({ summary: '智能富化搜索 — Literature First 管道: 发现→排序→身份验证→关系构建' })
  async enrich(@Query('q') q: string, @Query('type') type?: string) {
    if (!q?.trim()) return { success: false, error: { message: '缺少搜索关键词' } };

    const keyword = q.trim();

    // 并行: 搜索本地图 + Agent 管道富化
    console.log('[enrich] Starting pipeline for:', keyword);
    const pipePromise = this.pipeline.execute(keyword).catch(err => {
      console.error('[enrich] Pipeline error:', err?.message || err, err?.stack?.substring(0, 200));
      return { entities: [] as any[], relations: [] as any[], stats: { papersAnalyzed: 0, authorsExtracted: 0, identitiesResolved: 0, entitiesQualified: 0, relationsBuilt: 0, totalDurationMs: 0 } };
    });
    const [localResult, pipelineResult] = await Promise.allSettled([
      this.searchService.search(keyword, { type: type as EntityType | undefined, page: 1, pageSize: 20 }),
      pipePromise,
    ]);

    const local = localResult.status === 'fulfilled' ? localResult.value : { items: [], total: 0, facets: undefined };
    const pipe = pipelineResult.status === 'fulfilled'
      ? pipelineResult.value
      : { entities: [] as any[], relations: [] as any[], stats: { papersAnalyzed: 0, authorsExtracted: 0, identitiesResolved: 0, entitiesQualified: 0, relationsBuilt: 0, totalDurationMs: 0 },
          _error: pipelineResult.status === 'rejected' ? String((pipelineResult as any).reason?.message || (pipelineResult as any).reason) : 'unknown' };

    // 仅展示 confidence ≥ 0.6 的结果
    const displayEntities = pipe.entities.filter((e: any) => e.confidence >= 0.6);

    return {
      success: true,
      keyword,
      local: { items: local.items, total: local.total, facets: local.facets },
      enriched: {
        papersAnalyzed: pipe.stats.papersAnalyzed,
        papersFound: pipe.stats.papersAnalyzed,
        entities: displayEntities,
        relations: pipe.relations,
        sources: [...new Set(displayEntities.map(e => e.source))],
        durationMs: pipe.stats.totalDurationMs,
      },
      summary: {
        localTotal: local.total,
        enrichedTotal: displayEntities.length,
        totalPapers: pipe.stats.papersAnalyzed,
        highConfidence: displayEntities.filter(e => e.confidence >= 0.9).length,
        identitiesResolved: pipe.stats.identitiesResolved ?? 0,
      },
    };
  }

  /** ====== 兼容旧接口 ====== */

  @Post('crawl')
  @ApiOperation({ summary: '按需爬取 — 对关键词搜索arXiv并用LLM提取实体入库' })
  async onDemandCrawl(@Body('keyword') keyword: string) {
    if (!keyword || keyword.trim().length < 2) {
      throw new BadRequestException('关键词至少2个字符');
    }
    const result = await this.crawlService.crawlByKeyword(keyword.trim());
    return { success: true, data: result };
  }

  /** 搜索 + 自动按需爬取 (结果少时自动补充) */
  @Get('discover')
  @ApiOperation({ summary: '探索式搜索 — 结果少时自动爬取arXiv补充数据' })
  async discover(@Query('q') q: string, @Query('type') type?: string) {
    if (!q?.trim()) return { success: false, error: { message: '缺少搜索关键词' } };

    // 1. 先搜索现有数据
    const result = await this.searchService.search(q.trim(), {
      type: type as EntityType | undefined,
      page: 1,
      pageSize: 20,
    });

    // 2. 结果少于5条 → 自动触发爬取（使用新富化引擎）
    if (result.total < 5) {
      const enrichResult = await this.crawlService.enrich(q.trim());
      // 3. 再次搜索(含新数据)
      const enriched = await this.searchService.search(q.trim(), {
        type: type as EntityType | undefined,
        page: 1,
        pageSize: 20,
      });
      return {
        success: true,
        data: enriched.items,
        meta: { page: 1, pageSize: 20, total: enriched.total },
        facets: enriched.facets,
        enrich: {
          triggered: true,
          papersFound: enrichResult.papersFound,
          entitiesExtracted: enrichResult.entities.length,
          durationMs: enrichResult.durationMs,
        },
      };
    }

    return {
      success: true,
      data: result.items,
      meta: { page: 1, pageSize: 20, total: result.total },
      facets: result.facets,
      enrich: { triggered: false },
    };
  }
}
