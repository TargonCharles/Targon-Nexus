import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth';
import { FacilityService } from './facility.service';

@Controller('facilities')
export class FacilityController {
  constructor(private readonly facilityService: FacilityService) {}

  @Public()
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('country') country?: string,
  ) {
    if (country) {
      const items = await this.facilityService.getByCountry(country);
      return { success: true, data: items, meta: { total: items.length } };
    }

    const result = await this.facilityService.listAll({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return {
      success: true,
      data: result.items,
      meta: { total: result.total, page: page ? parseInt(page, 10) : 1 },
    };
  }

  @Public()
  @Get(':uuid')
  async getFacility(@Param('uuid') uuid: string) {
    const facility = await this.facilityService.getFacility(uuid);
    if (!facility) {
      return { success: false, error: { code: 'NOT_FOUND', message: '设施未找到' } };
    }
    return { success: true, data: facility };
  }

  @Public()
  @Get(':uuid/graph')
  async getGraph(@Param('uuid') uuid: string) {
    const graph = await this.facilityService.getFacilityGraph(uuid);
    return { success: true, data: graph };
  }
}
