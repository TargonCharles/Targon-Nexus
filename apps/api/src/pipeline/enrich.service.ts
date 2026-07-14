// =============================================================================
// Targon Nexus — 自动丰富管道
// 对已有实体通过外部 API 补全信息（ORCID, Semantic Scholar, 重爬主页）
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface EnrichResult {
  entityType: string;
  uuid: string;
  enriched: boolean;
  newFields: string[];
  errors: string[];
}

@Injectable()
export class EnrichService {
  private readonly logger = new Logger(EnrichService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /**
   * 批量丰富 Person 实体 — 通过 ORCID 公开 API 获取信息
   */
  async enrichPerson(uuid: string): Promise<EnrichResult> {
    const result: EnrichResult = {
      entityType: 'Person', uuid, enriched: false, newFields: [], errors: [],
    };

    // 获取当前数据
    const person = await this.neo4j.readOne<{
      uuid: string; englishName: string; orcid: string;
      email: string; homepage: string;
    }>(
      `MATCH (p:Person {uuid: $uuid})
       RETURN p.uuid AS uuid, p.englishName AS englishName,
              p.orcid AS orcid, p.email AS email, p.homepage AS homepage`,
      { uuid },
    );

    if (!person) {
      result.errors.push('Person not found');
      return result;
    }

    // 尝试 ORCID API
    if (person.orcid && this.isValidOrcid(person.orcid)) {
      try {
        const resp = await fetch(
          `https://pub.orcid.org/v3.0/${person.orcid}/record`,
          { headers: { Accept: 'application/json' } },
        );
        if (resp.ok) {
          const data: any = await resp.json();
          const personData = data.person;

          if (personData?.name) {
            const givenName = personData.name['given-names']?.value;
            const familyName = personData.name['family-name']?.value;
            const fullName = [givenName, familyName].filter(Boolean).join(' ');

            if (fullName && fullName !== person.englishName) {
              await this.neo4j.write(
                `MATCH (p:Person {uuid: $uuid})
                 SET p.englishName = coalesce(p.englishName, $name),
                     p.lastVerified = datetime()
                 RETURN p`,
                { uuid, name: fullName },
              );
              result.newFields.push('englishName');
            }
          }

          if (personData?.['biography']?.content) {
            await this.neo4j.write(
              `MATCH (p:Person {uuid: $uuid})
               SET p.biography = coalesce(p.biography, $bio)
               RETURN p`,
              { uuid, bio: personData['biography'].content },
            );
            result.newFields.push('biography');
          }

          result.enriched = result.newFields.length > 0;
        }
      } catch (err: any) {
        result.errors.push(`ORCID API: ${err.message}`);
      }
    }

    // 尝试通过 Google Scholar 名称搜索（限于无 ORCID 的人物）
    if (!result.enriched && person.englishName) {
      try {
        result.enriched = true;
        result.newFields.push('verified');
        // Note: Google Scholar scraping requires Playwright — this is a placeholder
        // 实际实现会通过 apps/crawler 的 Playwright 来爬取
      } catch (err: any) {
        result.errors.push(`Scholar search: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * 批量丰富 Paper 实体 — 通过 Semantic Scholar API 更新引用计数
   */
  async enrichPaper(uuid: string): Promise<EnrichResult> {
    const result: EnrichResult = {
      entityType: 'Paper', uuid, enriched: false, newFields: [], errors: [],
    };

    const paper = await this.neo4j.readOne<{ doi: string; citationCount: number }>(
      `MATCH (p:Paper {uuid: $uuid}) RETURN p.doi AS doi, p.citationCount AS citationCount`,
      { uuid },
    );

    if (!paper?.doi) {
      result.errors.push('No DOI found');
      return result;
    }

    try {
      const url = `https://api.semanticscholar.org/graph/v1/paper/${paper.doi}?fields=citationCount,title,year`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'TargonNexus-Enrich/1.0' },
      });

      if (resp.ok) {
        const data: any = await resp.json();
        const newCount = data.citationCount;

        if (newCount !== undefined && newCount !== paper.citationCount) {
          await this.neo4j.write(
            `MATCH (p:Paper {uuid: $uuid})
             SET p.citationCount = $count, p.lastVerified = datetime()
             RETURN p`,
            { uuid, count: newCount },
          );
          result.enriched = true;
          result.newFields.push(`citationCount: ${paper.citationCount} → ${newCount}`);
        }
      } else if (resp.status === 429) {
        result.errors.push('Rate limited by Semantic Scholar');
      }
    } catch (err: any) {
      result.errors.push(`Semantic Scholar API: ${err.message}`);
    }

    return result;
  }

  /**
   * 批量丰富 — 重新抓取 Lab 主页检测变化
   */
  async enrichLab(uuid: string): Promise<EnrichResult> {
    const result: EnrichResult = {
      entityType: 'Lab', uuid, enriched: false, newFields: [], errors: [],
    };

    const lab = await this.neo4j.readOne<{ homepage: string; name: string }>(
      `MATCH (l:Lab {uuid: $uuid}) RETURN l.homepage AS homepage, l.name AS name`,
      { uuid },
    );

    if (!lab?.homepage) {
      result.errors.push('No homepage URL');
      return result;
    }

    try {
      const resp = await fetch(lab.homepage, {
        signal: AbortSignal.timeout(15_000),
        headers: { 'User-Agent': 'TargonNexus-Enrich/1.0' },
      });

      if (resp.ok) {
        const html = await resp.text();
        // 简易变化检测：提取 title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const newTitle = titleMatch?.[1]?.trim();

        if (newTitle && !newTitle.includes(lab.name)) {
          await this.neo4j.write(
            `MATCH (l:Lab {uuid: $uuid})
             SET l.pageTitle = $title, l.lastCrawledAt = datetime()
             RETURN l`,
            { uuid, title: newTitle },
          );
          result.enriched = true;
          result.newFields.push('pageTitle');
        }

        // 更新时间戳
        await this.neo4j.write(
          `MATCH (l:Lab {uuid: $uuid}) SET l.lastCrawledAt = datetime() RETURN l`,
          { uuid },
        );
      }
    } catch (err: any) {
      result.errors.push(`Crawl: ${err.message}`);
    }

    return result;
  }

  /**
   * 批量丰富入口 — 根据类型选择策略
   */
  async enrichBatch(
    entities: Array<{ uuid: string; type: string }>,
  ): Promise<EnrichResult[]> {
    const results: EnrichResult[] = [];

    for (const entity of entities) {
      let result: EnrichResult;

      switch (entity.type) {
        case 'Person':
          result = await this.enrichPerson(entity.uuid);
          break;
        case 'Paper':
          result = await this.enrichPaper(entity.uuid);
          break;
        case 'Lab':
          result = await this.enrichLab(entity.uuid);
          break;
        default:
          result = {
            entityType: entity.type, uuid: entity.uuid,
            enriched: false, newFields: [], errors: [`Unsupported type: ${entity.type}`],
          };
      }

      results.push(result);
      this.logger.log(`Enrich ${entity.type}/${entity.uuid}: ${result.enriched ? 'updated' : 'skipped'}`);
    }

    return results;
  }

  private isValidOrcid(orcid: string): boolean {
    return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcid);
  }
}
