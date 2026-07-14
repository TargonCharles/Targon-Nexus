import OpenAI from 'openai';
import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { EntityType } from '@arp/types';
import type {
  ExtractJob,
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  ParsedPage,
  ResolveJob,
} from '@arp/types';
import { createLogger, createRedisConnection } from '@arp/shared';
import {
  buildEntityExtractionPrompt,
  buildRelationshipExtractionPrompt,
  buildEntityResolutionPrompt,
} from '@arp/prompts';

const logger = createLogger('extractor');

// ---------------------------------------------------------------------------
// Redis / BullMQ
// ---------------------------------------------------------------------------
const connection = createRedisConnection();

const extractQueue = new Queue<ExtractJob>('extract', { connection });
const resolveQueue = new Queue<ResolveJob>('resolve', { connection });

// ---------------------------------------------------------------------------
// OpenAI-compatible client (works with any OpenAI-compatible API)
// ---------------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.LLM_API_KEY ?? 'sk-local',
  baseURL: process.env.LLM_BASE_URL ?? 'http://localhost:11434/v1', // Ollama default
});

const MODEL = process.env.LLM_MODEL ?? 'llama3';
const MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS ?? 4096);
const TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0.1); // Low temp for structured extraction

// ---------------------------------------------------------------------------
// Entity types we extract
// ---------------------------------------------------------------------------
const ENTITY_TYPES: EntityType[] = [
  EntityType.Person,
  EntityType.Lab,
  EntityType.Equipment,
  EntityType.ResearchDirection,
  EntityType.Paper,
  EntityType.Company,
];

// ---------------------------------------------------------------------------
// Chunk a large text into overlapping windows (for long documents)
// ---------------------------------------------------------------------------
function chunkText(text: string, chunkSize = 4000, overlap = 400): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start += chunkSize - overlap;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Call LLM with JSON-structured output
// ---------------------------------------------------------------------------
async function llmExtract<T>(
  systemPrompt: string,
  userContent: string,
  schemaDescription: string,
): Promise<T | null> {
  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      logger.warn('LLM returned empty response');
      return null;
    }

    return JSON.parse(raw) as T;
  } catch (err: any) {
    if (err.name === 'SyntaxError') {
      logger.error({ err }, 'Failed to parse LLM JSON output');
      return null;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------
async function extractEntities(
  text: string,
  sourceUrl: string,
): Promise<ExtractedEntity[]> {
  const allEntities: ExtractedEntity[] = [];
  const chunks = chunkText(text);

  // Deduplicate using a Map keyed by (name.toLowerCase() + '|' + type) — O(1) per entity
  const seen = new Map<string, ExtractedEntity>();

  for (const chunk of chunks) {
    const prompt = buildEntityExtractionPrompt(ENTITY_TYPES);
    const result = await llmExtract<{ entities: ExtractedEntity[] }>(
      prompt.system,
      prompt.user(chunk, sourceUrl),
      'entities',
    );

    if (result?.entities?.length) {
      for (const entity of result.entities) {
        const key = `${entity.name.toLowerCase()}|${entity.type}`;
        if (!seen.has(key)) {
          const deduped: ExtractedEntity = {
            ...entity,
            sourceUrl,
            extractedAt: new Date().toISOString(),
          };
          seen.set(key, deduped);
          allEntities.push(deduped);
        }
      }
    }
  }

  return allEntities;
}

// ---------------------------------------------------------------------------
// Relationship extraction (requires entities as context)
// ---------------------------------------------------------------------------
async function extractRelationships(
  text: string,
  entities: ExtractedEntity[],
  sourceUrl: string,
): Promise<ExtractedRelationship[]> {
  const allRelationships: ExtractedRelationship[] = [];
  const chunks = chunkText(text, 6000, 600);

  for (const chunk of chunks) {
    // Only send entity names + types as context to save tokens
    const entityContext = entities.map((e) => ({
      id: e.name,
      type: e.type,
    }));

    const prompt = buildRelationshipExtractionPrompt();
    const result = await llmExtract<{ relationships: ExtractedRelationship[] }>(
      prompt.system,
      prompt.user(chunk, entityContext, sourceUrl),
      'relationships',
    );

    if (result?.relationships?.length) {
      for (const rel of result.relationships) {
        allRelationships.push({
          ...rel,
          sourceUrl,
          extractedAt: new Date().toISOString(),
        });
      }
    }
  }

  return allRelationships;
}

// ---------------------------------------------------------------------------
// Entity resolution — merge duplicates across sources
// ---------------------------------------------------------------------------
async function resolveEntities(
  entities: ExtractedEntity[],
): Promise<ExtractedEntity[]> {
  if (entities.length <= 1) return entities;

  // Group by type, then ask LLM to resolve within each type group
  const byType = new Map<EntityType, ExtractedEntity[]>();
  for (const e of entities) {
    const group = byType.get(e.type) ?? [];
    group.push(e);
    byType.set(e.type, group);
  }

  const resolved: ExtractedEntity[] = [];

  for (const [type, group] of byType) {
    if (group.length <= 1) {
      resolved.push(...group);
      continue;
    }

    const prompt = buildEntityResolutionPrompt(type);
    const result = await llmExtract<{ resolved: ExtractedEntity[] }>(
      prompt.system,
      prompt.user(group),
      'resolved',
    );

    if (result?.resolved?.length) {
      resolved.push(...result.resolved);
    } else {
      // Fallback: keep all as-is
      resolved.push(...group);
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Main extraction pipeline for a single page
// ---------------------------------------------------------------------------
async function extractFromPage(page: ParsedPage): Promise<ExtractionResult> {
  const text = page.textContent;
  if (!text || text.length < 50) {
    return {
      pageUrl: page.url,
      entities: [],
      relationships: [],
      status: 'skipped',
      reason: 'Insufficient text content',
    };
  }

  logger.info({ url: page.url, textLen: text.length }, 'Extracting entities...');

  // Step 1: Extract entities
  const entities = await extractEntities(text, page.url);
  logger.info({ url: page.url, entityCount: entities.length }, 'Entities extracted');

  // Step 2: Extract relationships
  const relationships = entities.length > 0
    ? await extractRelationships(text, entities, page.url)
    : [];
  logger.info({ url: page.url, relCount: relationships.length }, 'Relationships extracted');

  // Step 3: Resolve entities (merge duplicates)
  const resolvedEntities = entities.length > 0
    ? await resolveEntities(entities)
    : entities;

  return {
    pageUrl: page.url,
    entities: resolvedEntities,
    relationships,
    status: 'completed',
  };
}

// ---------------------------------------------------------------------------
// Batch extraction — enqueue resolve job after extraction.
// Pages are processed with controlled concurrency to keep the LLM saturated
// without overwhelming it.
// ---------------------------------------------------------------------------
const EXTRACT_CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY ?? 2);

async function extractBatch(pages: ParsedPage[]): Promise<ExtractionResult[]> {
  // Process pages concurrently with a concurrency limit
  const results: ExtractionResult[] = [];
  const queue = [...pages];

  async function worker() {
    while (queue.length > 0) {
      const page = queue.shift()!;
      const result = await extractFromPage(page);
      results.push(result);
    }
  }

  // Start N concurrent workers
  const workers = Array.from(
    { length: Math.min(EXTRACT_CONCURRENCY, pages.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Collect all unique resolved entities and push to resolve queue
  const allEntities = results.flatMap((r) => r.entities);
  const allRelationships = results.flatMap((r) => r.relationships);

  if (allEntities.length > 0) {
    await resolveQueue.add(
      'resolve-entities',
      { entities: allEntities, relationships: allRelationships },
      { removeOnComplete: { count: 1000 }, removeOnFail: { count: 500 } },
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Service entry point
// ---------------------------------------------------------------------------
async function main() {
  logger.info('ARP Extractor service starting...');
  logger.info({ model: MODEL, baseURL: openai.baseURL }, 'LLM config');

  const worker = new Worker<ExtractJob>(
    'extract',
    async (job) => {
      const { pages } = job.data;
      logger.info(
        { jobId: job.id, pageCount: pages.length },
        'Processing extraction job',
      );

      await job.updateProgress(10);
      const results = await extractBatch(pages);
      await job.updateProgress(100);

      return {
        pageCount: pages.length,
        entityCount: results.reduce((sum, r) => sum + r.entities.length, 0),
        relationshipCount: results.reduce((sum, r) => sum + r.relationships.length, 0),
        results,
      };
    },
    {
      connection,
      concurrency: 1, // Sequential to avoid overwhelming the LLM
      limiter: {
        max: 5,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Extraction job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Extraction job failed');
  });

  logger.info('ARP Extractor service ready — waiting for jobs on "extract" queue');

  const shutdown = async () => {
    logger.info('Shutting down extractor...');
    await worker.close();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Extractor service crashed');
  process.exit(1);
});
