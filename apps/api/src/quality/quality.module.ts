import { Module } from '@nestjs/common';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';
import { EvidenceService } from './evidence.service';
import { CareerPathService } from './career-path.service';
import { ValidationService } from './validation.service';
import { CitationAnalyzerService } from './citation-analyzer.service';
import { IncrementalUpdateService } from './incremental-update.service';
import { FeedbackCollectorService } from './feedback-collector.service';
import { LLMCostOptimizerService } from './llm-cost-optimizer.service';
import { Neo4jBackupService } from './neo4j-backup.service';
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [Neo4jModule],
  controllers: [QualityController],
  providers: [
    QualityService,
    EvidenceService,
    CareerPathService,
    ValidationService,
    CitationAnalyzerService,
    IncrementalUpdateService,
    FeedbackCollectorService,
    LLMCostOptimizerService,
    Neo4jBackupService,
  ],
  exports: [
    QualityService,
    EvidenceService,
    CareerPathService,
    ValidationService,
    CitationAnalyzerService,
    IncrementalUpdateService,
    FeedbackCollectorService,
    LLMCostOptimizerService,
    Neo4jBackupService,
  ],
})
export class QualityModule {}
