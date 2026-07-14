import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { Public } from '../auth';
import { VectorService } from './vector.service';

@Controller('vector')
export class VectorController {
  constructor(private readonly vectorService: VectorService) {}

  @Post('index/build')
  async buildIndex() {
    const result = await this.vectorService.buildIndex();
    return { success: true, data: result };
  }

  @Public()
  @Get('search')
  async hybridSearch(
    @Query('q') q: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('graphWeight') graphWeight?: string,
  ) {
    if (!q) {
      return { success: false, error: { code: 'MISSING_QUERY', message: '需要 q 参数' } };
    }

    const results = await this.vectorService.hybridSearch(q, {
      type,
      limit: limit ? parseInt(limit, 10) : 20,
      graphWeight: graphWeight ? parseFloat(graphWeight) : 0.5,
      vectorWeight: 0.5,
    });

    return { success: true, data: results, meta: { total: results.length } };
  }
}
