import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '../auth';
import { SearchService, EntityType, isValidEntityType, VALID_ENTITY_TYPES } from './search.service';

@Public()
@ApiTags('搜索')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

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

    // Validate entity type if provided
    if (type && !isValidEntityType(type)) {
      throw new BadRequestException(`无效的实体类型 "${type}"，有效值: ${VALID_ENTITY_TYPES.join(', ')}`);
    }

    const p = Math.max(1, parseInt(page as string) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(pageSize as string) || 20));
    const result = await this.searchService.search(q.trim(), {
      type: type as EntityType | undefined,
      country: country || undefined,
      field: field || undefined,
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
}
