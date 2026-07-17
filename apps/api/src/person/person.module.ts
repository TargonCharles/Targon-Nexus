import { Module } from '@nestjs/common';
import { PersonController } from './person.controller';
import { PersonService } from './person.service';
import { EnrichmentService } from './enrichment.service';
import { Neo4jModule } from '../neo4j/neo4j.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [Neo4jModule, CommonModule],
  controllers: [PersonController],
  providers: [PersonService, EnrichmentService],
  exports: [PersonService, EnrichmentService],
})
export class PersonModule {}
