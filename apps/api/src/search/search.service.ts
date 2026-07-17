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
  labels: string[]; highlights?: string[]; score?: number; sourceTier?: string;
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
    cypher: `CALL db.index.fulltext.queryNodes('person_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'person' AS type, coalesce(node.englishName, node.chineseName, 'Unknown') AS name, coalesce(node.chineseName, node.englishName) AS chineseName, node.currentStatus AS subtitle, labels(node) AS labels, coalesce(node.sourceTier, 'TIER_4_OTHER') AS sourceTier, score ORDER BY score DESC`,
  },
  lab: {
    cypher: `CALL db.index.fulltext.queryNodes('lab_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'lab' AS type, coalesce(node.name, node.englishName) AS name, coalesce(node.chineseName, node.englishName) AS chineseName, node.country AS subtitle, labels(node) AS labels, coalesce(node.sourceTier, 'TIER_4_OTHER') AS sourceTier, score ORDER BY score DESC`,
  },
  university: {
    cypher: `CALL db.index.fulltext.queryNodes('university_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'university' AS type, coalesce(node.englishName, node.chineseName) AS name, coalesce(node.chineseName, node.englishName) AS chineseName, node.country AS subtitle, labels(node) AS labels, coalesce(node.sourceTier, 'TIER_4_OTHER') AS sourceTier, score ORDER BY score DESC`,
  },
  equipment: {
    cypher: `CALL db.index.fulltext.queryNodes('equipment_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'equipment' AS type, node.name AS name, node.brand AS subtitle, labels(node) AS labels, coalesce(node.sourceTier, 'TIER_4_OTHER') AS sourceTier, score ORDER BY score DESC`,
  },
  research_direction: {
    cypher: `CALL db.index.fulltext.queryNodes('research_direction_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'research_direction' AS type, node.name AS name, 'Level ' + toString(node.level) AS subtitle, labels(node) AS labels, coalesce(node.sourceTier, 'TIER_4_OTHER') AS sourceTier, score ORDER BY score DESC`,
  },
  paper: {
    cypher: `CALL db.index.fulltext.queryNodes('paper_fulltext', $term) YIELD node, score //where RETURN node.uuid AS uuid, 'paper' AS type, node.title AS name, node.journal AS subtitle, labels(node) AS labels, coalesce(node.sourceTier, 'TIER_4_OTHER') AS sourceTier, score ORDER BY score DESC`,
  },
};

// 启动时校验所有模板都包含 //where 占位符,防止模板编辑后 WHERE 注入静默失效
for (const [type, template] of Object.entries(FULLTEXT_QUERIES)) {
  if (!template.cypher.includes('//where')) {
    throw new Error(`全文本查询模板 "${type}" 缺少 //where 占位符,无法注入过滤条件`);
  }
}

const ALL_TYPES: EntityType[] = [...VALID_ENTITY_TYPES];

/**
 * 综合评分: 全文本分数(60%) + 信源权威分(25%) + 时效性(15%)
 *
 * 权重设计:
 *   - fulltext score (0-1): 关键词匹配相关性
 *   - tier bonus (0-0.25): 基于 sourceTier 属性: TIER_1_OFFICIAL +0.25, TIER_2_ACADEMIC +0.15, TIER_3_WEB +0.05
 *   - freshness bonus (0-0.15): 30天以内满分, 1年以上0分
 */
const TIER_BONUS: Record<string, number> = {
  'TIER_1_OFFICIAL': 0.25,
  'TIER_2_ACADEMIC': 0.15,
  'TIER_3_WEB': 0.05,
  'TIER_4_OTHER': 0.02,
};

/**
 * 混合语言搜索词处理:
 *   将 ASCII 单词追加 * 通配符，CJK 片断保持原样。
 *   "高温 superconductor" → "高温 superconductor*"
 */
function buildMixedSearchTerm(term: string): string {
  return term
    .split(/\s+/)
    .map(word => {
      if (/[\x00-\x7F]+/.test(word) && !/[一-鿿]/.test(word)) {
        return word.endsWith('*') ? word : `${word}*`;
      }
      return word;
    })
    .join(' ');
}

function compositeScore(item: { score?: number; labels?: string[]; subtitle?: string; sourceTier?: string }): number {
  const textScore = item.score ?? 0;

  // 信源等级加分 — 直接从节点 sourceTier 属性读取
  const tierBonus = TIER_BONUS[item.sourceTier ?? ''] ?? 0.02;
  const labels = item.labels ?? [];

  // 时效性加分 — subtitle 中包含年份的 Paper 更新鲜
  let freshnessBonus = 0;
  if (labels.includes('Paper') && item.subtitle) {
    const yearMatch = item.subtitle.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      const age = new Date().getFullYear() - year;
      freshnessBonus = Math.max(0, 0.15 - age * 0.02); // 每年衰减 0.02
    }
  } else if (labels.includes('Person') || labels.includes('Lab') || labels.includes('University')) {
    freshnessBonus = 0.08; // 机构/人员变化慢, 基础时效分
  }

  return textScore * 0.60 + tierBonus + freshnessBonus;
}

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
    // 混合内容搜索优化:
    //   ASCII 词汇 → 追加 * 通配符 (e.g. "superconductor" → "superconductors")
    //   CJK 词汇 → 不加通配符 (Lucene CJK 分析器已做 bigram 分词，* 前缀不支持)
    //   混合输入 (e.g. "高温 superconductor") → ASCII 部分加 *, CJK 部分原样
    const hasCJK = /[一-鿿㐀-䶿豈-﫿　-〿＀-￯]/.test(term);
    const searchTerm = term.endsWith('*') ? term
      : hasCJK ? buildMixedSearchTerm(term)
      : `${term}*`;
    const { page, pageSize, skip } = paginate(opts, 100);

    // Cache key for this search combination
    const cacheKey = `search:${term}:${opts.type ?? '*'}:${opts.country ?? '*'}:${opts.field ?? '*'}:${page}:${pageSize}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Determine which types to query
    const types: EntityType[] = opts.type ? [opts.type] : ALL_TYPES;

    // Build optional filters with proper WHERE clause
    const params: Record<string, unknown> = { term: searchTerm };
    const conditions: string[] = [];

    if (opts.country) {
      // 不同实体类型到达国家的路径不同: Lab→BELONGS_TO, Person→AFFILIATED_WITH|WORKS_AT,
      // Person→MEMBER_OF|ALUMNI_OF→Lab→BELONGS_TO→University
      conditions.push(
        `(node.country = $country ` +
        `OR (node)-[:BELONGS_TO]->(:University {country: $country}) ` +
        `OR (node)-[:AFFILIATED_WITH|WORKS_AT]->(:University {country: $country}) ` +
        `OR (node)-[:MEMBER_OF|ALUMNI_OF]->(:Lab)-[:BELONGS_TO]->(:University {country: $country}))`
      );
      params.country = opts.country;
    }
    if (opts.field) {
      // 不同实体到研究方向的路径不同: Person→researchInterests 属性,
      // Person|Lab→RESEARCHES_ON, Person→MEMBER_OF|ALUMNI_OF→Lab→RESEARCHES_ON,
      // 实体→研究领域路径 (大小写不敏感)
      // EXISTS 子查询确保变量作用域正确: rd 指向 ResearchDirection 节点
      conditions.push(
        `(toLower($field) IN [x IN coalesce(node.researchInterests, []) | toLower(x)] ` +
        `OR EXISTS { (node)-[:RESEARCHES_ON]->(rd:ResearchDirection) WHERE toLower(rd.name) = toLower($field) } ` +
        `OR EXISTS { (node)-[:MEMBER_OF|ALUMNI_OF]->(:Lab)-[:RESEARCHES_ON]->(rd:ResearchDirection) WHERE toLower(rd.name) = toLower($field) } ` +
        `OR EXISTS { (node)-[:USED_FOR]->(rd:ResearchDirection) WHERE toLower(rd.name) = toLower($field) })`
      );
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

    // Count queries in parallel — use same WHERE filter as data queries
    const countQueries = types.map(async (type) => {
      const cypher = `CALL db.index.fulltext.queryNodes('${type}_fulltext', $term) YIELD node //where RETURN count(node) AS total`
        .replace('//where', whereClause);
      try {
        const r = await this.neo4j.read<{ total: number }>(cypher, params);
        return r[0]?.total ?? 0;
      } catch { return 0; }
    });

    const [results, counts] = await Promise.all([
      Promise.all(queries),
      Promise.all(countQueries),
    ]);

    // Merge all results, pre-compute composite scores once, THEN sort & paginate
    const allItems = results.flat().map(item => ({
      ...item,
      _score: compositeScore(item),
    }));
    allItems.sort((a, b) => b._score - a._score);
    const total = counts.reduce((s, c) => s + c, 0);
    const items = allItems.slice(skip, skip + pageSize).map(({ _score, ...item }) => item);

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
