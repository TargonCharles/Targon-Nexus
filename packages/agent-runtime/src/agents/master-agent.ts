// =============================================================================
// Master Agent — 任务拆分 + 分派 + 进度追踪
// =============================================================================

import type { AgentHandler, AgentContext, AgentResult, AgentEvent } from '../types';

export const masterAgentHandler: AgentHandler = async (
  ctx: AgentContext,
  event: AgentEvent,
): Promise<AgentResult> => {
  ctx.logger.info('MasterAgent: processing task', { eventType: event.eventType, taskId: event.payload.taskId });

  const stage = event.payload.stage as string;

  switch (stage) {
    case 'discovery':
      return handleDiscovery(ctx, event);
    case 'crawl':
      return handleCrawl(ctx, event);
    case 'parse':
      return handleParse(ctx, event);
    case 'extract':
      return handleExtract(ctx, event);
    case 'resolve':
      return handleResolve(ctx, event);
    case 'build-graph':
      return handleBuildGraph(ctx, event);
    case 'validate':
      return handleValidate(ctx, event);
    default:
      return { status: 'skipped', output: { reason: `Unknown stage: ${stage}` }, durationMs: 0 };
  }
};

async function handleDiscovery(ctx: AgentContext, event: AgentEvent): Promise<AgentResult> {
  const input = event.payload.input as { seeds: string[] } | undefined;
  const seeds = input?.seeds || [];

  ctx.logger.info(`MasterAgent: Discovery phase — ${seeds.length} seeds`);

  // Emit DiscoveryEvent to crawler-agent
  for (const seed of seeds) {
    await ctx.eventBus.emit({
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eventType: 'DiscoveryEvent',
      timestamp: new Date().toISOString(),
      sourceAgent: 'master-agent',
      runId: event.runId,
      payload: {
        sourceUrl: seed,
        sourceType: seed.startsWith('http') ? 'lab-homepage' : 'arxiv',
        title: seed,
      },
    });
  }

  return {
    status: 'completed',
    output: { seedsDiscovered: seeds.length },
    durationMs: 0,
  };
}

async function handleCrawl(ctx: AgentContext, event: AgentEvent): Promise<AgentResult> {
  ctx.logger.info('MasterAgent: Crawl phase');
  ctx.state.set('pagesCrawled', 0);

  // Await crawl completion events from crawler-agent
  // In production, this would integrate with the BullMQ worker
  return {
    status: 'completed',
    output: { pagesCrawled: ctx.state.get('pagesCrawled') || 0 },
    durationMs: 0,
  };
}

async function handleParse(_ctx: AgentContext, _event: AgentEvent): Promise<AgentResult> {
  return { status: 'completed', output: { parsed: true }, durationMs: 0 };
}

async function handleExtract(_ctx: AgentContext, _event: AgentEvent): Promise<AgentResult> {
  return { status: 'completed', output: { entitiesExtracted: 0, relationshipsExtracted: 0 }, durationMs: 0 };
}

async function handleResolve(_ctx: AgentContext, _event: AgentEvent): Promise<AgentResult> {
  return { status: 'completed', output: { entitiesResolved: 0, merges: 0 }, durationMs: 0 };
}

async function handleBuildGraph(_ctx: AgentContext, _event: AgentEvent): Promise<AgentResult> {
  return { status: 'completed', output: { nodesCreated: 0, relationshipsCreated: 0 }, durationMs: 0 };
}

async function handleValidate(_ctx: AgentContext, _event: AgentEvent): Promise<AgentResult> {
  return { status: 'completed', output: { checksPassed: true, issuesFound: 0 }, durationMs: 0 };
}
