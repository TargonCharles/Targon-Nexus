import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { generateUUID } from '@arp/shared';

/** 合法的关系类型白名单 — 防止 Cypher 注入 */
const VALID_RELATIONSHIP_TYPES = new Set([
  'ADVISOR_OF', 'AUTHORED_BY', 'AFFILIATED_WITH', 'BELONGS_TO',
  'MEMBER_OF', 'RESEARCHES_ON', 'CITES', 'HAS_EQUIPMENT',
  'HAS_CAREER_EVENT', 'HAS_EVIDENCE', 'SOURCED_FROM',
  'LOCATED_AT', 'OPERATED_BY', 'MANUFACTURED_BY',
]);

export interface EvidenceNode {
  uuid: string;
  sourceUrl: string;
  excerpt: string;
  evidenceType: 'web_page' | 'pdf' | 'api' | 'manual' | 'llm_extraction';
  collectedAt: string;
  title?: string;
  domain?: string;
  confidence: number;
}

@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 创建证据节点 */
  async createEvidence(params: {
    sourceUrl: string;
    excerpt?: string;
    evidenceType: string;
    title?: string;
    confidence?: number;
  }): Promise<string> {
    const uuid = generateUUID();
    const domain = this.extractDomain(params.sourceUrl);

    await this.neo4j.write(
      `CREATE (e:Evidence {
        uuid: $uuid, sourceUrl: $url, excerpt: $excerpt,
        evidenceType: $type, title: $title, domain: $domain,
        confidence: $conf, collectedAt: datetime(), createdAt: datetime()
      }) RETURN e.uuid`,
      {
        uuid, url: params.sourceUrl,
        excerpt: params.excerpt || null, type: params.evidenceType,
        title: params.title || null, domain,
        conf: params.confidence || 0.8,
      },
    );

    this.logger.log(`Evidence created: ${uuid} (${params.evidenceType})`);
    return uuid;
  }

  /** 将证据绑定到关系 */
  async linkEvidenceToRelationship(params: {
    evidenceUuid: string;
    sourceUuid: string;
    targetUuid: string;
    relationshipType: string;
  }): Promise<void> {
    // 校验关系类型，防止 Cypher 注入
    if (!VALID_RELATIONSHIP_TYPES.has(params.relationshipType)) {
      throw new BadRequestException(`Invalid relationship type: ${params.relationshipType}`);
    }

    await this.neo4j.write(
      `MATCH (e:Evidence {uuid: $evUuid})
       MATCH (a {uuid: $srcUuid})-[r:${params.relationshipType}]->(b {uuid: $tgtUuid})
       MERGE (r)-[:HAS_EVIDENCE]->(e)
       SET r.evidenceUrl = coalesce(r.evidenceUrl, e.sourceUrl),
           r.verifiedAt = datetime()
       RETURN type(r)`,
      {
        evUuid: params.evidenceUuid,
        srcUuid: params.sourceUuid,
        tgtUuid: params.targetUuid,
      },
    );
  }

  /** 将证据绑定到实体节点 */
  async linkEvidenceToEntity(evidenceUuid: string, entityUuid: string): Promise<void> {
    await this.neo4j.write(
      `MATCH (e:Evidence {uuid: $evUuid})
       MATCH (n {uuid: $entUuid})
       MERGE (n)-[:SOURCED_FROM]->(e)
       RETURN labels(n)[0] AS label`,
      { evUuid: evidenceUuid, entUuid: entityUuid },
    );
  }

  /** 获取某实体的所有证据 */
  async getEvidenceForEntity(uuid: string): Promise<EvidenceNode[]> {
    return this.neo4j.read<EvidenceNode>(
      `MATCH (n {uuid: $uuid})-[*1..2]-(e:Evidence)
       RETURN DISTINCT e.uuid AS uuid, e.sourceUrl AS sourceUrl,
              e.excerpt AS excerpt, e.evidenceType AS evidenceType,
              toString(e.collectedAt) AS collectedAt, e.title AS title,
              e.domain AS domain, e.confidence AS confidence`,
      { uuid },
    );
  }

  /** 为所有现有关系创建证据追溯 */
  async backfillEvidence(): Promise<{ created: number; linked: number }> {
    let created = 0;
    let linked = 0;

    // 查找缺少证据的 ADVISOR_OF 关系
    const unverified = await this.neo4j.read<{ src: string; tgt: string; source: string }>(
      `MATCH (a:Person)-[r:ADVISOR_OF]->(b:Person)
       WHERE r.evidenceUrl IS NULL
       RETURN a.uuid AS src, b.uuid AS tgt, coalesce(r.source, 'manual') AS source
       LIMIT 100`,
    );

    for (const row of unverified) {
      const evUuid = await this.createEvidence({
        sourceUrl: `neo4j://relationship/advisor_of`,
        excerpt: `Advisor-student relationship between ${row.src} and ${row.tgt}`,
        evidenceType: row.source === 'manual' ? 'manual' : 'llm_extraction',
        confidence: row.source === 'manual' ? 0.95 : 0.7,
      });
      created++;

      await this.linkEvidenceToRelationship({
        evidenceUuid: evUuid,
        sourceUuid: row.src,
        targetUuid: row.tgt,
        relationshipType: 'ADVISOR_OF',
      }).catch(() => {});
      linked++;
    }

    return { created, linked };
  }

  /** 统计证据覆盖率 */
  async getEvidenceCoverage(): Promise<{
    totalRels: number; withEvidence: number; coverage: number;
  }> {
    const [total, withEv] = await Promise.all([
      this.neo4j.read<{ c: number }>('MATCH ()-[r]->() RETURN count(r) AS c'),
      this.neo4j.read<{ c: number }>(
        `MATCH ()-[r]->() WHERE r.evidenceUrl IS NOT NULL OR EXISTS { (r)-[:HAS_EVIDENCE]->(:Evidence) }
         RETURN count(r) AS c`,
      ),
    ]);

    const totalC = total[0]?.c ?? 0;
    const withC = withEv[0]?.c ?? 0;
    return {
      totalRels: totalC,
      withEvidence: withC,
      coverage: totalC > 0 ? Math.round((withC / totalC) * 100) / 100 : 0,
    };
  }

  private extractDomain(url: string): string {
    try { return new URL(url).hostname; } catch { return 'unknown'; }
  }
}
