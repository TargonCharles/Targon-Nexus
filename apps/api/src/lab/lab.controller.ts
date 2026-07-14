import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Public } from '../auth';
import { LabService } from './lab.service';

@Public()
@ApiTags('实验室')
@Controller('labs')
export class LabController {
  constructor(private readonly labService: LabService) {}

  @Get(':uuid')
  @ApiOperation({ summary: '获取实验室详情' })
  async getProfile(@Param('uuid') uuid: string) {
    const data = await this.labService.getProfile(uuid);
    return { success: true, data };
  }

  @Get(':uuid/members')
  @ApiOperation({ summary: '获取实验室当前成员' })
  async getMembers(@Param('uuid') uuid: string) {
    const data = await this.labService.getMembers(uuid);
    return { success: true, data };
  }

  @Get(':uuid/alumni')
  @ApiOperation({ summary: '获取实验室校友' })
  async getAlumni(@Param('uuid') uuid: string) {
    const data = await this.labService.getAlumni(uuid);
    return { success: true, data };
  }

  @Get(':uuid/equipment')
  @ApiOperation({ summary: '获取实验室设备' })
  async getEquipment(@Param('uuid') uuid: string) {
    const data = await this.labService.getEquipment(uuid);
    return { success: true, data };
  }

  @Get(':uuid/directions')
  @ApiOperation({ summary: '获取实验室研究方向' })
  async getDirections(@Param('uuid') uuid: string) {
    const data = await this.labService.getDirections(uuid);
    return { success: true, data };
  }

  @Get(':uuid/collaborators')
  @ApiOperation({ summary: '获取合作实验室' })
  async getCollaborators(@Param('uuid') uuid: string) {
    const data = await this.labService.getCollaborators(uuid);
    return { success: true, data };
  }

  @Get(':uuid/timeline')
  @ApiOperation({ summary: '获取实验室发展时间线' })
  async getTimeline(@Param('uuid') uuid: string) {
    const data = await this.labService.getTimeline(uuid);
    return { success: true, data };
  }

  @Get(':uuid/graph')
  @ApiOperation({ summary: '获取实验室关系图谱' })
  async getGraph(@Param('uuid') uuid: string) {
    const data = await this.labService.getGraph(uuid);
    return { success: true, data };
  }
}
