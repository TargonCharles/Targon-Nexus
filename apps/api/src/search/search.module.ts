import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { OnDemandCrawlService } from './on-demand-crawl.service';
import { Neo4jModule } from '../neo4j/neo4j.module';
import { CommonModule } from '../common/common.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [Neo4jModule, CommonModule, AgentsModule],
  controllers: [SearchController],
  providers: [SearchService, OnDemandCrawlService],
  exports: [SearchService, OnDemandCrawlService],
})
export class SearchModule {}
