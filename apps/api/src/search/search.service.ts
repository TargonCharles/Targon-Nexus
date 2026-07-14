import { Injectable } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { paginate } from '@arp/shared';

export type EntityType = 'person' | 'lab' | 'university' | 'equipment' | 'research_direction' | 'paper';

export const VALID_ENTITY_TYPES: readonly EntityType[] = [
  'person', 'lab', 'university', 'equipment', 'research_direction', 'paper',
] as const;

export function isValidEntityType(value: string): value is EntityType {
  return (VALID_ENTITY_TYPES as readonly string[]).includes(value);
}

export interface SearchResult {
  uuid: string; type: EntityType; name: string; subtitle?: string;
  labels: string[]; highlights?: string[]; score?: number;
}

export interface FacetCount { value: string; count: number; }
export interface SearchFacets {
  types: FacetCount[];
  countries: FacetCount[];
  fields: FacetCount[];
}

export interface SearchResponse {
  items: SearchResult[];
  total: number;
  facets: SearchFacets;
}

/**
 * 全文索引查询模板 — 不含 SKIP/LIMIT（分页在合并排序后统一处理）。
 * `//where` 占位符用于注入国家/领域过滤条件。
 */
const FULLTEXT_QUERIES: Record<EntityType, { cypher: string }> = {
  person: {
    cypher: `CALL db.index.fulltext.queryNodes('person_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'person' AS type, coalesce(node.englishName, node.chineseName, 'Unknown') AS name, node.currentStatus AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  lab: {
    cypher: `CALL db.index.fulltext.queryNodes('lab_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'lab' AS type, coalesce(node.name, node.englishName) AS name, node.country AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  university: {
    cypher: `CALL db.index.fulltext.queryNodes('university_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'university' AS type, coalesce(node.englishName, node.chineseName) AS name, node.country AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  equipment: {
    cypher: `CALL db.index.fulltext.queryNodes('equipment_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'equipment' AS type, node.name AS name, node.brand AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  research_direction: {
    cypher: `CALL db.index.fulltext.queryNodes('research_direction_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'research_direction' AS type, node.name AS name, 'Level ' + toString(node.level) AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  paper: {
    cypher: `CALL db.index.fulltext.queryNodes('paper_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'paper' AS type, node.title AS name, node.journal AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
};

const ALL_TYPES: EntityType[] = [...VALID_ENTITY_TYPES];

/** 简单的 LRU 风格内存缓存 */
class LruCache<V> {
  private map = new Map<string, { value: V; expiresAt: number }>();
  private maxSize: number;

  constructor(maxSize = 500) { this.maxSize = maxSize; }

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) { this.map.delete(key); return undefined; }
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      if (first) this.map.delete(first);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

@Injectable()
export class SearchService {
  private readonly cache = new LruCache<SearchResponse>(500);

  constructor(private readonly neo4j: Neo4jService) {}

  async search(
    query: string,
    opts: { type?: EntityType; country?: string; field?: string; page?: number; pageSize?: number } = {},
  ): Promise<SearchResponse> {
    const term = query.trim();
    // Add wildcard suffix for stemming coverage (e.g. "superconductor" → matches "superconductors")
    const searchTerm = term.endsWith('*') ? term : `${term}*`;
    const { page, pageSize, skip } = paginate(opts, 100);

    // Cache key for this search combination
    const cacheKey = `search:${term}:${opts.type ?? '*'}:${opts.country ?? '*'}:${opts.field ?? '*'}:${page}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Determine which types to query
    const types: EntityType[] = opts.type ? [opts.type] : ALL_TYPES;

    // Build optional filters with proper WHERE clause
    const params: Record<string, unknown> = { term: searchTerm };
    const conditions: string[] = [];

    if (opts.country) {
      conditions.push('(node.country = $country OR (node)-[:BELONGS_TO]->(:University {country: $country}))');
      params.country = opts.country;
    }
    if (opts.field) {
      conditions.push('(node.field = $field OR (node)-[:RESEARCHES_ON]->(:ResearchDirection {name: $field}))');
      params.field = opts.field;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';

    // Execute type queries in parallel — NO pagination here, get all results
    const queries = types.map(async (type) => {
      let cypher = FULLTEXT_QUERIES[type].cypher.replace('//where', whereClause);
      try {
        return await this.neo4j.read<SearchResult>(cypher, params);
      } catch {
        return [] as SearchResult[];
      }
    });

    // Count queries in parallel
    const countQueries = types.map(async (type) => {
      const cypher = `CALL db.index.fulltext.queryNodes('${type}_fulltext', $term) YIELD node RETURN count(node) AS total`;
      try {
        const r = await this.neo4j.read<{ total: number }>(cypher, { term: searchTerm });
        return r[0]?.total ?? 0;
      } catch { return 0; }
    });

    const [results, counts] = await Promise.all([
      Promise.all(queries),
      Promise.all(countQueries),
    ]);

    // Merge all results, sort by score, THEN paginate once
    const allItems = results.flat().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const total = counts.reduce((s, c) => s + c, 0);
    const items = allItems.slice(skip, skip + pageSize);

    // Facets — reuse counts from search to avoid duplicate fulltext queries
    const facets = await this.computeFacets(searchTerm, types, counts);

    const response = { items, total, facets };
    this.cache.set(cacheKey, response, 120_000); // 2 min TTL
    return response;
  }

  private async computeFacets(term: string, types: EntityType[], typeCounts: number[]): Promise<SearchFacets> {
    // Type counts from pre-computed search results (avoid re-running fulltext queries)
    const tCounts: FacetCount[] = types.map((t, i) => ({
      value: t, count: typeCounts[i] ?? 0,
    }));

    // Country counts (from Lab + University nodes)
    let countryCounts: FacetCount[] = [];
    try {
      const r = await this.neo4j.read<{ country: string; count: number }>(
        `CALL db.index.fulltext.queryNodes('lab_fulltext', $term) YIELD node RETURN coalesce(node.country, 'Unknown') AS country, count(*) AS count UNION ALL CALL db.index.fulltext.queryNodes('university_fulltext', $term) YIELD node RETURN coalesce(node.country, 'Unknown') AS country, count(*) AS count`,
        { term }
      );
      const map = new Map<string, number>();
      r.forEach(({ country, count }) => map.set(country, (map.get(country) ?? 0) + count));
      countryCounts = Array.from(map.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch { /* facets are best-effort */ }

    // Field counts
    let fieldCounts: FacetCount[] = [];
    try {
      const r = await this.neo4j.read<{ field: string; count: number }>(
        `CALL db.index.fulltext.queryNodes('research_direction_fulltext', $term) YIELD node RETURN node.name AS field, count(*) AS count`, { term }
      );
      fieldCounts = r.map(({ field, count }) => ({ value: field, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
    } catch { /* facets are best-effort */ }

    return { types: tCounts, countries: countryCounts, fields: fieldCounts };
  }

  async autocomplete(query: string): Promise<string[]> {
    if (!query || query.length < 2) return [];
    const cypher = `
      CALL db.index.fulltext.queryNodes('person_fulltext', $term + '*') YIELD node RETURN coalesce(node.englishName, node.chineseName) AS name LIMIT 5
      UNION
      CALL db.index.fulltext.queryNodes('lab_fulltext', $term + '*') YIELD node RETURN node.name AS name LIMIT 5
    `;
    const results = await this.neo4j.read<{ name: string }>(cypher, { term: query });
    return results.map((r) => r.name);
  }
}
