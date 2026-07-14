// — Paper 模块 —
// 论文详情、引用网络、引用图 API

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface PaperDetail {
  uuid: string;
  doi: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  citationCount: number;
  keywords: string[];
  url: string;
  source: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaperAuthor {
  uuid: string;
  name: string;
  englishName: string;
  authorOrder: number;
  isCorresponding: boolean;
}

export interface PaperReference {
  uuid: string;
  doi: string;
  title: string;
  year: number;
  journal: string;
  citationCount: number;
}

export interface GraphData {
  nodes: Array<{
    uuid: string;
    type: string;
    label: string;
    properties: Record<string, unknown>;
    degree?: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: string;
    label: string;
    properties: Record<string, unknown>;
  }>;
}

@Injectable()
export class PaperService {
  private readonly logger = new Logger(PaperService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 论文详情 + 作者列表 */
  async getPaper(uuid: string): Promise<PaperDetail | null> {
    const results = await this.neo4j.read<PaperDetail>(
      `MATCH (p:Paper {uuid: $uuid})
       RETURN p.uuid AS uuid, p.doi AS doi, p.title AS title,
              p.authors AS authors, p.journal AS journal, p.year AS year,
              p.citationCount AS citationCount, p.keywords AS keywords,
              p.url AS url, p.source AS source, p.confidence AS confidence,
              toString(p.createdAt) AS createdAt, toString(p.updatedAt) AS updatedAt`,
      { uuid },
    );
    return results[0] ?? null;
  }

  /** 论文作者列表（尝试匹配 Person 节点） */
  async getAuthors(uuid: string): Promise<PaperAuthor[]> {
    const result = await this.neo4j.read<PaperAuthor>(
      `MATCH (p:Paper {uuid: $uuid})
       OPTIONAL MATCH (p)-[r:AUTHORED_BY]->(person:Person)
       RETURN person.uuid AS uuid,
              coalesce(person.englishName, person.chineseName, person.name) AS name,
              person.englishName AS englishName,
              coalesce(r.authorPosition, 0) AS authorOrder,
              coalesce(r.isCorresponding, false) AS isCorresponding
       ORDER BY authorOrder`,
      { uuid },
    );
    return result;
  }

  /** 引用此论文的其他论文 */
  async getCitations(uuid: string, opts?: { page?: number; pageSize?: number }): Promise<{ items: PaperReference[]; total: number }> {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts?.pageSize ?? 20));

    const [items, countResult] = await Promise.all([
      this.neo4j.read<PaperReference>(
        `MATCH (citing:Paper)-[r:CITES]->(p:Paper {uuid: $uuid})
         RETURN citing.uuid AS uuid, citing.doi AS doi, citing.title AS title,
                citing.year AS year, citing.journal AS journal,
                citing.citationCount AS citationCount
         ORDER BY citing.year DESC
         SKIP $skip LIMIT $limit`,
        { uuid, skip: (page - 1) * pageSize, limit: pageSize },
      ),
      this.neo4j.read<{ total: number }>(
        `MATCH (:Paper)-[r:CITES]->(p:Paper {uuid: $uuid})
         RETURN count(r) AS total`,
        { uuid },
      ),
    ]);

    return { items, total: countResult[0]?.total ?? 0 };
  }

  /** 此论文引用了哪些论文 */
  async getReferences(uuid: string, opts?: { page?: number; pageSize?: number }): Promise<{ items: PaperReference[]; total: number }> {
    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, opts?.pageSize ?? 20));

    const [items, countResult] = await Promise.all([
      this.neo4j.read<PaperReference>(
        `MATCH (p:Paper {uuid: $uuid})-[r:CITES]->(ref:Paper)
         RETURN ref.uuid AS uuid, ref.doi AS doi, ref.title AS title,
                ref.year AS year, ref.journal AS journal,
                ref.citationCount AS citationCount
         ORDER BY ref.year DESC
         SKIP $skip LIMIT $limit`,
        { uuid, skip: (page - 1) * pageSize, limit: pageSize },
      ),
      this.neo4j.read<{ total: number }>(
        `MATCH (p:Paper {uuid: $uuid})-[r:CITES]->(:Paper)
         RETURN count(r) AS total`,
        { uuid },
      ),
    ]);

    return { items, total: countResult[0]?.total ?? 0 };
  }

  /** 论文引用子图（当前论文 + 直接引用/被引用论文 + O(作者)） */
  async getCitationGraph(uuid: string, depth: number = 1): Promise<GraphData> {
    const depthNum = Math.min(2, Math.max(1, depth));

    const results = await this.neo4j.read<{
      nodeUuid: string; nodeType: string; nodeLabel: string; nodeProps: string;
      edgeSource: string; edgeTarget: string; edgeType: string; edgeLabel: string; edgeProps: string;
    }>(
      `MATCH (p:Paper {uuid: $uuid})
       OPTIONAL MATCH (p)-[r:CITES|AUTHORED_BY]-(related)
       WHERE (labels(related)[0] IN ['Paper', 'Person'])
       RETURN
         related.uuid AS nodeUuid,
         labels(related)[0] AS nodeType,
         coalesce(related.title, related.englishName, related.name) AS nodeLabel,
         toString(properties(related)) AS nodeProps,
         startNode(r).uuid AS edgeSource,
         endNode(r).uuid AS edgeTarget,
         type(r) AS edgeType,
         type(r) AS edgeLabel,
         toString(properties(r)) AS edgeProps
       UNION
       MATCH (p:Paper {uuid: $uuid})
       RETURN
         p.uuid AS nodeUuid,
         'Paper' AS nodeType,
         p.title AS nodeLabel,
         toString(properties(p)) AS nodeProps,
         null AS edgeSource,
         null AS edgeTarget,
         null AS edgeType,
         null AS edgeLabel,
         null AS edgeProps`,
      { uuid },
    );

    const nodesMap = new Map<string, any>();
    const edgesMap = new Map<string, any>();

    for (const row of results) {
      if (row.nodeUuid) {
        let props = {};
        try { props = JSON.parse(row.nodeProps); } catch { /* ignore */ }
        nodesMap.set(row.nodeUuid, {
          uuid: row.nodeUuid,
          type: row.nodeType.toLowerCase(),
          label: row.nodeLabel || 'Unknown',
          properties: props,
          degree: 0,
        });
      }
      if (row.edgeSource && row.edgeTarget) {
        const key = `${row.edgeSource}|${row.edgeType}|${row.edgeTarget}`;
        let props = {};
        try { props = JSON.parse(row.edgeProps); } catch { /* ignore */ }
        edgesMap.set(key, {
          source: row.edgeSource,
          target: row.edgeTarget,
          type: row.edgeType || 'CITES',
          label: row.edgeLabel || '',
          properties: props,
        });
      }
    }

    // 计算度
    for (const edge of edgesMap.values()) {
      if (nodesMap.has(edge.source)) nodesMap.get(edge.source).degree++;
      if (nodesMap.has(edge.target)) nodesMap.get(edge.target).degree++;
    }

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };
  }

  /** 批量导入论文 + 匹配作者 */
  async importPaperBatch(papers: Array<{
    doi: string; title: string; authors: string[]; year: number;
    journal: string; citationCount: number; keywords: string[];
  }>): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const paper of papers) {
      const result = await this.neo4j.write(
        `MERGE (p:Paper {doi: $doi})
         ON CREATE SET
           p.uuid = randomUUID(),
           p.title = $title,
           p.authors = $authors,
           p.year = $year,
           p.journal = $journal,
           p.citationCount = $citationCount,
           p.keywords = $keywords,
           p.source = 'bulk_import',
           p.confidence = 0.9,
           p.createdAt = datetime(),
           p.updatedAt = datetime()
         ON MATCH SET
           p.citationCount = $citationCount,
           p.updatedAt = datetime()
         RETURN p.uuid AS uuid, p.createdAt AS createdAt`,
        {
          doi: paper.doi,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          journal: paper.journal,
          citationCount: paper.citationCount,
          keywords: paper.keywords,
        },
      );

      if (result.length > 0) {
        const createdAt = result[0]?.get?.('createdAt');
        if (createdAt) created++; else updated++;

        // 尝试匹配作者到已有的 Person 节点
        for (let i = 0; i < paper.authors.length; i++) {
          const authorName = paper.authors[i].trim();
          if (!authorName) continue;

          await this.neo4j.write(
            `MATCH (p:Paper {doi: $doi})
             MATCH (person:Person)
             WHERE toLower(person.englishName) CONTAINS toLower($authorName)
                OR toLower(person.chineseName) CONTAINS toLower($authorName)
                OR any(alias IN coalesce(person.aliases, []) WHERE toLower(alias) CONTAINS toLower($authorName))
             MERGE (p)-[r:AUTHORED_BY]->(person)
             ON CREATE SET
               r.authorPosition = $position,
               r.confidence = 0.7,
               r.source = 'name_matching',
               r.createdAt = datetime()
             ON MATCH SET r.updatedAt = datetime()
             RETURN r`,
            { doi: paper.doi, authorName, position: i + 1 },
          );
        }
      }
    }

    return { created, updated };
  }
}
