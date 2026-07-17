// ===========================================================================
// GraphPipeline — 协调所有 Agent 完成任务
//
// 管道流程:
//   Keyword → Literature Agent → Author extraction → Identity Agent
//   → Relation Agent → Neo4j persist → Frontend display
//
// 输出规则:
//   - 仅显示 confidence ≥ 0.6 的实体和关系
//   - 每条关系带 evidence (source_url + document + confidence)
//   - 人物 identity 通过 IdentityAgent 交叉验证
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { LiteratureAgent, RankedPaper } from './literature-agent.service';
import { IdentityAgent, PersonIdentity, IdentityResolution } from './identity-agent.service';
import { RelationAgent, RelationEdge } from './relation-agent.service';
import { Neo4jService } from '../neo4j/neo4j.service';

// -- 公开类型 ----------------------------------------------------------------

export interface PipelineEntity {
  uuid?: string;
  name: string;
  type: 'Person' | 'Paper' | 'Institution' | 'ResearchDirection';
  confidence: number;
  description?: string;
  /** 来源 */
  source: string;
  sourceUrl?: string;
  /** Person 特有 */
  affiliation?: string;
  paperCount?: number;
  hIndex?: number;
  /** Paper 特有 */
  year?: number;
  citationCount?: number;
  journal?: string;
  authors?: string[];
  /** 得分 */
  score?: number;
}

export interface PipelineRelation {
  from: string;
  to: string;
  type: string;
  confidence: number;
  evidence: {
    sourceUrl: string;
    sourceDocument: string;
  };
}

export interface PipelineResult {
  keyword: string;
  entities: PipelineEntity[];
  relations: PipelineRelation[];
  stats: {
    papersAnalyzed: number;
    authorsExtracted: number;
    identitiesResolved: number;
    entitiesQualified: number;   // confidence ≥ 0.6
    relationsBuilt: number;
    totalDurationMs: number;
  };
}

@Injectable()
export class GraphPipeline {
  private readonly logger = new Logger(GraphPipeline.name);

  constructor(
    private readonly literatureAgent: LiteratureAgent,
    private readonly identityAgent: IdentityAgent,
    private readonly relationAgent: RelationAgent,
    private readonly neo4j: Neo4jService,
  ) {}

  // =========================================================================
  // 主入口
  // =========================================================================

  async execute(keyword: string): Promise<PipelineResult> {
    const start = Date.now();
    this.logger.log(`[Pipeline] Start: "${keyword}"`);

    // === Step 1: Literature Discovery ===
    let litResult;
    try {
      litResult = await this.literatureAgent.discover(keyword);
    } catch (e: any) {
      this.logger.error(`Literature discovery failed: ${e.message}`, e.stack);
      return { keyword, entities: [], relations: [], stats: { papersAnalyzed: 0, authorsExtracted: 0, identitiesResolved: 0, entitiesQualified: 0, relationsBuilt: 0, totalDurationMs: Date.now() - start } };
    }
    const papers = litResult.papers;
    this.logger.log(`[Pipeline] Papers: ${papers.length}`);
    if (!papers.length) {
      return { keyword, entities: [], relations: [], stats: {
        papersAnalyzed: 0, authorsExtracted: 0, identitiesResolved: 0,
        entitiesQualified: 0, relationsBuilt: 0, totalDurationMs: Date.now() - start,
      }};
    }

    // === Step 2: Author Extraction (from ranked papers) ===
    const authors = this.extractAuthorsFromPapers(papers);

    // === Step 3: Identity Resolution ===
    const resolutions = await this.identityAgent.resolve(authors);

    // === Step 4: Build Relations ===
    const relations = await this.relationAgent.buildRelations(papers, resolutions);

    // === Step 5: Assemble output entities (filter by confidence ≥ 0.6) ===
    const entities = this.assembleEntities(papers, resolutions, relations);

    // === Step 6: Background persist ===
    this.persistResults(papers, resolutions, relations).catch(e =>
      this.logger.warn(`Persist failed: ${e.message}`),
    );

    const dur = Date.now() - start;
    const entitiesQualified = entities.filter(e => e.confidence >= 0.6).length;

    this.logger.log(`[Pipeline] Done: ${entitiesQualified} entities, ${relations.length} relations, ${dur}ms`);
    return {
      keyword,
      entities,
      relations: relations.map(r => ({
        from: r.fromName, to: r.toName, type: r.type,
        confidence: r.evidence.confidence,
        evidence: { sourceUrl: r.evidence.sourceUrl, sourceDocument: r.evidence.sourceDocument },
      })),
      stats: {
        papersAnalyzed: papers.length,
        authorsExtracted: authors.length,
        identitiesResolved: resolutions.length,
        entitiesQualified,
        relationsBuilt: relations.length,
        totalDurationMs: dur,
      },
    };
  }

  // =========================================================================
  // Step 2: 从论文提取人物
  // =========================================================================

  private extractAuthorsFromPapers(papers: RankedPaper[]): PersonIdentity[] {
    // 按 name+institution 聚合
    const groups = new Map<string, {
      name: string; nameVariants: Set<string>; institutions: Set<string>;
      topics: Set<string>; dois: Set<string>;
      orcid?: string; s2AuthorId?: string; paperCount: number;
    }>();

    for (const paper of papers) {
      for (const author of paper.authors) {
        const inst = author.institutions[0] || '';
        const key = `${author.name.toLowerCase().trim()}|${inst.toLowerCase().trim()}`;

        if (!groups.has(key)) {
          groups.set(key, {
            name: author.name, nameVariants: new Set([author.name]),
            institutions: new Set(author.institutions), topics: new Set(paper.keywords),
            dois: new Set([paper.doi]), orcid: author.orcid, paperCount: 0,
          });
        }
        const g = groups.get(key)!;
        g.nameVariants.add(author.name);
        for (const i of author.institutions) g.institutions.add(i);
        for (const k of paper.keywords) g.topics.add(k);
        g.dois.add(paper.doi);
        g.paperCount++;
        if (!g.orcid && author.orcid) g.orcid = author.orcid;
      }
    }

    return [...groups.values()].map(g => ({
      name: g.name,
      nameVariants: [...g.nameVariants],
      institutions: [...g.institutions],
      researchTopics: [...g.topics].slice(0, 10),
      identifiers: { orcid: g.orcid },
      paperCount: g.paperCount,
      evidenceDois: [...g.dois],
    }));
  }

  // =========================================================================
  // Step 5: 组装最终实体 (confidence ≥ 0.6 才展示)
  // =========================================================================

  private assembleEntities(
    papers: RankedPaper[],
    resolutions: IdentityResolution[],
    relations: RelationEdge[],
  ): PipelineEntity[] {
    const entities: PipelineEntity[] = [];

    // 论文 (总是展示，论文数据较可靠)
    for (const p of papers) {
      entities.push({
        name: p.title,
        type: 'Paper',
        confidence: p.score,
        description: p.abstract?.substring(0, 300),
        source: p.source,
        sourceUrl: p.sourceUrl,
        year: p.year,
        citationCount: p.citationCount,
        journal: p.journal,
        authors: p.authors.map(a => a.name),
        score: p.score,
      });
    }

    // 人物 (仅 confidence ≥ 0.6)
    for (const r of resolutions) {
      if (r.confidence < 0.6) continue;
      entities.push({
        uuid: r.canonicalUuid,
        name: r.identity.name,
        type: 'Person',
        confidence: r.confidence,
        description: r.identity.institutions.join(', '),
        source: 'openalex+s2',
        affiliation: r.identity.institutions[0],
        paperCount: r.identity.paperCount,
        hIndex: undefined,
      });
    }

    // 机构 (从关系边提取 AFFILIATED_WITH)
    const instNames = new Set<string>();
    for (const r of relations) {
      if (r.type === 'AFFILIATED_WITH' && !instNames.has(r.toName)) {
        instNames.add(r.toName);
        entities.push({
          name: r.toName,
          type: 'Institution',
          confidence: r.evidence.confidence,
          source: r.evidence.sourceType,
        });
      }
    }

    // 研究方向 (从关系边提取 RESEARCHES_ON)
    const topicNames = new Set<string>();
    for (const r of relations) {
      if (r.type === 'RESEARCHES_ON' && !topicNames.has(r.toName)) {
        topicNames.add(r.toName);
        entities.push({
          name: r.toName,
          type: 'ResearchDirection',
          confidence: r.evidence.confidence,
          source: r.evidence.sourceType,
        });
      }
    }

    return entities.sort((a, b) => b.confidence - a.confidence);
  }

  // =========================================================================
  // Step 6: 后台持久化
  // =========================================================================

  private async persistResults(
    papers: RankedPaper[],
    resolutions: IdentityResolution[],
    relations: RelationEdge[],
  ): Promise<void> {
    // 论文节点 — UNWIND 批量写入，避免 N+1
    if (papers.length > 0) {
      await this.neo4j.write(
        `UNWIND $papers AS p
         MERGE (pp:Paper {doi: p.doi})
         ON CREATE SET pp.uuid = randomUUID(), pp.title = p.title, pp.year = p.year,
                       pp.citationCount = p.cit, pp.journal = p.journal,
                       pp.confidence = p.conf, pp.sourceTier = 'TIER_2_ACADEMIC',
                       pp.sourceUrl = p.url, pp.createdAt = datetime()
         ON MATCH SET pp.updatedAt = datetime()`,
        { papers: papers.map(p => ({
          doi: p.doi, title: p.title, year: p.year, cit: p.citationCount,
          journal: p.journal, conf: p.score, url: p.sourceUrl,
        })) },
      ).catch(() => {});
    }

    // 人物节点 — UNWIND 批量写入（仅高置信度）
    const qualified = resolutions.filter(r => r.confidence >= 0.6);
    if (qualified.length > 0) {
      await this.neo4j.write(
        `UNWIND $rows AS r
         MERGE (p:Person {uuid: r.uuid})
         ON CREATE SET p.englishName = r.name, p.orcid = r.orcid, p.description = r.desc,
                       p.researchInterests = r.topics, p.confidence = r.conf,
                       p.evidenceDois = r.dois, p.createdAt = datetime()
         ON MATCH SET p.updatedAt = datetime()`,
        { rows: qualified.map(r => ({
          uuid: r.canonicalUuid, name: r.identity.name,
          orcid: r.identity.identifiers.orcid || null,
          desc: r.identity.institutions.join(', '),
          topics: r.identity.researchTopics,
          conf: r.confidence, dois: r.identity.evidenceDois,
        })) },
      ).catch(() => {});
    }

    // 关系 (使用 RelationAgent — 已有 UNWIND 批量)
    await this.relationAgent.persistEdges(relations);
  }
}
