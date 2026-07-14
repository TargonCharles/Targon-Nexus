// =============================================================================
// Agent Runtime Types — V1.5 Multi-Agent Architecture
// =============================================================================

import type { UUID, ISODateTime, EntityType, RelationshipType } from '@arp/types';

// — Agent Definition (from agents/*/agent.yaml) —
export interface AgentTrigger {
  event: string;
  description: string;
  handler: string;
  filter?: Record<string, string>;
}

export interface AgentAction {
  name: string;
  description: string;
  input: Record<string, string>;
  output: Record<string, string>;
}

export interface AgentEmit {
  event: string;
  description: string;
}

export interface AgentDefinition {
  name: string;
  version: string;
  description: string;
  kind: 'stateless-event-driven' | 'scheduled' | 'on-demand';
  events: {
    triggers: AgentTrigger[];
    actions: AgentAction[];
    emits: AgentEmit[];
  };
}

// — Agent Context —
export interface AgentContext {
  agentDef: AgentDefinition;
  eventBus: IEventBus;
  logger: AgentLogger;
  state: Map<string, unknown>;
}

// — Agent Result —
export interface AgentResult {
  status: 'completed' | 'failed' | 'skipped';
  output?: unknown;
  error?: string;
  durationMs: number;
}

// — Pipeline Tasks —
export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';

export interface PipelineTask {
  id: string;
  type: string;
  stage: PipelineStage;
  input: unknown;
  status: TaskStatus;
  assignedAgent?: string;
  result?: AgentResult;
  dependencies: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type PipelineStage =
  | 'discovery'
  | 'crawl'
  | 'parse'
  | 'extract'
  | 'resolve'
  | 'build-graph'
  | 'validate'
  | 'index';

// — Event Bus —
export interface IEventBus {
  on(eventType: string, handler: (event: AgentEvent) => Promise<void>): string;
  off(listenerId: string): void;
  emit(event: AgentEvent): Promise<void>;
  waitFor(eventType: string, timeoutMs?: number): Promise<AgentEvent>;
}

// — Events —
export interface AgentEvent {
  eventId: string;
  eventType: string;
  timestamp: string;
  sourceAgent: string;
  runId: string;
  payload: Record<string, unknown>;
}

export interface DiscoveryEvent extends AgentEvent {
  eventType: 'DiscoveryEvent';
  payload: {
    sourceUrl: string;
    sourceType: string;
    title?: string;
    keywords?: string[];
  };
}

export interface CrawlEvent extends AgentEvent {
  eventType: 'CrawlEvent';
  payload: {
    url: string;
    status: 'started' | 'completed' | 'failed';
    pagesCrawled?: number;
    error?: string;
  };
}

export interface ExtractionEvent extends AgentEvent {
  eventType: 'ExtractionEvent';
  payload: {
    sourceUrl: string;
    entitiesExtracted: number;
    relationshipsExtracted: number;
    modelUsed: string;
    durationMs: number;
  };
}

export interface ResolutionEvent extends AgentEvent {
  eventType: 'ResolutionEvent';
  payload: {
    entitiesProcessed: number;
    merged: number;
    new_: number;
    flagged: number;
    confidence: number;
  };
}

export interface GraphEvent extends AgentEvent {
  eventType: 'GraphEvent';
  payload: {
    operation: string;
    nodesCreated: number;
    nodesUpdated: number;
    relationshipsCreated: number;
    issuesFound: number;
  };
}

export interface ValidationEvent extends AgentEvent {
  eventType: 'ValidationEvent';
  payload: {
    checksRun: number;
    issuesFound: number;
    isConsistent: boolean;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      type: string;
      description: string;
    }>;
  };
}

// — Logger —
export interface AgentLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

// — Agent Constructor (functional approach) —
export type AgentHandler = (ctx: AgentContext, event: AgentEvent) => Promise<AgentResult>;

export interface AgentRegistration {
  definition: AgentDefinition;
  handler: AgentHandler;
}

// — Orchestrator —
export interface PipelineRunRequest {
  seeds: string[];
  sourceType: string;
  maxPagesPerSeed?: number;
  depth?: number;
  model?: string;
}

export interface PipelineRunResult {
  runId: string;
  status: 'completed' | 'partial' | 'failed';
  tasks: PipelineTask[];
  stats: {
    pagesCrawled: number;
    entitiesExtracted: number;
    nodesCreated: number;
    relationshipsCreated: number;
    durationMs: number;
  };
  errors: string[];
}
