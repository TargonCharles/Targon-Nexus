import neo4j, { Driver, Session } from 'neo4j-driver';
import { Worker, Job } from 'bullmq';
import type {
  BuildGraphJob,
  ExtractedEntity,
  ExtractedRelationship,
  TimelineEventInput,
  GraphBuildResult,
  EntityType,
  SourceEvidence,
} from '@arp/types';
import { createLogger, generateId, createRedisConnection } from '@arp/shared';

const logger = createLogger('graph-builder');

// ---------------------------------------------------------------------------
// Neo4j connection
// ---------------------------------------------------------------------------
const neo4jUrl = process.env.NEO4J_URL ?? 'bolt://localhost:7687';
const neo4jUser = process.env.NEO4J_USER ?? 'neo4j';
const neo4jPassword = process.env.NEO4J_PASSWORD ?? 'password';
const neo4jDatabase = process.env.NEO4J_DATABASE ?? 'neo4j';

const driver: Driver = neo4j.driver(
  neo4jUrl,
  neo4j.auth.basic(neo4jUser, neo4jPassword),
  {
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 30_000,
  },
);

// ---------------------------------------------------------------------------
// Redis / BullMQ
// ---------------------------------------------------------------------------
const connection = createRedisConnection();

// Flag: schema initialized once per process lifetime
let schemaInitialized = false;

// ---------------------------------------------------------------------------
// Schema initialization — constraints and indexes
// ---------------------------------------------------------------------------
async function initializeSchema(session: Session): Promise<void> {
  const constraints: { label: string; property: string }[] = [
    { label: 'Person', property: 'id' },
    { label: 'Lab', property: 'id' },
    { label: 'Equipment', property: 'id' },
    { label: 'ResearchDirection', property: 'id' },
    { label: 'Paper', property: 'id' },
    { label: 'Company', property: 'id' },
    { label: 'Source', property: 'id' },
    { label: 'TimelineEvent', property: 'id' },
    { label: 'Evidence', property: 'id' },
  ];

  for (const { label, property } of constraints) {
    try {
      await session.run(
        `CREATE CONSTRAINT IF NOT EXISTS FOR (n:\`${label}\`) REQUIRE n.\`${property}\` IS UNIQUE`,
      );
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        logger.warn({ label, err: err.message }, 'Constraint creation warning');
      }
    }
  }

  // Full-text indexes for search — named to match the API search service contract
  const fullTextIndexes: { label: string; indexName: string }[] = [
    { label: 'Person',            indexName: 'person_fulltext' },
    { label: 'Lab',               indexName: 'lab_fulltext' },
    { label: 'Equipment',         indexName: 'equipment_fulltext' },
    { label: 'ResearchDirection', indexName: 'research_direction_fulltext' },
    { label: 'Paper',             indexName: 'paper_fulltext' },
    { label: 'Company',           indexName: 'company_fulltext' },
  ];
  for (const { label, indexName } of fullTextIndexes) {
    try {
      await session.run(
        `CREATE FULLTEXT INDEX ${indexName} IF NOT EXISTS FOR (n:\`${label}\`) ON EACH [n.name, n.description]`,
      );
    } catch (err: any) {
      logger.warn({ label, indexName, err: err.message }, 'Fulltext index creation warning');
    }
  }

  logger.info('Neo4j schema initialized');
}

// ---------------------------------------------------------------------------
// Write a single entity node (MERGE to handle duplicates)
// ---------------------------------------------------------------------------
async function writeEntity(
  session: Session,
  entity: ExtractedEntity,
): Promise<{ neo4jId: string; isNew: boolean }> {
  const label = entity.type;
  const id = entity.resolvedId ?? generateId(entity.type, entity.name);

  const result = await session.run(
    `
    MERGE (n:\`${label}\` {id: $id})
    ON CREATE SET
      n += $props,
      n.createdAt = datetime(),
      n.version = 1
    ON MATCH SET
      n += $updateProps,
      n.updatedAt = datetime(),
      n.version = coalesce(n.version, 1) + 1
    RETURN n.id AS neo4jId, n.createdAt = n.updatedAt AS isNew
    `,
    {
      id,
      props: {
        id,
        name: entity.name,
        type: entity.type,
        description: entity.description ?? null,
        aliases: entity.aliases ?? [],
        affiliations: entity.affiliations ?? [],
        email: entity.email ?? null,
        institution: entity.institution ?? null,
        orcid: entity.orcid ?? null,
        url: entity.url ?? null,
        confidence: entity.confidence ?? 1.0,
      },
      updateProps: {
        description: entity.description ?? null,
        aliases: entity.aliases ?? [],
        affiliations: entity.affiliations ?? [],
        url: entity.url ?? null,
      },
    },
  );

  return {
    neo4jId: result.records[0]?.get('neo4jId') ?? id,
    isNew: result.records[0]?.get('isNew') ?? true,
  };
}

// ---------------------------------------------------------------------------
// Write a source node (the webpage/PDF the entity came from)
// ---------------------------------------------------------------------------
async function writeSource(
  session: Session,
  sourceUrl: string,
  metadata?: Record<string, any>,
): Promise<string> {
  const sourceId = generateId('Source', sourceUrl);

  await session.run(
    `
    MERGE (s:Source {id: $id})
    ON CREATE SET
      s.url = $url,
      s += $metadata,
      s.firstSeen = datetime(),
      s.crawlCount = 1
    ON MATCH SET
      s.lastSeen = datetime(),
      s.crawlCount = coalesce(s.crawlCount, 0) + 1
    RETURN s
    `,
    { id: sourceId, url: sourceUrl, metadata: metadata ?? {} },
  );

  return sourceId;
}

// ---------------------------------------------------------------------------
// Link entity to source with evidence (MENTIONED_IN relationship)
// ---------------------------------------------------------------------------
async function linkEntityToSource(
  session: Session,
  entityId: string,
  sourceId: string,
  evidence: SourceEvidence,
): Promise<void> {
  await session.run(
    `
    MATCH (e {id: $entityId})
    MATCH (s:Source {id: $sourceId})
    MERGE (e)-[r:MENTIONED_IN]->(s)
    ON CREATE SET
      r += $evidence,
      r.firstSeen = datetime()
    ON MATCH SET
      r.lastSeen = datetime(),
      r.mentionCount = coalesce(r.mentionCount, 1) + 1
    `,
    {
      entityId,
      sourceId,
      evidence: {
        confidence: evidence.confidence ?? 1.0,
        excerpt: evidence.excerpt ?? null,
        context: evidence.context ?? null,
        position: evidence.position ?? null,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Write a relationship between two entities
// ---------------------------------------------------------------------------
async function writeRelationship(
  session: Session,
  rel: ExtractedRelationship,
): Promise<void> {
  const sourceId = rel.sourceEntityId;
  const targetId = rel.targetEntityId;

  // Sanitize relationship type for Neo4j (uppercase, underscores)
  const relType = rel.type
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toUpperCase();

  await session.run(
    `
    MATCH (a {id: $sourceId})
    MATCH (b {id: $targetId})
    MERGE (a)-[r:\`${relType}\`]->(b)
    ON CREATE SET
      r += $props,
      r.createdAt = datetime()
    ON MATCH SET
      r.updatedAt = datetime(),
      r.evidenceCount = coalesce(r.evidenceCount, 0) + 1
    `,
    {
      sourceId,
      targetId,
      props: {
        type: rel.type,
        confidence: rel.confidence ?? 1.0,
        evidence: rel.evidence ?? null,
        sourceUrl: rel.sourceUrl ?? null,
        description: rel.description ?? null,
        evidenceCount: 1,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Create timeline events from entities with temporal data
// ---------------------------------------------------------------------------
async function createTimelineEvent(
  session: Session,
  entityId: string,
  event: TimelineEventInput,
): Promise<void> {
  const eventId = generateId('TimelineEvent', `${entityId}-${event.date}-${event.type}`);

  await session.run(
    `
    MATCH (e {id: $entityId})
    MERGE (t:TimelineEvent {id: $eventId})
    ON CREATE SET
      t += $props,
      t.createdAt = datetime()
    MERGE (e)-[:HAS_EVENT]->(t)
    `,
    {
      entityId,
      eventId,
      props: {
        id: eventId,
        type: event.type,
        date: event.date,
        title: event.title ?? null,
        description: event.description ?? null,
        sourceUrl: event.sourceUrl ?? null,
        confidence: event.confidence ?? 1.0,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Main graph build job
// ---------------------------------------------------------------------------
async function buildGraph(job: Job<BuildGraphJob>): Promise<GraphBuildResult> {
  const { entities, relationships, timelineEvents } = job.data;

  logger.info(
    {
      jobId: job.id,
      entityCount: entities.length,
      relCount: relationships?.length ?? 0,
    },
    'Building graph...',
  );

  const session = driver.session({ database: neo4jDatabase });
  let nodesCreated = 0;
  let relationshipsCreated = 0;
  let timelineEventsCreated = 0;
  const entityIdMap = new Map<string, string>(); // resolvedId -> neo4j id
  const sourceCache = new Map<string, string>(); // sourceUrl -> sourceId

  try {
    // Initialize schema once per process, not per job
    if (!schemaInitialized) {
      await initializeSchema(session);
      schemaInitialized = true;
    }

    // 1. Ensure all source nodes exist
    const uniqueSources = new Set<string>();
    for (const entity of entities) {
      if (entity.sourceUrl) uniqueSources.add(entity.sourceUrl);
    }
    for (const rel of relationships ?? []) {
      if (rel.sourceUrl) uniqueSources.add(rel.sourceUrl);
    }

    for (const sourceUrl of uniqueSources) {
      const sourceId = await writeSource(session, sourceUrl);
      sourceCache.set(sourceUrl, sourceId);
    }

    await job.updateProgress(20);

    // 2. Write entity nodes
    for (const entity of entities) {
      try {
        const { neo4jId, isNew } = await writeEntity(session, entity);
        const resolvedId = entity.resolvedId ?? entity.name;
        entityIdMap.set(resolvedId, neo4jId);
        if (isNew) nodesCreated++;

        // Link to source
        if (entity.sourceUrl && sourceCache.has(entity.sourceUrl)) {
          await linkEntityToSource(session, neo4jId, sourceCache.get(entity.sourceUrl)!, {
            confidence: entity.confidence ?? 1.0,
            excerpt: entity.description?.substring(0, 500),
            context: entity.affiliations?.join(', '),
          });
        }
      } catch (err: any) {
        logger.error({ entity: entity.name, err: err.message }, 'Failed to write entity');
      }
    }

    await job.updateProgress(60);

    // 3. Write relationships
    for (const rel of relationships ?? []) {
      try {
        // Resolve entity IDs
        const sourceNeo4jId = entityIdMap.get(rel.sourceEntityId)
          ?? rel.sourceEntityId;
        const targetNeo4jId = entityIdMap.get(rel.targetEntityId)
          ?? rel.targetEntityId;

        await writeRelationship(session, {
          ...rel,
          sourceEntityId: sourceNeo4jId,
          targetEntityId: targetNeo4jId,
        });
        relationshipsCreated++;
      } catch (err: any) {
        logger.error(
          { src: rel.sourceEntityId, tgt: rel.targetEntityId, type: rel.type, err: err.message },
          'Failed to write relationship',
        );
      }
    }

    await job.updateProgress(85);

    // 4. Create timeline events
    for (const event of timelineEvents ?? []) {
      try {
        const neo4jId = entityIdMap.get(event.entityId) ?? event.entityId;
        await createTimelineEvent(session, neo4jId, event);
        timelineEventsCreated++;
      } catch (err: any) {
        logger.error({ event, err: err.message }, 'Failed to create timeline event');
      }
    }

    await job.updateProgress(100);

    const result: GraphBuildResult = {
      jobId: job.id!,
      nodesCreated,
      nodesUpdated: entities.length - nodesCreated,
      relationshipsCreated,
      timelineEventsCreated,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };

    logger.info(result, 'Graph build completed');
    return result;
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Health check — verify Neo4j connectivity
// ---------------------------------------------------------------------------
async function healthCheck(): Promise<boolean> {
  const session = driver.session({ database: neo4jDatabase });
  try {
    const result = await session.run('RETURN 1 AS ok');
    return result.records[0]?.get('ok') === 1;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Neo4j health check failed');
    return false;
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Service entry point
// ---------------------------------------------------------------------------
async function main() {
  logger.info('ARP Graph Builder service starting...');

  // Verify Neo4j is reachable
  const ok = await healthCheck();
  if (!ok) {
    logger.fatal('Neo4j is not reachable — exiting');
    process.exit(1);
  }
  logger.info('Neo4j connection verified');

  const worker = new Worker<BuildGraphJob>(
    'build-graph',
    async (job) => buildGraph(job),
    {
      connection,
      concurrency: 2,
      limiter: {
        max: 10,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Graph build job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Graph build job failed');
  });

  logger.info('ARP Graph Builder service ready — waiting for jobs on "build-graph" queue');

  const shutdown = async () => {
    logger.info('Shutting down graph builder...');
    await worker.close();
    await driver.close();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'Graph Builder service crashed');
  process.exit(1);
});
