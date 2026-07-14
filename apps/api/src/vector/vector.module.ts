// =============================================================================
// Vector Search Module — 混合搜索 (Graph + Vector)
// 集成 Qdrant / OpenAI Embeddings 实现语义搜索
// =============================================================================

import { Module } from '@nestjs/common';
import { VectorService } from './vector.service';
import { VectorController } from './vector.controller';
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [Neo4jModule],
  controllers: [VectorController],
  providers: [VectorService],
  exports: [VectorService],
})
export class VectorModule {}
