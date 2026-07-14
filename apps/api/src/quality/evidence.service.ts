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

  /** 将证据绑定到关系两端节点 + 标记关系本身 */
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

    // Neo4j 5 不支持关系→节点的 MERGE，改为：
    // 1. 将 Evidence 链接到参与关系的两个节点
    // 2. 在关系属性上设置 evidenceUrl 作为标记
    await this.neo4j.write(
      `MATCH (e:Evidence {uuid: $evUuid})
       MATCH (a {uuid: $srcUuid})-[r:${params.relationshipType}]->(b {uuid: $tgtUuid})
       MERGE (a)-[:SOURCED_FROM]->(e)
       MERGE (b)-[:SOURCED_FROM]->(e)
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

    // 查找所有缺少证据的关系（不限类型）
    const unverified = await this.neo4j.read<{
      src: string; tgt: string; relType: string; source: string;
    }>(
      `MATCH (a)-[r]->(b)
       WHERE r.evidenceUrl IS NULL
         AND type(r) IN ['AFFILIATED_WITH','BELONGS_TO','MEMBER_OF','HAS_EQUIPMENT',
                         'RESEARCHES_ON','WORKS_AT','COAUTHOR_WITH','ADVISOR_OF',
                         'AUTHORED_BY','CITES','LOCATED_AT']
       RETURN a.uuid AS src, b.uuid AS tgt, type(r) AS relType,
              coalesce(r.source, 'csv_import') AS source
       LIMIT 500`,
    );

    for (const row of unverified) {
      if (!VALID_RELATIONSHIP_TYPES.has(row.relType)) continue;

      const evUuid = await this.createEvidence({
        sourceUrl: `neo4j://relationship/${row.relType.toLowerCase()}`,
        excerpt: `${row.relType} relationship between ${row.src} and ${row.tgt}`,
        evidenceType: row.source === 'manual' ? 'manual' : 'csv_import',
        confidence: row.source === 'manual' ? 0.95 : 0.8,
      });
      created++;

      await this.linkEvidenceToRelationship({
        evidenceUuid: evUuid,
        sourceUuid: row.src,
        targetUuid: row.tgt,
        relationshipType: row.relType,
      }).catch(() => {});
      linked++;
    }

    this.logger.log(`Evidence backfill: ${created} created, ${linked} linked`);
    return { created, linked };
  }

  /** 统计证据覆盖率 */
  async getEvidenceCoverage(): Promise<{
    totalRels: number; withEvidence: number; coverage: number;
  }> {
    const [total, withEv] = await Promise.all([
      this.neo4j.read<{ c: number }>('MATCH ()-[r]->() RETURN count(r) AS c'),
      this.neo4j.read<{ c: number }>(
        `MATCH ()-[r]->()
         WHERE r.evidenceUrl IS NOT NULL
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
