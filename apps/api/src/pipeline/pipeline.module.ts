import { Module } from '@nestjs/common';
import { Neo4jModule } from '../neo4j/neo4j.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';
import { EnrichService } from './enrich.service';
import { CsvImportService } from './csv-import.service';
import { DedupService } from './dedup.service';
import { SeedService } from './seed.service';

@Module({
  imports: [Neo4jModule],
  controllers: [PipelineController],
  providers: [PipelineService, EnrichService, CsvImportService, DedupService, SeedService],
  exports: [PipelineService, EnrichService, CsvImportService, DedupService, SeedService],
})
export class PipelineModule {}
