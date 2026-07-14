// =============================================================================
// GraphQL Resolver — 核心查询
// 实体详情 / 关系图 / 搜索 / 引用网络
// =============================================================================

import { Resolver, Query, Args, ObjectType, Field, Int, Float, ID } from '@nestjs/graphql';
import { Neo4jService } from '../neo4j/neo4j.service';
import { SearchService } from '../search/search.service';

// — GraphQL Object Types —

@ObjectType()
class EntityNode {
  @Field(() => ID) uuid: string;
  @Field() type: string;
  @Field() label: string;
  @Field(() => Int, { nullable: true }) degree?: number;
  @Field(() => String, { nullable: true }) description?: string;
  @Field(() => Int, { nullable: true }) year?: number;
  @Field(() => Int, { nullable: true }) citationCount?: number;
}

@ObjectType()
class EntityEdge {
  @Field() source: string;
  @Field() target: string;
  @Field() type: string;
  @Field() label: string;
  @Field(() => Float, { nullable: true }) confidence?: number;
}

@ObjectType()
class GraphData {
  @Field(() => [EntityNode]) nodes: EntityNode[];
  @Field(() => [EntityEdge]) edges: EntityEdge[];
}

@ObjectType()
class SearchResult {
  @Field(() => ID) uuid: string;
  @Field() type: string;
  @Field() name: string;
  @Field({ nullable: true }) subtitle?: string;
  @Field(() => Float, { nullable: true }) score?: number;
}

@ObjectType()
class SearchResponse {
  @Field(() => [SearchResult]) items: SearchResult[];
  @Field(() => Int) total: number;
}

@ObjectType()
class PersonDetail {
  @Field(() => ID) uuid: string;
  @Field({ nullable: true }) englishName?: string;
  @Field({ nullable: true }) chineseName?: string;
  @Field({ nullable: true }) currentStatus?: string;
  @Field(() => [String], { nullable: true }) researchInterests?: string[];
  @Field({ nullable: true }) biography?: string;
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) orcid?: string;
  @Field({ nullable: true }) homepage?: string;
}

@ObjectType()
class PaperDetail {
  @Field(() => ID) uuid: string;
  @Field() doi: string;
  @Field() title: string;
  @Field(() => [String]) authors: string[];
  @Field({ nullable: true }) journal?: string;
  @Field(() => Int, { nullable: true }) year?: number;
  @Field(() => Int) citationCount: number;
  @Field(() => [String], { nullable: true }) keywords?: string[];
}

// — Resolver —

@Resolver()
export class GraphQLResolver {
  constructor(
    private readonly neo4j: Neo4jService,
    private readonly searchService: SearchService,
  ) {}

  /** 全文搜索 */
  @Query(() => SearchResponse)
  async search(
    @Args('query') query: string,
    @Args({ name: 'type', type: () => String, nullable: true }) type?: string,
    @Args({ name: 'page', type: () => Int, nullable: true }) page?: number,
    @Args({ name: 'pageSize', type: () => Int, nullable: true }) pageSize?: number,
  ): Promise<SearchResponse> {
    const result = await this.searchService.search(query, {
      type: type as any,
      page: page ?? 1,
      pageSize: pageSize ?? 20,
    });
    return {
      items: result.items.map((r) => ({
        uuid: r.uuid, type: r.type, name: r.name, subtitle: r.subtitle, score: r.score,
      })),
      total: result.total,
    };
  }

  /** 人物详情 */
  @Query(() => PersonDetail, { nullable: true })
  async person(@Args('uuid') uuid: string): Promise<PersonDetail | null> {
    const results = await this.neo4j.read<any>(
      `MATCH (p:Person {uuid: $uuid}) RETURN p`,
      { uuid },
    );
    if (!results.length) return null;
    const p = results[0] as any;
    return {
      uuid: p.uuid ?? uuid,
      englishName: p.englishName,
      chineseName: p.chineseName,
      currentStatus: p.currentStatus,
      researchInterests: p.researchInterests,
      biography: p.biography,
      email: p.email,
      orcid: p.orcid,
      homepage: p.homepage,
    };
  }

  /** 论文引用网络图 */
  @Query(() => GraphData)
  async citationGraph(
    @Args('paperUuid') paperUuid: string,
    @Args({ name: 'depth', type: () => Int, nullable: true }) depth?: number,
  ): Promise<GraphData> {
    const results = await this.neo4j.read<{
      nodeUuid: string; nodeType: string; nodeLabel: string; nodeProps: string;
      edgeSource: string; edgeTarget: string; edgeType: string;
    }>(
      `MATCH (p:Paper {uuid: $uuid})
       OPTIONAL MATCH (p)-[r:CITES|AUTHORED_BY]-(related)
       WHERE labels(related)[0] IN ['Paper', 'Person']
       RETURN
         p.uuid AS nodeUuid, 'Paper' AS nodeType, p.title AS nodeLabel,
         toString(properties(p)) AS nodeProps,
         null AS edgeSource, null AS edgeTarget, null AS edgeType
       UNION
       MATCH (p:Paper {uuid: $uuid})-[r:CITES|AUTHORED_BY]-(related)
       WHERE labels(related)[0] IN ['Paper', 'Person']
       RETURN
         related.uuid AS nodeUuid, labels(related)[0] AS nodeType,
         coalesce(related.title, related.englishName, related.name) AS nodeLabel,
         toString(properties(related)) AS nodeProps,
         startNode(r).uuid AS edgeSource,
         endNode(r).uuid AS edgeTarget,
         type(r) AS edgeType`,
      { uuid: paperUuid },
    );

    const nodesMap = new Map<string, any>();
    const edgesMap = new Map<string, any>();

    for (const row of results) {
      if (row.nodeUuid && !nodesMap.has(row.nodeUuid)) {
        let props = {};
        try { props = JSON.parse(row.nodeProps); } catch { /* ignore */ }
        nodesMap.set(row.nodeUuid, {
          uuid: row.nodeUuid,
          type: row.nodeType?.toLowerCase() || 'paper',
          label: row.nodeLabel || 'Unknown',
          description: props['description'] || null,
          year: props['year'] || null,
          citationCount: props['citationCount'] || null,
        });
      }
      if (row.edgeSource && row.edgeTarget) {
        const key = `${row.edgeSource}|${row.edgeType}|${row.edgeTarget}`;
        if (!edgesMap.has(key)) {
          edgesMap.set(key, {
            source: row.edgeSource,
            target: row.edgeTarget,
            type: row.edgeType || 'CITES',
            label: row.edgeType || '',
          });
        }
      }
    }

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };
  }

  /** 实体关系子图 — 2-hop */
  @Query(() => GraphData)
  async entityGraph(@Args('uuid') uuid: string): Promise<GraphData> {
    const results = await this.neo4j.read<{
      nodeUuid: string; nodeType: string; nodeLabel: string;
      edgeSource: string; edgeTarget: string; edgeType: string;
    }>(
      `MATCH (n {uuid: $uuid})-[r]-(m)
       RETURN n.uuid AS nodeUuid, labels(n)[0] AS nodeType,
              coalesce(n.name, n.englishName, n.chineseName, n.title) AS nodeLabel,
              null AS edgeSource, null AS edgeTarget, null AS edgeType
       UNION
       MATCH (n {uuid: $uuid})-[r]-(m)
       RETURN m.uuid AS nodeUuid, labels(m)[0] AS nodeType,
              coalesce(m.name, m.englishName, m.chineseName, m.title) AS nodeLabel,
              startNode(r).uuid AS edgeSource,
              endNode(r).uuid AS edgeTarget,
              type(r) AS edgeType`,
      { uuid },
    );

    const nodesMap = new Map<string, any>();
    const edgesMap = new Map<string, any>();

    for (const row of results) {
      if (row.nodeUuid && !nodesMap.has(row.nodeUuid)) {
        nodesMap.set(row.nodeUuid, {
          uuid: row.nodeUuid,
          type: row.nodeType?.toLowerCase() || 'unknown',
          label: row.nodeLabel || 'Unknown',
        });
      }
      if (row.edgeSource && row.edgeTarget) {
        const key = `${row.edgeSource}|${row.edgeType}|${row.edgeTarget}`;
        if (!edgesMap.has(key)) {
          edgesMap.set(key, {
            source: row.edgeSource,
            target: row.edgeTarget,
            type: row.edgeType || '',
            label: row.edgeType || '',
          });
        }
      }
    }

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };
  }
}
