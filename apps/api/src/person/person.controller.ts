import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Public } from '../auth';
import { PersonService } from './person.service';

@Public()
@ApiTags('人物')
@Controller('persons')
export class PersonController {
  constructor(private readonly personService: PersonService) {}

  @Get(':uuid')
  @ApiOperation({ summary: '获取人物详情' })
  @ApiParam({ name: 'uuid', description: '人物 UUID' })
  async getProfile(@Param('uuid') uuid: string) {
    const data = await this.personService.getProfile(uuid);
    return { success: true, data };
  }

  @Get(':uuid/students')
  @ApiOperation({ summary: '获取该人物的学生列表' })
  async getStudents(@Param('uuid') uuid: string) {
    const data = await this.personService.getStudents(uuid);
    return { success: true, data };
  }

  @Get(':uuid/advisors')
  @ApiOperation({ summary: '获取该人物的导师' })
  async getAdvisors(@Param('uuid') uuid: string) {
    const data = await this.personService.getAdvisors(uuid);
    return { success: true, data };
  }

  @Get(':uuid/coauthors')
  @ApiOperation({ summary: '获取合作者' })
  async getCoauthors(@Param('uuid') uuid: string) {
    const data = await this.personService.getCoauthors(uuid);
    return { success: true, data };
  }

  @Get(':uuid/labs')
  @ApiOperation({ summary: '获取所属实验室' })
  async getLabs(@Param('uuid') uuid: string) {
    const data = await this.personService.getLabs(uuid);
    return { success: true, data };
  }

  @Get(':uuid/timeline')
  @ApiOperation({ summary: '获取学术生涯时间线' })
  async getTimeline(@Param('uuid') uuid: string) {
    const data = await this.personService.getTimeline(uuid);
    return { success: true, data };
  }

  @Get(':uuid/graph')
  @ApiOperation({ summary: '获取个人关系图谱数据' })
  async getGraph(@Param('uuid') uuid: string) {
    const data = await this.personService.getGraph(uuid);
    return { success: true, data };
  }

  @Get(':uuid/genealogy')
  @ApiOperation({ summary: '获取学术家谱（仅人物关系：导师/学生/同学/合作者）' })
  async getGenealogy(@Param('uuid') uuid: string) {
    const data = await this.personService.getGenealogy(uuid);
    return { success: true, data };
  }

  @Get(':uuid/papers')
  @ApiOperation({ summary: '获取该人物的论文列表' })
  async getPapers(@Param('uuid') uuid: string) {
    const data = await this.personService.getPapers(uuid);
    return { success: true, data };
  }
}
