import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

/**
 * EnrichmentService — 人物信息多源富化
 *
 * 负责从 Semantic Scholar / Wikidata 等外部学术 API 获取人物详细信息，
 * 并回写到 Neo4j 图谱中。与 PersonService 解耦，按需注入。
 */
@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);
  private readonly S2_AUTHOR_SEARCH = 'https://api.semanticscholar.org/graph/v1/author/search';
  private readonly S2_AUTHOR = 'https://api.semanticscholar.org/graph/v1/author';
  private readonly WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

  constructor(private readonly neo4j: Neo4jService) {}

  // =======================================================================
  // 公开入口
  // =======================================================================

  /** 富化人物信息 (多源: S2 + Wikidata + S2 论文列表)，返回 true 表示完成 */
  async enrichPerson(uuid: string, name: string, currentResult: any): Promise<boolean> {
    try {
      this.logger.log(`BG enrich: "${name}"`);

      // 并行: S2 作者资料 + Wikidata
      const [s2Profile, wikidata] = await Promise.all([
        this.fetchS2AuthorProfile(name),
        this.fetchWikidata(name),
      ]);

      const updates: string[] = ['p.updatedAt = datetime()'];
      const params: any = { uuid };

      // --- S2 数据 ---
      if (s2Profile) {
        if (s2Profile.homepage) { updates.push('p.homepage = $homepage'); params.homepage = s2Profile.homepage; }
        if (s2Profile.hIndex != null) { updates.push('p.hIndex = $hIndex'); params.hIndex = s2Profile.hIndex; }
        if (s2Profile.paperCount != null) { updates.push('p.paperCount = $paperCount'); params.paperCount = s2Profile.paperCount; }
        if (s2Profile.citationCount != null) { updates.push('p.citationCount = $citationCount'); params.citationCount = s2Profile.citationCount; }
        if (s2Profile.description) { updates.push('p.description = coalesce(p.description, $desc)'); params.desc = s2Profile.description; }

        if (s2Profile.affiliation && !currentResult.university) {
          await this.neo4j.write(
            `MERGE (u:University {name: $aff}) ON CREATE SET u.uuid = randomUUID(), u.englishName = $aff, u.createdAt = datetime() WITH u MATCH (p:Person {uuid: $uuid}) MERGE (p)-[:AFFILIATED_WITH]->(u)`,
            { uuid, aff: s2Profile.affiliation },
          ).catch((e: any) => this.logger.warn(`S2 affiliation merge failed: ${e?.message}`));
        }

        // 获取 S2 完整论文列表并入库
        if (s2Profile.authorId) {
          this.fetchS2AuthorPapers(s2Profile.authorId, uuid).catch((e: any) => this.logger.warn(`S2 papers fetch failed: ${e?.message}`));
        }

        // 发现个人主页 → 加入爬取队列深度抓取
        if (s2Profile.homepage) {
          this.enqueueHomepageCrawl(uuid, name, s2Profile.homepage);
        }
      }

      // --- Wikidata 数据: 学术家谱 + 履历 ---
      if (wikidata) {
        if (wikidata.advisorName) {
          updates.push('p.advisorName = $advisorName'); params.advisorName = wikidata.advisorName;
          await this.neo4j.write(
            `MERGE (adv:Person {englishName: $advName}) ON CREATE SET adv.uuid = randomUUID(), adv.createdAt = datetime() WITH adv MATCH (p:Person {uuid: $uuid}) MERGE (adv)-[:ADVISOR_OF]->(p)`,
            { uuid, advName: wikidata.advisorName },
          ).catch((e: any) => this.logger.warn(`Wikidata advisor merge failed: ${e?.message}`));
        }
        if (wikidata.almaMater) {
          await this.neo4j.write(
            `MATCH (p:Person {uuid: $uuid}) MERGE (u:University {name: $alma}) ON CREATE SET u.uuid = randomUUID(), u.englishName = $alma, u.createdAt = datetime() WITH p, u MERGE (p)-[:AFFILIATED_WITH {type: 'alumni'}]->(u)`,
            { uuid, alma: wikidata.almaMater },
          ).catch((e: any) => this.logger.warn(`Wikidata almaMater merge failed: ${e?.message}`));
        }
        if (wikidata.birthDate) { updates.push('p.birthDate = $bd'); params.bd = wikidata.birthDate; }
      }

      if (updates.length > 1) {
        await this.neo4j.write(
          `MATCH (p:Person {uuid: $uuid}) SET ${updates.join(', ')} RETURN p.uuid`,
          params,
        ).catch((e: any) => this.logger.warn(`Enrich SET update failed: ${e?.message}`));
      }

      this.logger.log(`BG enrich done: "${name}" S2=${!!s2Profile} Wiki=${!!wikidata}`);
      return true;
    } catch (e: any) {
      this.logger.warn(`BG enrich failed for "${name}": ${e.message}`);
      return false;
    }
  }

  // =======================================================================
  // 爬取队列
  // =======================================================================

  /**
   * 将人物主页加入爬取队列。
   *
   * TODO: bullmq 不是 API 层的直接依赖——当前通过 monorepo hoist 间接可用。
   *       后续应通过专用的 QueueService 或 CrawlGateway 模块化调用。
   */
  private async enqueueHomepageCrawl(_personUuid: string, name: string, homepage: string) {
    try {
      const { createRedisConnection } = require('@arp/shared');
      const { Queue } = require('bullmq');
      const connection = createRedisConnection();
      const crawlQueue = new Queue('crawl', { connection });
      await crawlQueue.add(`homepage-${name}`, {
        seeds: [homepage],
        sourceType: 'personal-homepage',
        tier: 'TIER_1_OFFICIAL',
        maxPagesPerSeed: 5,
        depth: 1,
      }, { priority: 5, removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } });
      this.logger.log(`Crawl queued: "${name}" → ${homepage}`);
    } catch (e: any) {
      this.logger.debug(`Crawl queue unavailable: ${e.message}`);
    }
  }

  // =======================================================================
  // 外部 API 数据源
  // =======================================================================

  /** Wikidata SPARQL 查询: 获取导师、母校、出生年份 */
  private async fetchWikidata(name: string): Promise<{
    advisorName?: string; almaMater?: string; birthDate?: string;
  } | null> {
    try {
      // SPARQL 字符串转义 (反斜杠 → 双引号 → 控制字符)
      const safeName = name
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      const query = `
        SELECT ?person ?personLabel ?advisorLabel ?almaMaterLabel ?birthDate WHERE {
          ?person wdt:P31 wd:Q5;
                  rdfs:label ?personLabel.
          FILTER(CONTAINS(LCASE(?personLabel), LCASE("${safeName}")))
          FILTER(LANG(?personLabel) = "en")
          OPTIONAL { ?person wdt:P184 ?advisor. ?advisor rdfs:label ?advisorLabel. FILTER(LANG(?advisorLabel) = "en") }
          OPTIONAL { ?person wdt:P69 ?almaMater. ?almaMater rdfs:label ?almaMaterLabel. FILTER(LANG(?almaMaterLabel) = "en") }
          OPTIONAL { ?person wdt:P569 ?birthDate. }
        } LIMIT 3
      `;
      const url = `${this.WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'TargonNexus/1.0 (research)' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const data: any = await resp.json();
      const bindings = data?.results?.bindings;
      if (!bindings?.length) return null;

      const best = bindings.find((b: any) =>
        b.personLabel?.value?.toLowerCase() === name.toLowerCase()) || bindings[0];

      return {
        advisorName: best.advisorLabel?.value,
        almaMater: best.almaMaterLabel?.value,
        birthDate: best.birthDate?.value,
      };
    } catch { return null; }
  }

  /** 获取 S2 作者的完整论文列表并入库 */
  private async fetchS2AuthorPapers(authorId: string, personUuid: string): Promise<void> {
    try {
      const url = `https://api.semanticscholar.org/graph/v1/author/${authorId}/papers?limit=100&fields=title,year,citationCount,externalIds,abstract`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'TargonNexus/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) return;
      const data: any = await resp.json();
      const papers = data.data ?? [];

      if (papers.length > 0) {
        const batchParams: any = { personUuid, papers: papers.map((pp: any) => ({
          doi: pp.externalIds?.DOI || `s2:${pp.paperId}`,
          title: pp.title || '',
          year: pp.year,
          cit: pp.citationCount || 0,
        })) };
        await this.neo4j.write(
          `UNWIND $papers AS pp
           MERGE (paper:Paper {doi: pp.doi})
           ON CREATE SET paper.uuid = randomUUID(), paper.title = pp.title, paper.year = pp.year,
                         paper.citationCount = pp.cit, paper.createdAt = datetime(), paper.sourceTier = 'TIER_2_ACADEMIC'
           WITH paper, pp
           MATCH (p:Person {uuid: $personUuid})
           MERGE (p)-[:AUTHORED]->(paper)
           RETURN count(paper) AS c`,
          batchParams,
        ).catch((e: any) => this.logger.warn(`S2 papers batch merge failed: ${e?.message}`));
      }
      this.logger.log(`S2 papers: ${papers.length} saved for ${personUuid}`);
    } catch { /* silent */ }
  }

  /** 从 S2 API 搜索作者并获取详细资料 */
  private async fetchS2AuthorProfile(name: string): Promise<{
    authorId?: string; homepage?: string; hIndex?: number; paperCount?: number;
    citationCount?: number; affiliation?: string; description?: string;
  } | null> {
    try {
      const searchUrl = `${this.S2_AUTHOR_SEARCH}?query=${encodeURIComponent(name)}&limit=3`;
      const searchResp = await fetch(searchUrl, {
        headers: { 'User-Agent': 'TargonNexus/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!searchResp.ok) return null;
      const searchData: any = await searchResp.json();
      const authors = searchData.data ?? [];
      if (!authors.length) return null;

      const bestMatch = authors.find((a: any) =>
        a.name?.toLowerCase() === name.toLowerCase()) || authors[0];

      const authorId = bestMatch.authorId;
      const detailUrl = `${this.S2_AUTHOR}/${authorId}?fields=name,url,homepage,hIndex,paperCount,citationCount,affiliations`;
      const detailResp = await fetch(detailUrl, {
        headers: { 'User-Agent': 'TargonNexus/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!detailResp.ok) return null;
      const detail: any = await detailResp.json();

      return {
        authorId,
        homepage: detail.homepage || '',
        hIndex: detail.hIndex,
        paperCount: detail.paperCount,
        citationCount: detail.citationCount,
        affiliation: detail.affiliations?.[0] || bestMatch.affiliations?.[0] || '',
        description: detail.affiliations?.join(', ') || '',
      };
    } catch { return null; }
  }
}
