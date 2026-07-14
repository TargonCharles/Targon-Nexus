import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth';
import { EquipmentService } from './equipment.service';

@Public()
@ApiTags('设备')
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get(':uuid')
  @ApiOperation({ summary: '获取设备详情' })
  async getProfile(@Param('uuid') uuid: string) {
    const data = await this.equipmentService.getProfile(uuid);
    return { success: true, data };
  }

  @Get(':uuid/labs')
  @ApiOperation({ summary: '获取拥有该设备的实验室' })
  async getLabs(@Param('uuid') uuid: string) {
    const data = await this.equipmentService.getLabs(uuid);
    return { success: true, data };
  }

  @Get(':uuid/graph')
  @ApiOperation({ summary: '获取设备关系图谱' })
  async getGraph(@Param('uuid') uuid: string) {
    const data = await this.equipmentService.getGraph(uuid);
    return { success: true, data };
  }
}
