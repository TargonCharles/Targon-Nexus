import { Controller, Get, Post, Param } from '@nestjs/common';
import { Public } from '../auth';
import { QualityService } from './quality.service';
import { EvidenceService } from './evidence.service';
import { CareerPathService } from './career-path.service';

@Controller('quality')
export class QualityController {
  constructor(
    private readonly qualityService: QualityService,
    private readonly evidenceService: EvidenceService,
    private readonly careerPathService: CareerPathService,
  ) {}

  /** DQ 报告 */
  @Public()
  @Get('report')
  async report() {
    const dq = await this.qualityService.generateReport();
    return { success: true, data: dq };
  }

  /** 清理建议 */
  @Public()
  @Get('cleanup')
  async cleanup() {
    const suggestions = await this.qualityService.getCleanupSuggestions();
    return { success: true, data: suggestions };
  }

  /** 证据覆盖率 */
  @Public()
  @Get('evidence')
  async evidence() {
    const coverage = await this.evidenceService.getEvidenceCoverage();
    return { success: true, data: coverage };
  }

  /** 获取实体证据链 */
  @Public()
  @Get('evidence/:uuid')
  async entityEvidence(@Param('uuid') uuid: string) {
    const evidence = await this.evidenceService.getEvidenceForEntity(uuid);
    return { success: true, data: evidence };
  }

  /** 追溯填充证据 */
  @Post('evidence/backfill')
  async backfillEvidence() {
    const result = await this.evidenceService.backfillEvidence();
    return { success: true, data: result };
  }

  /** 人物职业轨迹 */
  @Public()
  @Get('career/:uuid')
  async career(@Param('uuid') uuid: string) {
    const timeline = await this.careerPathService.getCareerTimeline(uuid);
    return { success: true, data: timeline };
  }

  /** 自动生成职业轨迹 */
  @Post('career/generate/:uuid')
  async generateCareer(@Param('uuid') uuid: string) {
    const result = await this.careerPathService.generateCareerPath(uuid);
    return { success: true, data: result };
  }

  /** 批量生成职业轨迹 */
  @Post('career/backfill')
  async backfillCareer() {
    const result = await this.careerPathService.backfillKeyPeople();
    return { success: true, data: result };
  }
}
