// ===========================================================================
// Relation Agent — 关系构建 (带证据追踪)
//
// 每条关系必须存储:
//   - source_type (arxiv/s2/openalex/wikidata/homepage)
//   - source_url (论文 DOI / 来源 URL)
//   - source_document (论文标题)
//   - confidence (0-1)
//   - created_at
//
// 关系类型:
//   AUTHORED       — Person → Paper (作者发表论文)
//   AFFILIATED_WITH — Person → Institution (机构隶属)
//   COAUTHOR_WITH  — Person ↔ Person (合著)
//   ADVISOR_OF     — Person → Person (导师关系)
//   MEMBER_OF      — Person → Lab (实验室成员)
//   RESEARCHES_ON  — Entity → ResearchDirection
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import type { RankedPaper } from './literature-agent.service';
import type { PersonIdentity, IdentityResolution } from './identity-agent.service';

// -- 类型 -------------------------------------------------------------------

export interface Evidence {
  sourceType: string;
  sourceUrl: string;
  sourceDocument: string;
  confidence: number;
  date: string;
}

export interface RelationEdge {
  fromUuid: string;
  fromName: string;
  toUuid: string;
  toName: string;
  type: string;
  evidence: Evidence;
}

// -- 关系类型定义 ------------------------------------------------------------

const VALID_RELATIONS = new Set([
  'AUTHORED', 'AFFILIATED_WITH', 'COAUTHOR_WITH',
  'ADVISOR_OF', 'MEMBER_OF', 'RESEARCHES_ON', 'WORKS_AT',
  'ALUMNI_OF', 'PUBLISHED_IN',
]);

@Injectable()
export class RelationAgent {
  private readonly logger = new Logger(RelationAgent.name);

  constructor(private readonly neo4j: Neo4jService) {}

  // =========================================================================
  // 主入口: 从论文和人物解析结果构建所有关系
  // =========================================================================

  async buildRelations(
    papers: RankedPaper[],
    resolutions: IdentityResolution[],
  ): Promise<RelationEdge[]> {
    this.logger.log(`[Relation] Building from ${papers.length} papers, ${resolutions.length} identities`);

    const edges: RelationEdge[] = [];
    const seen = new Set<string>();

    // 构建 name → resolution 快速索引
    const identityByName = new Map<string, IdentityResolution>();
    const identityByInst = new Map<string, IdentityResolution>();
    for (const r of resolutions) {
      const name = r.identity.name.toLowerCase().trim();
      identityByName.set(name, r);
      for (const inst of r.identity.institutions) {
        identityByInst.set(inst.toLowerCase().trim(), r);
      }
    }

    for (const paper of papers) {
      const evidence: Evidence = {
        sourceType: paper.source,
        sourceUrl: paper.sourceUrl,
        sourceDocument: paper.title,
        confidence: paper.score,
        date: new Date().toISOString(),
      };

      // AUTHORED: 每个作者 → 论文
      for (const author of paper.authors) {
        const nameKey = author.name.toLowerCase().trim();
        const identity = identityByName.get(nameKey);
        if (!identity) continue; // 跳过未解析的作者

        const key = `AUTHORED:${identity.canonicalUuid}→${paper.doi}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({
            fromUuid: identity.canonicalUuid, fromName: author.name,
            toUuid: paper.doi, toName: paper.title,
            type: 'AUTHORED', evidence,
          });
        }

        // AFFILIATED_WITH: 作者 → 机构
        for (const inst of author.institutions) {
          const instKey = `AFFIL:${identity.canonicalUuid}→${inst}`;
          if (!seen.has(instKey)) {
            seen.add(instKey);
            edges.push({
              fromUuid: identity.canonicalUuid, fromName: author.name,
              toUuid: inst, toName: inst,
              type: 'AFFILIATED_WITH', evidence: { ...evidence, confidence: 0.85 },
            });
          }
        }
      }

      // COAUTHOR_WITH: 论文的每对作者之间
      const authorUuids = paper.authors
        .map(a => identityByName.get(a.name.toLowerCase().trim())?.canonicalUuid)
        .filter(Boolean) as string[];
      for (let i = 0; i < authorUuids.length; i++) {
        for (let j = i + 1; j < authorUuids.length; j++) {
          const [a1, a2] = [authorUuids[i], authorUuids[j]].sort();
          const coKey = `COAUTH:${a1}↔${a2}`;
          if (!seen.has(coKey)) {
            seen.add(coKey);
            edges.push({
              fromUuid: a1, fromName: paper.authors[i].name,
              toUuid: a2, toName: paper.authors[j].name,
              type: 'COAUTHOR_WITH', evidence: { ...evidence, confidence: 0.75 },
            });
          }
        }
      }

      // RESEARCHES_ON: 论文 → 研究方向 (从关键词列表)
      for (const kw of paper.keywords.slice(0, 5)) {
        const rdKey = `RESEARCH:${paper.doi}→${kw}`;
        if (!seen.has(rdKey)) {
          seen.add(rdKey);
          edges.push({
            fromUuid: paper.doi, fromName: paper.title,
            toUuid: kw, toName: kw,
            type: 'RESEARCHES_ON', evidence: { ...evidence, confidence: 0.6 },
          });
        }
      }
    }

    this.logger.log(`[Relation] Built ${edges.length} edges with evidence`);
    return edges;
  }

  // =========================================================================
  // 持久化
  // =========================================================================

  async persistEdges(edges: RelationEdge[]): Promise<number> {
    let saved = 0;

    // 按关系类型分组 (Cypher 不支持动态关系类型)
    const byType = new Map<string, RelationEdge[]>();
    for (const e of edges) {
      const t = e.type;
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t)!.push(e);
    }

    for (const [relType, batch] of byType) {
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        try {
          await this.neo4j.write(
            `UNWIND $edges AS edge
             MATCH (a {uuid: edge.fromUuid})
             MATCH (b)
             WHERE b.uuid = edge.toUuid
                OR b.name = edge.toUuid
                OR b.englishName = edge.toUuid
                OR b.doi = edge.toUuid
             WITH a, b, edge
             MERGE (a)-[r:\`${relType}\`]->(b)
             ON CREATE SET r = edge.evidence, r.createdAt = datetime(),
                           r.evidenceCount = 1, r.evidenceUrls = [edge.evidence.sourceUrl]
             ON MATCH SET
               r.confidence = CASE WHEN edge.evidence.confidence > coalesce(r.confidence, 0)
                                   THEN edge.evidence.confidence ELSE r.confidence END,
               r.evidenceCount = coalesce(r.evidenceCount, 1) +
                 CASE WHEN edge.evidence.sourceUrl IN coalesce(r.evidenceUrls, []) THEN 0 ELSE 1 END,
               r.evidenceUrls = coalesce(r.evidenceUrls, []) +
                 CASE WHEN edge.evidence.sourceUrl IN coalesce(r.evidenceUrls, []) THEN [] ELSE [edge.evidence.sourceUrl] END,
               r.updatedAt = datetime()
             RETURN count(r) AS c`,
            { edges: chunk.map(e => ({
              fromUuid: e.fromUuid, toUuid: e.toUuid,
              evidence: { sourceType: e.evidence.sourceType, sourceUrl: e.evidence.sourceUrl, sourceDocument: e.evidence.sourceDocument, confidence: e.evidence.confidence, date: e.evidence.date },
            })) },
          ).catch(() => {});
          saved += chunk.length;
        } catch { /* continue */ }
      }
    }

    this.logger.log(`[Relation] Persisted ~${saved} edges`);
    return saved;
  }
}
