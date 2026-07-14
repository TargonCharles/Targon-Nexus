// =============================================================================
// Graph Agent — 生产实现
// 集成 Neo4j 写入 + 实体合并 + 证据追踪
// =============================================================================

import type { AgentHandler, AgentContext, AgentEvent, AgentResult } from '../types';
import type { ExtractedEntity, ExtractedRelationship } from './extractor-agent';

/** Neo4j 客户端接口（运行时注入） */
export interface Neo4jClient {
  write(cypher: string, params?: Record<string, unknown>): Promise<Array<{ get: (key: string) => unknown }>>;
  read<T>(cypher: string, params?: Record<string, unknown>): Promise<T[]>;
}

/** Graph Agent 依赖注入 */
let neo4jClient: Neo4jClient | null = null;

export function setGraphAgentNeo4jClient(client: Neo4jClient): void {
  neo4jClient = client;
}

const LABEL_MAP: Record<string, string> = {
  person: 'Person',
  lab: 'Lab',
  university: 'University',
  equipment: 'Equipment',
  researchdirection: 'ResearchDirection',
  paper: 'Paper',
};

/**
 * Graph Agent — 图谱写入
 * 处理 ExtractionEvent → 节点 MERGE + 关系创建 + 证据记录
 */
export const graphAgentHandler: AgentHandler = async (
  ctx: AgentContext,
  event: AgentEvent,
): Promise<AgentResult> => {
  const start = Date.now();

  if (!neo4jClient) {
    ctx.logger.warn('GraphAgent: Neo4j client not configured — running in dry-run mode');
  }

  switch (event.eventType) {
    case 'ExtractionEvent':
      return handleExtractionResult(ctx, event, start);
    case 'PipelineTask.build-graph':
      return handleBuildGraph(ctx, event, start);
    default:
      return { status: 'skipped', output: { reason: `Unhandled: ${event.eventType}` }, durationMs: 0 };
  }
};

/** 处理提取结果 → 写入图谱 */
async function handleExtractionResult(
  ctx: AgentContext, event: AgentEvent, startMs: number,
): Promise<AgentResult> {
  const entities = event.payload.entities as ExtractedEntity[] | undefined;
  const relationships = event.payload.relationships as ExtractedRelationship[] | undefined;

  if (!entities?.length && !relationships?.length) {
    return { status: 'skipped', output: { reason: 'No entities or relationships' }, durationMs: 0 };
  }

  let nodesCreated = 0;
  let nodesUpdated = 0;
  let relsCreated = 0;

  // 写入实体节点
  if (entities?.length) {
    for (const entity of entities) {
      const label = LABEL_MAP[entity.type.toLowerCase()] ?? 'Entity';

      if (neo4jClient) {
        try {
          const result = await neo4jClient.write(
            `MERGE (n:\`${label}\` {name: $name, type: $entityType})
             ON CREATE SET
               n.uuid = randomUUID(),
               n.description = $description,
               n.confidence = $confidence,
               n.sourceUrl = $sourceUrl,
               n.createdAt = datetime(),
               n.updatedAt = datetime()
             ON MATCH SET
               n.confidence = CASE WHEN n.confidence < $confidence THEN $confidence ELSE n.confidence END,
               n.updatedAt = datetime()
             RETURN n.uuid AS uuid, n.createdAt AS createdAt`,
            {
              name: entity.name,
              entityType: entity.type,
              description: entity.description ?? null,
              confidence: entity.confidence ?? 0.7,
              sourceUrl: entity.sourceUrl ?? null,
            },
          );
          if (result.length > 0) {
            nodesCreated++;
          }
        } catch (err: any) {
          ctx.logger.warn(`GraphAgent: Failed to write ${label}/${entity.name}: ${err.message}`);
        }
      } else {
        // Dry-run: 模拟创建
        nodesCreated++;
      }
    }
  }

  // 写入关系
  if (relationships?.length && neo4jClient) {
    for (const rel of relationships) {
      try {
        const relType = String(rel.type).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
        await neo4jClient.write(
          `MATCH (a) WHERE toLower(coalesce(a.name, a.englishName, a.chineseName, '')) = toLower($sn)
           MATCH (b) WHERE toLower(coalesce(b.name, b.englishName, b.chineseName, '')) = toLower($tn)
           MERGE (a)-[r:\`${relType}\`]->(b)
           ON CREATE SET
             r.confidence = $c,
             r.sourceUrl = $s,
             r.evidenceType = 'llm_extraction',
             r.createdAt = datetime()
           ON MATCH SET
             r.updatedAt = datetime()
           RETURN type(r) AS relType`,
          { sn: rel.sourceEntityName, tn: rel.targetEntityName, c: rel.confidence ?? 0.7, s: rel.sourceUrl ?? null },
        );
        relsCreated++;
      } catch (err: any) {
        ctx.logger.warn(`GraphAgent: Failed to create relation ${rel.sourceEntityName}--${rel.type}-->${rel.targetEntityName}`);
      }
    }
  }

  ctx.logger.info(`GraphAgent: ${nodesCreated} nodes, ${relsCreated} rels`);

  // 发射 GraphEvent
  await ctx.eventBus.emit({
    eventId: `evt-${Date.now()}`,
    eventType: 'GraphEvent',
    timestamp: new Date().toISOString(),
    sourceAgent: 'graph-agent',
    runId: event.runId,
    payload: {
      operation: 'batch_write',
      nodesCreated,
      nodesUpdated,
      relationshipsCreated: relsCreated,
      issuesFound: 0,
    },
  });

  return {
    status: 'completed',
    output: { nodesCreated, nodesUpdated, relationshipsCreated: relsCreated },
    durationMs: Date.now() - startMs,
  };
}

/** 管道任务入口 */
async function handleBuildGraph(
  ctx: AgentContext, event: AgentEvent, startMs: number,
): Promise<AgentResult> {
  ctx.logger.info('GraphAgent: Building graph from pipeline stage');

  // 在完整管道流程中，build-graph 阶段会从上游获取已提取的实体
  const input = event.payload.input as { entities?: ExtractedEntity[]; relationships?: ExtractedRelationship[] } | undefined;

  const entities = input?.entities ?? [];
  const relationships = input?.relationships ?? [];

  if (entities.length === 0) {
    return { status: 'completed', output: { nodesCreated: 0, relationshipsCreated: 0, note: 'No entities to write' }, durationMs: Date.now() - startMs };
  }

  // 构造 ExtractionEvent 并复用处理逻辑
  const extractEvent: AgentEvent = {
    eventId: `evt-${Date.now()}`,
    eventType: 'ExtractionEvent',
    timestamp: new Date().toISOString(),
    sourceAgent: 'graph-agent',
    runId: event.runId,
    payload: { entities, relationships },
  };

  return handleExtractionResult(ctx, extractEvent, startMs);
}
