// ===========================================================================
// Targon Nexus 数据管道 — 编排 crawler → extractor → graph-builder 完整链路
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { generateUUID, extractJsonArray } from '@arp/shared';
import { HttpClientService } from '../common/http-client.service';
import { LlmClientService } from '../common/llm-client.service';

export interface PipelineConfig {
  seeds: string[];
  sourceType: 'lab-homepage' | 'personal-homepage' | 'arxiv' | 'custom';
  maxPagesPerSeed?: number;
  depth?: number;
  model?: string;
  maxTokens?: number;
}

export interface PipelineProgress {
  step: 'crawling' | 'extracting' | 'building' | 'done' | 'failed';
  message: string;
  percent: number;
  details?: Record<string, unknown>;
}

export interface PipelineResult {
  seeds: string[];
  pagesCrawled: number;
  entitiesExtracted: number;
  relationshipsExtracted: number;
  nodesCreated: number;
  relationshipsCreated: number;
  durationMs: number;
  status: 'completed' | 'partial' | 'failed';
  errors: string[];
}

/** 支持的实体类型及其对应的 Neo4j label */
const LABEL_MAP: Record<string, string> = {
  person: 'Person',
  lab: 'Lab',
  equipment: 'Equipment',
  researchdirection: 'ResearchDirection',
  university: 'University',
  paper: 'Paper',
};

/** LLM extraction 作为默认 evidence_type */
const DEFAULT_EVIDENCE_TYPE = 'llm_extraction';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly neo4j: Neo4jService,
    private readonly httpClient: HttpClientService,
    private readonly llmClient: LlmClientService,
  ) {}

  async run(
    config: PipelineConfig,
    onProgress?: (p: PipelineProgress) => void,
  ): Promise<PipelineResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    onProgress?.({ step: 'crawling', message: '开始爬取...', percent: 0 });

    // Step 1: Crawl
    let crawledPages: Array<{ url: string; title: string; textContent: string }> = [];
    try {
      crawledPages = await this.crawl(config);
    } catch (err: any) {
      errors.push(`爬取失败: ${err.message}`);
      this.logger.error('Crawl phase failed', err);
      return this.result(config, startTime, [], 0, 0, 0, 0, 'failed', errors);
    }

    const uniquePages = this.dedupe(crawledPages, 'url');
    onProgress?.({
      step: 'extracting', message: `爬取 ${uniquePages.length} 页，开始提取实体...`, percent: 25,
      details: { pagesCrawled: uniquePages.length },
    });

    // Step 2+3: Extract (concurrent with concurrency limit of 3)
    let allEntities: any[] = [];
    let allRelationships: any[] = [];
    try {
      const concurrency = 3;
      for (let i = 0; i < uniquePages.length; i += concurrency) {
        const batch = uniquePages.slice(i, i + concurrency);
        onProgress?.({
          step: 'extracting', message: `提取 (${i + 1}-${Math.min(i + concurrency, uniquePages.length)}/${uniquePages.length})`,
          percent: 25 + Math.floor((i / Math.max(uniquePages.length, 1)) * 45),
        });
        const batchResults = await Promise.all(
          batch.map((page) => this.extract(page.textContent, page.url, config)),
        );
        for (const ex of batchResults) {
          allEntities.push(...ex.entities);
          allRelationships.push(...ex.relationships);
        }
      }
    } catch (err: any) {
      errors.push(`提取失败: ${err.message}`);
      this.logger.error('Extraction phase failed', err);
    }

    // Dedup entities
    const seen = new Map<string, any>();
    for (const e of allEntities) {
      const key = `${String(e.name).toLowerCase()}|${e.type}`;
      if (!seen.has(key)) seen.set(key, e);
    }
    allEntities = Array.from(seen.values());

    onProgress?.({
      step: 'building', message: `${allEntities.length} 实体, ${allRelationships.length} 关系 → 写入图谱`,
      percent: 70, details: { entities: allEntities.length, relationships: allRelationships.length },
    });

    // Step 4+5: Build graph
    let nodesCreated = 0;
    let relsCreated = 0;
    try {
      const r = await this.buildGraph(allEntities, allRelationships);
      nodesCreated = r.nodes;
      relsCreated = r.rels;
    } catch (err: any) {
      errors.push(`图谱写入失败: ${err.message}`);
      this.logger.error('Graph build phase failed', err);
    }

    onProgress?.({ step: 'done', message: '管道完成!', percent: 100, details: { nodesCreated, relsCreated } });

    return this.result(
      config, startTime, uniquePages,
      allEntities.length, allRelationships.length,
      nodesCreated, relsCreated,
      errors.length > 0 ? 'partial' : 'completed', errors,
    );
  }

  // -- Crawl -----------------------------------------------------------------
  private async crawl(config: PipelineConfig): Promise<Array<{ url: string; title: string; textContent: string }>> {
    const results: Array<{ url: string; title: string; textContent: string }> = [];

    for (const seed of config.seeds) {
      try {
        if (seed.startsWith('http')) {
          const resp = await this.httpClient.fetch(seed);
          if (!resp.ok) {
            this.logger.warn(`Crawl returned ${resp.status} for ${seed}`);
            continue;
          }

          // 检查 Content-Type 避免将 PDF/二进制当文本处理
          const contentType = resp.headers.get('content-type') ?? '';
          if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            this.logger.warn(`Skipping non-HTML content at ${seed} (${contentType})`);
            continue;
          }

          const html = await resp.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 50_000);
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          results.push({ url: seed, title: titleMatch?.[1]?.trim() ?? seed, textContent: text });
        } else {
          // arXiv search: treat as text seed
          results.push({ url: `arxiv:${seed}`, title: seed, textContent: seed });
        }
      } catch (err: any) {
        this.logger.warn(`Crawl failed for ${seed}: ${err.message}`);
      }
    }
    return results;
  }

  // -- Extract ---------------------------------------------------------------
  private async extract(text: string, sourceUrl: string, config: PipelineConfig): Promise<{
    entities: any[]; relationships: any[];
  }> {
    if (!this.llmClient.isAvailable()) {
      return this.heuristicExtract(text, sourceUrl);
    }

    try {

      // ===================================================================
      // Phase 1: Extract entities
      // ===================================================================
      const entityPrompt = `从以下文本中提取所有科研实体。返回JSON数组，每个元素包含 name, type, description, confidence。
type 必须是 Person | Lab | University | Equipment | ResearchDirection 之一。

示例：
[{"name":"Zhi-Xun Shen","type":"Person","description":"Professor at Stanford","confidence":0.95},{"name":"Stanford University","type":"University","description":"","confidence":0.95}]

只返回JSON数组，不要其他内容。文本：\n\n${text.substring(0, 8000)}`;

      const entityRaw = await this.llmClient.complete(
        [{ role: 'user', content: entityPrompt }],
        { model: config.model, maxTokens: 2000 },
      );
      const entities = extractJsonArray(entityRaw);
      if (!entities || !entities.length) return this.heuristicExtract(text, sourceUrl);

      // ===================================================================
      // Phase 2: Extract relationships using known entities
      // ===================================================================
      const entityList = entities.map((e: any) => `[${e.type}] ${e.name}`).join('\n');
      const relPrompt = `已知以下实体：\n${entityList}\n\n从文本中推断这些实体之间的关系。返回JSON数组，每个关系包含 sourceEntityName, targetEntityName, type, confidence。
type 必须是 MEMBER_OF | WORKS_AT | HAS_EQUIPMENT | RESEARCHES_ON | COAUTHOR_WITH | ADVISOR_OF。
sourceEntityName 和 targetEntityName 必须与上面列出的实体名完全一致。

示例：
[{"sourceEntityName":"Zhi-Xun Shen","targetEntityName":"Stanford University","type":"WORKS_AT","confidence":0.95}]

只返回JSON数组，不要其他内容。文本：\n\n${text.substring(0, 6000)}`;

      const relRaw = await this.llmClient.complete(
        [{ role: 'user', content: relPrompt }],
        { model: config.model, maxTokens: 2000 },
      );
      const relationships = extractJsonArray(relRaw) ?? [];
      return {
        entities: entities.map((e: any) => ({ ...e, sourceUrl })),
        relationships: relationships.map((r: any) => ({ ...r, sourceUrl })),
      };
    } catch (err: any) {
      this.logger.warn(`LLM extraction failed, falling back to heuristic: ${err.message}`);
      return this.heuristicExtract(text, sourceUrl);
    }
  }

  // -- Heuristic fallback ----------------------------------------------------
  private heuristicExtract(text: string, sourceUrl: string): { entities: any[]; relationships: any[] } {
    const entities: any[] = [];
    const seen = new Set<string>();

    const add = (name: string, type: string, confidence: number) => {
      const key = `${name.toLowerCase()}|${type}`;
      if (!seen.has(key)) { seen.add(key); entities.push({ name, type, confidence, sourceUrl }); }
    };

    // Emails → Person
    for (const m of text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g) ?? []) {
      add(m.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'Person', 0.6);
    }
    // Universities
    for (const p of [/(?:University|Institute)\s+of\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g, /[A-Z][a-z]+\s+(?:University|Institute|College)/g]) {
      for (const m of text.match(p) ?? []) add(m, 'University', 0.7);
    }
    // Equipment
    for (const p of [/(?:Scienta|SPECS)\s+\w+/gi, /(?:DA30|R4000|PHOIBOS)\s*\w*/gi, /(?:ARPES|MBE|STM|TEM|SEM|AFM|XRD|PPMS)\s*(?:System|Chamber|Setup)?/gi]) {
      for (const m of text.match(p) ?? []) add(m.trim(), 'Equipment', 0.5);
    }
    // Research directions
    for (const m of text.match(/(?:topological|quantum|superconduct\w+|correlated|2D\s*materials?|spin\w+|strongly\s*correlated)/gi) ?? []) {
      add(m.replace(/\b\w/g, (c) => c.toUpperCase()), 'ResearchDirection', 0.5);
    }

    return { entities, relationships: [] };
  }

  // -- Build Graph -----------------------------------------------------------
  private async buildGraph(
    entities: any[],
    relationships: any[],
  ): Promise<{ nodes: number; rels: number }> {
    let nodes = 0;
    let rels = 0;

    for (const e of entities) {
      const label = LABEL_MAP[String(e.type).toLowerCase()] ?? 'Entity';
      // 使用真正的 UUID v4
      const uuid = generateUUID();
      try {
        await this.neo4j.write(
          `MERGE (n:\`${label}\` {uuid: $uuid})
           ON CREATE SET n += $props, n.createdAt = datetime()
           ON MATCH SET n.updatedAt = datetime()`,
          {
            uuid,
            props: {
              name: e.name,
              description: e.description ?? null,
              confidence: e.confidence ?? 0.7,
              sourceUrl: e.sourceUrl ?? null,
            },
          },
        );
        nodes++;
      } catch (err: any) {
        this.logger.warn(`Failed to create node ${label}/${e.name}: ${err.message}`);
      }
    }

    for (const r of relationships) {
      const relType = String(r.type).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
      const srcName = String(r.sourceEntityName);
      const tgtName = String(r.targetEntityName);
      const confidence = r.confidence ?? 0.7;
      const sourceUrl = r.sourceUrl ?? null;

      try {
        // 通过名称匹配实体（大小写不敏感）
        const result = await this.neo4j.write(
          `MATCH (a) WHERE toLower(coalesce(a.name, a.englishName, a.chineseName, '')) = toLower($sn)
           MATCH (b) WHERE toLower(coalesce(b.name, b.englishName, b.chineseName, '')) = toLower($tn)
           MERGE (a)-[rel:\`${relType}\`]->(b)
           ON CREATE SET rel.confidence = $c,
                         rel.sourceUrl = $s,
                         rel.evidenceType = $et,
                         rel.createdAt = datetime()
           ON MATCH SET rel.confidence = $c,
                        rel.updatedAt = datetime()
           RETURN a.name AS an, b.name AS bn`,
          { sn: srcName, tn: tgtName, c: confidence, s: sourceUrl, et: DEFAULT_EVIDENCE_TYPE },
        );
        if (result.length > 0) {
          this.logger.debug(`[Pipeline] Rel: ${result[0]?.get?.('an') ?? srcName} --${relType}--> ${result[0]?.get?.('bn') ?? tgtName}`);
        }
        rels++;
      } catch (err: any) {
        this.logger.warn(`Failed to create relationship ${srcName} --${relType}--> ${tgtName}: ${err.message}`);
      }
    }

    return { nodes, rels };
  }

  // -- Helpers ---------------------------------------------------------------
  private dedupe<T>(items: T[], key: keyof T): T[] {
    const seen = new Set();
    return items.filter((item) => { const v = item[key]; if (seen.has(v)) return false; seen.add(v); return true; });
  }

  private result(
    config: PipelineConfig, start: number, pages: any[],
    e: number, r: number, n: number, rels: number,
    status: 'completed' | 'partial' | 'failed', errors: string[],
  ): PipelineResult {
    return { seeds: config.seeds, pagesCrawled: pages.length, entitiesExtracted: e,
      relationshipsExtracted: r, nodesCreated: n, relationshipsCreated: rels,
      durationMs: Date.now() - start, status, errors };
  }
}
