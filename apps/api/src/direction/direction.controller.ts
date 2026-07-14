import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth';
import { DirectionService } from './direction.service';

@Public()
@ApiTags('研究方向')
@Controller('directions')
export class DirectionController {
  constructor(private readonly directionService: DirectionService) {}

  @Get(':uuid')
  @ApiOperation({ summary: '获取研究方向详情' })
  async getProfile(@Param('uuid') uuid: string) {
    const data = await this.directionService.getProfile(uuid);
    return { success: true, data };
  }

  @Get(':uuid/people')
  @ApiOperation({ summary: '获取该方向的研究人员' })
  async getPeople(@Param('uuid') uuid: string) {
    const data = await this.directionService.getPeople(uuid);
    return { success: true, data };
  }

  @Get(':uuid/labs')
  @ApiOperation({ summary: '获取该方向的实验室' })
  async getLabs(@Param('uuid') uuid: string) {
    const data = await this.directionService.getLabs(uuid);
    return { success: true, data };
  }

  @Get(':uuid/graph')
  @ApiOperation({ summary: '获取研究方向关系图谱' })
  async getGraph(@Param('uuid') uuid: string) {
    const data = await this.directionService.getGraph(uuid);
    return { success: true, data };
  }
}
