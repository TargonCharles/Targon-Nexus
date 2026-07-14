import { Controller, Get, Post, Param, Query } from '@nestjs/common';
import { Public } from '../auth';
import { ExternalApiService } from './external-api.service';
import { EquipmentIntelService } from './equipment-intel.service';

@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly externalApi: ExternalApiService,
    private readonly equipmentIntel: EquipmentIntelService,
  ) {}

  // === Semantic Scholar ===

  @Post('s2/enrich/:doi')
  async enrichPaper(@Param('doi') doi: string) {
    const result = await this.externalApi.enrichPaperByDOI(doi);
    return { success: true, data: result };
  }

  @Post('s2/search')
  async searchPapers(@Query('q') q: string, @Query('limit') limit?: string) {
    const result = await this.externalApi.searchAndImport(q, limit ? parseInt(limit) : 20);
    return { success: true, data: result };
  }

  // === ORCID ===

  @Post('orcid/enrich/:orcid')
  async enrichPerson(@Param('orcid') orcid: string) {
    const result = await this.externalApi.enrichPersonByORCID(orcid);
    return { success: true, data: result };
  }

  @Post('orcid/batch')
  async batchEnrich(@Query('limit') limit?: string) {
    const result = await this.externalApi.batchEnrichPersons(limit ? parseInt(limit) : 10);
    return { success: true, data: result };
  }

  // === Equipment Intelligence ===

  @Public()
  @Get('equipment/stats')
  async equipmentStats() {
    const stats = await this.equipmentIntel.getStats();
    return { success: true, data: stats };
  }

  @Public()
  @Get('equipment/leads')
  async salesLeads() {
    const leads = await this.equipmentIntel.discoverSalesLeads();
    return { success: true, data: leads };
  }

  @Public()
  @Get('equipment/upgrade')
  async upgradeWindow() {
    const upgrades = await this.equipmentIntel.predictUpgradeWindow();
    return { success: true, data: upgrades };
  }

  @Public()
  @Get('equipment/network/:brand')
  async brandNetwork(@Param('brand') brand: string) {
    const network = await this.equipmentIntel.getBrandNetwork(brand);
    return { success: true, data: network };
  }
}
