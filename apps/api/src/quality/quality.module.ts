import { Module } from '@nestjs/common';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';
import { EvidenceService } from './evidence.service';
import { CareerPathService } from './career-path.service';
import { ValidationService } from './validation.service';
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [Neo4jModule],
  controllers: [QualityController],
  providers: [QualityService, EvidenceService, CareerPathService, ValidationService],
  exports: [QualityService, EvidenceService, CareerPathService, ValidationService],
})
export class QualityModule {}
