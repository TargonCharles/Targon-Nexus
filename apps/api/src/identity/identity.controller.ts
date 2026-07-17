import { Controller, Post, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth';
import { IdentityService } from './identity.service';

@ApiTags('身份识别')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Public()
  @Post('resolve')
  @ApiOperation({ summary: '运行完整三层身份识别流程' })
  async resolve() {
    const result = await this.identityService.runFullIdentityResolution();
    return { success: true, data: result };
  }

  @Public()
  @Get('genealogy/:internalId')
  @ApiOperation({ summary: '获取人物学术家谱 (追溯三代)' })
  async getGenealogy(@Param('internalId') internalId: string) {
    const data = await this.identityService.getGenealogy(internalId);
    return { success: true, data };
  }
}
