// =============================================================================
// Extractor Agent — 生产实现
// 集成 apps/extractor 的 LLM 实体/关系提取能力
// =============================================================================

import type { AgentHandler, AgentContext, AgentEvent, AgentResult } from '../types';

export interface ExtractedEntity {
  name: string;
  type: 'Person' | 'Lab' | 'University' | 'Equipment' | 'ResearchDirection' | 'Paper';
  description?: string;
  confidence: number;
  sourceUrl: string;
}

export interface ExtractedRelationship {
  sourceEntityName: string;
  targetEntityName: string;
  type: string;
  confidence: number;
  sourceUrl: string;
}

/**
 * Extractor Agent — 从爬取的 RawDocument 中提取实体和关系
 *
 * 策略:
 *   1. 优先使用 LLM (需配置 LLM_API_KEY)
 *   2. 无 LLM 时使用启发式正则提取
 *   3. 未来可接入 @arp/prompts 的专业 prompt 模板
 */
export const extractorAgentHandler: AgentHandler = async (
  ctx: AgentContext,
  event: AgentEvent,
): Promise<AgentResult> => {
  const start = Date.now();

  switch (event.eventType) {
    case 'RawDocument':
      return handleRawDocument(ctx, event, start);
    case 'PipelineTask.extract':
      return handlePipelineExtract(ctx, event, start);
    default:
      return { status: 'skipped', output: { reason: `Unhandled: ${event.eventType}` }, durationMs: 0 };
  }
};

async function handleRawDocument(
  ctx: AgentContext, event: AgentEvent, startMs: number,
): Promise<AgentResult> {
  const text = event.payload.textContent as string;
  const url = event.payload.url as string;

  if (!text || text.length < 50) {
    return { status: 'skipped', output: { reason: 'Text too short' }, durationMs: 0 };
  }

  ctx.logger.info(`ExtractorAgent: Processing ${url} (${text.length} chars)`, { url });

  // 尝试 LLM 提取
  const apiKey = process.env.LLM_API_KEY;
  const useLLM = apiKey && apiKey !== 'sk-local' && apiKey !== 'sk-your-api-key-here';

  if (useLLM) {
    try {
      const result = await extractWithLLM(ctx, text, url);
      ctx.logger.info(`ExtractorAgent: LLM → ${result.entities.length} entities, ${result.relationships.length} rels`);

      await emitExtractionEvent(ctx, event, result.entities, result.relationships, Date.now() - startMs, true);

      return {
        status: 'completed',
        output: {
          entitiesExtracted: result.entities.length,
          relationshipsExtracted: result.relationships.length,
          method: 'llm',
        },
        durationMs: Date.now() - startMs,
      };
    } catch (err: any) {
      ctx.logger.warn(`LLM extraction failed, falling back to heuristic: ${err.message}`);
    }
  }

  // 启发式 fallback
  const result = heuristicExtract(text, url);
  ctx.logger.info(`ExtractorAgent: Heuristic → ${result.entities.length} entities`);

  await emitExtractionEvent(ctx, event, result.entities, result.relationships, Date.now() - startMs, false);

  return {
    status: 'completed',
    output: {
      entitiesExtracted: result.entities.length,
      relationshipsExtracted: result.relationships.length,
      method: 'heuristic',
    },
    durationMs: Date.now() - startMs,
  };
}

/** LLM 实体提取 (OpenAI-compatible) */
async function extractWithLLM(
  ctx: AgentContext, text: string, sourceUrl: string,
): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAI = require('openai');
  const client = new (OpenAI.default ?? OpenAI)({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  });

  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  const textChunk = text.substring(0, 8000);

  // Phase 1: Entities
  const entityPrompt = `从以下文本中提取所有科研实体。返回JSON数组，每个元素包含 name, type, description, confidence。
type 必须是 Person | Lab | University | Equipment | ResearchDirection 之一。

示例：[{"name":"Zhi-Xun Shen","type":"Person","description":"Professor at Stanford","confidence":0.95}]
只返回JSON数组，不要其他内容。文本：\n\n${textChunk}`;

  const entityRes = await client.chat.completions.create({
    model, temperature: 0.1, max_tokens: 2000,
    messages: [{ role: 'user', content: entityPrompt }],
  });

  let entityRaw = entityRes.choices[0]?.message?.content ?? '';
  entityRaw = entityRaw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const arrStart = entityRaw.indexOf('[');
  const arrEnd = entityRaw.lastIndexOf(']');
  let entities: ExtractedEntity[] = [];
  if (arrStart >= 0 && arrEnd >= 0) {
    try { entities = JSON.parse(entityRaw.substring(arrStart, arrEnd + 1)); } catch { /* fall through */ }
  }

  if (!entities.length) return { entities: [], relationships: [] };

  // Phase 2: Relationships
  const entityList = entities.map((e) => `[${e.type}] ${e.name}`).join('\n');
  const relPrompt = `已知以下实体：\n${entityList}\n\n从文本中推断这些实体之间的关系。返回JSON数组，每个关系包含 sourceEntityName, targetEntityName, type, confidence。
type 必须是 MEMBER_OF | WORKS_AT | HAS_EQUIPMENT | RESEARCHES_ON | COAUTHOR_WITH | ADVISOR_OF。
只返回JSON数组，不要其他内容。文本：\n\n${textChunk}`;

  const relRes = await client.chat.completions.create({
    model, temperature: 0.1, max_tokens: 2000,
    messages: [{ role: 'user', content: relPrompt }],
  });

  let relRaw = relRes.choices[0]?.message?.content ?? '';
  relRaw = relRaw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const rStart = relRaw.indexOf('[');
  const rEnd = relRaw.lastIndexOf(']');
  let relationships: ExtractedRelationship[] = [];
  if (rStart >= 0 && rEnd >= 0) {
    try { relationships = JSON.parse(relRaw.substring(rStart, rEnd + 1)); } catch { /* ignore */ }
  }

  return {
    entities: entities.map((e) => ({ ...e, sourceUrl })),
    relationships: relationships.map((r) => ({ ...r, sourceUrl })),
  };
}

/** 启发式正则提取 */
function heuristicExtract(
  text: string, sourceUrl: string,
): { entities: ExtractedEntity[]; relationships: ExtractedRelationship[] } {
  const entities: ExtractedEntity[] = [];
  const seen = new Set<string>();

  const add = (name: string, type: ExtractedEntity['type'], confidence: number) => {
    const key = `${name.toLowerCase()}|${type}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ name, type, confidence, sourceUrl });
    }
  };

  // Emails → Person
  for (const m of text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) ?? []) {
    const name = m.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    add(name, 'Person', 0.6);
  }

  // "Prof. X Y" patterns
  for (const m of text.match(/(?:Prof\.|Professor|Dr\.|Doctor)\s+([A-Z][a-z]+\s+(?:[A-Z]\.\s*)?[A-Z][a-z]+)/g) ?? []) {
    add(m.replace(/^(?:Prof\.|Professor|Dr\.|Doctor)\s+/, ''), 'Person', 0.7);
  }

  // Universities
  for (const p of [
    /(?:University|Institute)\s+of\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*/g,
    /[A-Z][a-z]+\s+(?:University|Institute|College)/g,
  ]) {
    for (const m of text.match(p) ?? []) add(m, 'University', 0.7);
  }

  // Equipment
  for (const p of [
    /(?:Scienta|SPECS)\s+\w+/gi,
    /(?:DA30|R4000|PHOIBOS)\s*\w*/gi,
    /(?:ARPES|MBE|STM|TEM|SEM|AFM|XRD|PPMS)\s*(?:System|Chamber|Setup)?/gi,
  ]) {
    for (const m of text.match(p) ?? []) add(m.trim(), 'Equipment', 0.5);
  }

  // Research directions
  for (const m of text.match(
    /(?:topological|quantum|superconduct\w+|correlated|2D\s*materials?|spin\w+|strongly\s*correlated)/gi,
  ) ?? []) {
    add(m.replace(/\b\w/g, (c) => c.toUpperCase()), 'ResearchDirection', 0.5);
  }

  return { entities, relationships: [] };
}

/** 发射 ExtractionEvent */
async function emitExtractionEvent(
  ctx: AgentContext, event: AgentEvent,
  entities: ExtractedEntity[], relationships: ExtractedRelationship[],
  durationMs: number, usedLLM: boolean,
): Promise<void> {
  await ctx.eventBus.emit({
    eventId: `evt-${Date.now()}`,
    eventType: 'ExtractionEvent',
    timestamp: new Date().toISOString(),
    sourceAgent: 'extractor-agent',
    runId: event.runId,
    payload: {
      sourceUrl: event.payload.url as string,
      entitiesExtracted: entities.length,
      relationshipsExtracted: relationships.length,
      modelUsed: usedLLM ? (process.env.LLM_MODEL ?? 'gpt-4o-mini') : 'heuristic',
      durationMs,
    },
  });
}

async function handlePipelineExtract(
  _ctx: AgentContext, _event: AgentEvent, _start: number,
): Promise<AgentResult> {
  // Pipeline 中由 handleRawDocument 处理每个文档
  return { status: 'skipped', output: { reason: 'Use RawDocument handler' }, durationMs: 0 };
}
