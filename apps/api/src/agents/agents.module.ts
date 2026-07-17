import { Module } from '@nestjs/common';
import { Neo4jModule } from '../neo4j/neo4j.module';

import { AgentEventBus } from './event-bus.service';
import { LiteratureAgent } from './literature-agent.service';
import { IdentityAgent } from './identity-agent.service';
import { RelationAgent } from './relation-agent.service';
import { GraphPipeline } from './graph-pipeline.service';

@Module({
  imports: [Neo4jModule],
  providers: [
    AgentEventBus,
    LiteratureAgent,
    IdentityAgent,
    RelationAgent,
    GraphPipeline,
  ],
  exports: [
    GraphPipeline,
    LiteratureAgent,
    IdentityAgent,
    RelationAgent,
  ],
})
export class AgentsModule {}
