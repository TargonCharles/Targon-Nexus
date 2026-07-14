import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { Public } from '../auth';
import { PaperService } from './paper.service';

@Controller('papers')
export class PaperController {
  constructor(private readonly paperService: PaperService) {}

  @Public()
  @Get(':uuid')
  async getPaper(@Param('uuid') uuid: string) {
    const paper = await this.paperService.getPaper(uuid);
    if (!paper) {
      return { success: false, error: { code: 'NOT_FOUND', message: '论文未找到' } };
    }

    const authors = await this.paperService.getAuthors(uuid);

    return {
      success: true,
      data: { ...paper, authors },
    };
  }

  @Public()
  @Get(':uuid/authors')
  async getAuthors(@Param('uuid') uuid: string) {
    const authors = await this.paperService.getAuthors(uuid);
    return { success: true, data: authors };
  }

  @Public()
  @Get(':uuid/citations')
  async getCitations(
    @Param('uuid') uuid: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.paperService.getCitations(uuid, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: page ? parseInt(page, 10) : 1, pageSize: pageSize ? parseInt(pageSize, 10) : 20 },
    };
  }

  @Public()
  @Get(':uuid/references')
  async getReferences(
    @Param('uuid') uuid: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.paperService.getReferences(uuid, {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: page ? parseInt(page, 10) : 1, pageSize: pageSize ? parseInt(pageSize, 10) : 20 },
    };
  }

  @Public()
  @Get(':uuid/citation-graph')
  async getCitationGraph(
    @Param('uuid') uuid: string,
    @Query('depth') depth?: string,
  ) {
    const graph = await this.paperService.getCitationGraph(
      uuid,
      depth ? parseInt(depth, 10) : 1,
    );
    return { success: true, data: graph };
  }

  @Post('import/batch')
  async importBatch(@Body() body: { papers: Array<{
    doi: string; title: string; authors: string[];
    year: number; journal: string; citationCount: number; keywords: string[];
  }> }) {
    const result = await this.paperService.importPaperBatch(body.papers || []);
    return { success: true, data: result };
  }
}
