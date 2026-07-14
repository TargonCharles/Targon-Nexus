import { Injectable } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

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
 */
const FULLTEXT_QUERIES: Record<EntityType, { cypher: string }> = {
  person: {
    cypher: `CALL db.index.fulltext.queryNodes('person_fulltext', $term) YIELD node, score RETURN node.uuid AS uuid, 'person' AS type, coalesce(node.englishName, node.chineseName, 'Unknown') AS name, node.currentStatus AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  lab: {
    cypher: `CALL db.index.fulltext.queryNodes('lab_fulltext', $term) YIELD node, score RETURN node.uuid AS uuid, 'lab' AS type, coalesce(node.name, node.englishName) AS name, node.country AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  university: {
    cypher: `CALL db.index.fulltext.queryNodes('university_fulltext', $term) YIELD node, score RETURN node.uuid AS uuid, 'university' AS type, coalesce(node.englishName, node.chineseName) AS name, node.country AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  equipment: {
    cypher: `CALL db.index.fulltext.queryNodes('equipment_fulltext', $term) YIELD node, score RETURN node.uuid AS uuid, 'equipment' AS type, node.name AS name, node.brand AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  research_direction: {
    cypher: `CALL db.index.fulltext.queryNodes('research_direction_fulltext', $term) YIELD node, score RETURN node.uuid AS uuid, 'research_direction' AS type, node.name AS name, 'Level ' + toString(node.level) AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
  paper: {
    cypher: `CALL db.index.fulltext.queryNodes('paper_fulltext', $term) YIELD node, score RETURN node.uuid AS uuid, 'paper' AS type, node.title AS name, node.journal AS subtitle, labels(node) AS labels, score ORDER BY score DESC`,
  },
};

const ALL_TYPES: EntityType[] = [...VALID_ENTITY_TYPES];

@Injectable()
export class SearchService {
  constructor(private readonly neo4j: Neo4jService) {}

  async search(
    query: string,
    opts: { type?: EntityType; country?: string; field?: string; page?: number; pageSize?: number } = {},
  ): Promise<SearchResponse> {
    const term = query.trim();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));

    // Determine which types to query
    const types: EntityType[] = opts.type ? [opts.type] : ALL_TYPES;

    // Build optional filters
    const params: Record<string, unknown> = { term };

    let countryFilter = '';
    if (opts.country) {
      countryFilter = ' AND (node.country = $country OR (node)-[:BELONGS_TO]->(:University {country: $country}))';
      params.country = opts.country;
    }
    let fieldFilter = '';
    if (opts.field) {
      fieldFilter = ' AND (node.field = $field OR (node)-[:RESEARCHES_ON]->(:ResearchDirection {name: $field}))';
      params.field = opts.field;
    }

    // Execute type queries in parallel — NO pagination here, get all results
    const queries = types.map(async (type) => {
      let cypher = FULLTEXT_QUERIES[type].cypher;
      if (countryFilter || fieldFilter) {
        cypher = cypher.replace('ORDER BY', `${countryFilter}${fieldFilter} ORDER BY`);
      }
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
        const r = await this.neo4j.read<{ total: number }>(cypher, { term });
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
    const skip = (page - 1) * pageSize;
    const items = allItems.slice(skip, skip + pageSize);

    // Facets
    const facets = await this.computeFacets(term, types);

    return { items, total, facets };
  }

  private async computeFacets(term: string, types: EntityType[]): Promise<SearchFacets> {
    // Type counts
    const typeCounts = await Promise.all(types.map(async (t) => {
      try {
        const r = await this.neo4j.read<{ total: number }>(
          `CALL db.index.fulltext.queryNodes('${t}_fulltext', $term) YIELD node RETURN count(node) AS total`, { term }
        );
        return { value: t, count: r[0]?.total ?? 0 };
      } catch { return { value: t, count: 0 }; }
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

    return { types: typeCounts, countries: countryCounts, fields: fieldCounts };
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
