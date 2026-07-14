import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

interface S2Paper {
  paperId: string; title: string; year: number;
  citationCount: number; authors: Array<{ name: string; authorId: string }>;
  doi?: string; externalIds?: { DOI?: string };
  journal?: { name: string }; references?: Array<{ paperId: string; title: string }>;
  citations?: Array<{ paperId: string; title: string }>;
}

export interface OrcidRecord {
  orcid: string; givenNames: string; familyName: string;
  biography: string; employments: Array<{ org: string; startYear: string }>;
  educations: Array<{ org: string; degree: string; startYear: string }>;
}

@Injectable()
export class ExternalApiService {
  private readonly logger = new Logger(ExternalApiService.name);
  private s2Base = 'https://api.semanticscholar.org/graph/v1';
  private orcidBase = 'https://pub.orcid.org/v3.0';

  constructor(private readonly neo4j: Neo4jService) {}

  // ========== Semantic Scholar API ==========

  /** 按 DOI 获取论文引用网络 */
  async enrichPaperByDOI(doi: string): Promise<{ citations: number; refs: number }> {
    const url = `${this.s2Base}/paper/DOI:${doi}?fields=title,citationCount,citations.paperId,citations.title,references.paperId,references.title`;
    const data = await this.fetchJson<S2Paper>(url);

    if (!data) return { citations: 0, refs: 0 };

    let citations = 0, refs = 0;

    // 导入引用此文炳的论文
    if (data.citations) {
      for (const cite of data.citations.slice(0, 20)) {
        if (!cite.paperId) continue;
        await this.neo4j.write(
          `MERGE (citing:Paper {doi: $doi})
           ON CREATE SET citing.uuid = randomUUID(), citing.title = $title,
             citing.source = 'semantic_scholar', citing.createdAt = datetime()
           WITH citing
           MATCH (p:Paper {doi: $target})
           MERGE (citing)-[:CITES {confidence:0.9,source:'semantic_scholar'}]->(p)`,
          { doi: `S2:${cite.paperId}`, title: cite.title || 'Unknown', target: doi },
        ).catch(() => {});
        citations++;
      }
    }

    // 导入此文炳引用的论文
    if (data.references) {
      for (const ref of data.references.slice(0, 20)) {
        if (!ref.paperId) continue;
        await this.neo4j.write(
          `MERGE (ref:Paper {doi: $doi})
           ON CREATE SET ref.uuid = randomUUID(), ref.title = $title,
             ref.source = 'semantic_scholar', ref.createdAt = datetime()
           WITH ref
           MATCH (p:Paper {doi: $target})
           MERGE (p)-[:CITES {confidence:0.9,source:'semantic_scholar'}]->(ref)`,
          { doi: `S2:${ref.paperId}`, title: ref.title || 'Unknown', target: doi },
        ).catch(() => {});
        refs++;
      }
    }

    // 更新引用计数
    if (data.citationCount) {
      await this.neo4j.write(
        `MATCH (p:Paper {doi: $doi}) SET p.citationCount = $c`,
        { doi, c: data.citationCount },
      );
    }

    this.logger.log(`SemanticScholar: ${doi} → ${citations} citing, ${refs} refs`);
    return { citations, refs };
  }

  /** 按领域搜索论文并批量导入 */
  async searchAndImport(query: string, limit = 20): Promise<{ imported: number }> {
    const url = `${this.s2Base}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,year,journal,doi,citationCount`;
    const data = await this.fetchJson<{ data: S2Paper[] }>(url);

    if (!data?.data) return { imported: 0 };

    let imported = 0;
    for (const paper of data.data) {
      const doi = paper.doi || paper.externalIds?.DOI || `S2:${paper.paperId}`;
      try {
        await this.neo4j.write(
          `MERGE (p:Paper {doi: $doi})
           ON CREATE SET p.uuid = randomUUID(), p.title = $title,
             p.year = $year, p.journal = $journal,
             p.citationCount = $cc, p.source = 'semantic_scholar',
             p.createdAt = datetime(), p.updatedAt = datetime(),
             p.confidence = 0.9`,
          { doi, title: paper.title, year: paper.year,
            journal: paper.journal?.name || null, cc: paper.citationCount || 0 },
        );
        imported++;
      } catch { /* skip */ }
    }

    this.logger.log(`SemanticScholar search "${query}": ${imported} papers imported`);
    return { imported };
  }

  // ========== ORCID API ==========

  /** 通过 ORCID 获取研究者完整信息 */
  async enrichPersonByORCID(orcid: string): Promise<OrcidRecord | null> {
    const url = `${this.orcidBase}/${orcid}/record`;
    const data = await this.fetchJson<any>(url, {
      Accept: 'application/json',
    });

    if (!data?.person) return null;

    const p = data.person;
    const record: OrcidRecord = {
      orcid,
      givenNames: p.name?.['given-names']?.value || '',
      familyName: p.name?.['family-name']?.value || '',
      biography: p.biography?.content || '',
      employments: [],
      educations: [],
    };

    // 解析工作经历
    const activities = data['activities-summary'];
    if (activities?.employments?.['employment-summary']) {
      for (const emp of activities.employments['employment-summary']) {
        record.employments.push({
          org: emp.organization?.name || '',
          startYear: emp['start-date']?.year?.value || '',
        });
      }
    }

    // 解析教育经历
    if (activities?.educations?.['education-summary']) {
      for (const edu of activities.educations['education-summary']) {
        record.educations.push({
          org: edu.organization?.name || '',
          degree: edu['role-title'] || '',
          startYear: edu['start-date']?.year?.value || '',
        });
      }
    }

    // 写入 Person 节点
    const fullName = [record.givenNames, record.familyName].filter(Boolean).join(' ');
    await this.neo4j.write(
      `MATCH (p:Person {orcid: $orcid})
       SET p.englishName = coalesce(p.englishName, $name),
           p.biography = coalesce(p.biography, $bio),
           p.lastVerified = datetime()
       RETURN p.uuid`,
      { orcid, name: fullName || null, bio: record.biography || null },
    );

    return record;
  }

  /** 批量丰富有 ORCID 的人物 */
  async batchEnrichPersons(limit = 10): Promise<{ enriched: number }> {
    const people = await this.neo4j.read<{ uuid: string; orcid: string }>(
      `MATCH (p:Person) WHERE p.orcid IS NOT NULL AND p.lastVerified IS NULL
       RETURN p.uuid AS uuid, p.orcid AS orcid LIMIT ${limit}`,
    );

    let enriched = 0;
    for (const p of people) {
      try {
        const record = await this.enrichPersonByORCID(p.orcid);
        if (record) enriched++;
        await this.delay(1000); // ORCID rate limit
      } catch {
        /* skip */
      }
    }

    return { enriched };
  }

  // ========== Helpers ==========

  private async fetchJson<T>(url: string, extraHeaders?: Record<string, string>): Promise<T | null> {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'TargonNexus/1.0 (mailto:research@targon-nexus.org)',
          ...extraHeaders,
        },
      });
      if (resp.status === 429) {
        this.logger.warn(`Rate limited: ${url}`);
        return null;
      }
      if (!resp.ok) return null;
      return await resp.json() as T;
    } catch (e: any) {
      this.logger.warn(`API fetch failed: ${url} — ${e.message}`);
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
