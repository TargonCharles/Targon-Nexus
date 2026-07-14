// =============================================================================
// Targon Nexus — Agent Runtime Barrel Export
// =============================================================================

export { EventBus } from './event-bus';
export { AgentRegistry, loadAgentDefinitions, loadAgentPrompt } from './registry';
export { PipelineOrchestrator } from './orchestrator';

// Agent handlers
export {
  masterAgentHandler,
  crawlerAgentHandler,
  extractorAgentHandler,
  graphAgentHandler,
  setGraphAgentNeo4jClient,
} from './agents';

export type {
  Neo4jClient,
  ExtractedEntity,
  ExtractedRelationship,
} from './agents';

export { RedisEventBus, createIORedisAdapter } from './redis-event-bus';
export type { RedisAdapter } from './redis-event-bus';
export type {
  IEventBus,
  AgentEvent,
  AgentDefinition,
  AgentTrigger,
  AgentAction,
  AgentContext,
  AgentResult,
  AgentHandler,
  AgentRegistration,
  AgentLogger,
  PipelineTask,
  PipelineStage,
  PipelineRunRequest,
  PipelineRunResult,
  DiscoveryEvent,
  CrawlEvent,
  ExtractionEvent,
  ResolutionEvent,
  GraphEvent,
  ValidationEvent,
} from './types';
