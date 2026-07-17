// ===========================================================================
// EventBus — Agent 间事件通信 (基于 Node.js EventEmitter)
// ===========================================================================

import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

// -- 事件类型 ---------------------------------------------------------------
export const AgentEvents = {
  PAPERS_RANKED: 'agent.papers.ranked',
  AUTHORS_EXTRACTED: 'agent.authors.extracted',
  IDENTITIES_RESOLVED: 'agent.identities.resolved',
  RELATIONS_BUILT: 'agent.relations.built',
  AGENT_ERROR: 'agent.error',
  AGENT_COMPLETE: 'agent.complete',
} as const;

// -- 事件结构 ---------------------------------------------------------------
export interface AgentEvent<T = unknown> {
  event: string;
  agent: string;
  payload: T;
  provenance: {
    chain: string[];
    inputKeyword?: string;
    startedAt: string;
  };
}

@Injectable()
export class AgentEventBus {
  private readonly emitter = new EventEmitter();

  emit<T>(event: string, agent: string, payload: T, provenance: AgentEvent['provenance']): void {
    this.emitter.emit(event, {
      event, agent, payload,
      provenance: { ...provenance, chain: [...provenance.chain, agent] },
    } as AgentEvent<T>);
  }

  emitError(agent: string, error: Error, provenance: AgentEvent['provenance']): void {
    this.emitter.emit(AgentEvents.AGENT_ERROR, {
      event: AgentEvents.AGENT_ERROR, agent,
      payload: { message: error.message },
      provenance,
    });
  }

  emitComplete(agent: string, result: Record<string, number>, provenance: AgentEvent['provenance']): void {
    this.emitter.emit(AgentEvents.AGENT_COMPLETE, { event: AgentEvents.AGENT_COMPLETE, agent, payload: result, provenance });
  }

  on(event: string, handler: (e: AgentEvent) => void): void {
    this.emitter.on(event, handler);
  }
}
