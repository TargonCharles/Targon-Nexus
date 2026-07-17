// =============================================================================
// IdentityService — 三层身份识别 + Internal Research ID 体系
//
// Level 1 (强): ORCID + Email → 置信度 0.99
// Level 2 (推荐): 姓名+单位+研究方向+合作者+论文时间 → 置信度 0.90-0.98
// Level 3 (模糊): 姓名+关键词 → 置信度 <0.80 → 人工审核
//
// Internal ID: RG_PERSON_XXXXXXXX (10位编号)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { normalizeNameExact } from '@arp/shared';

export interface IdentityMatch {
  internalId: string;
  confidence: number;
  level: 1 | 2 | 3;
  matchedBy: string;
  needsReview: boolean;
  externalIds: {
    orcid?: string;
    email?: string;
    googleScholarId?: string;
    scopusId?: string;
    wosId?: string;
    s2AuthorId?: string;
    homepageUrl?: string;
  };
  profile: {
    name: string;
    institution?: string;
    researchAreas?: string[];
    coauthors?: string[];
    firstPaperYear?: number;
    lastPaperYear?: number;
  };
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private idCounter = 0;

  constructor(private readonly neo4j: Neo4jService) {}

  /** 为所有人分配 Internal Research ID (批量写入) */
  async assignInternalIds(): Promise<number> {
    const people = await this.neo4j.read<{ uuid: string }>(`
      MATCH (p:Person) WHERE p.internalId IS NULL
      RETURN p.uuid AS uuid ORDER BY p.createdAt
    `);

    // 批量写入 (每批500条)
    const BATCH = 500;
    for (let offset = 0; offset < people.length; offset += BATCH) {
      const batch = people.slice(offset, offset + BATCH);
      const rows = batch.map((p, i) => ({
        uuid: p.uuid,
        id: `RG_PERSON_${String(offset + i + 1).padStart(8, '0')}`,
      }));
      await this.neo4j.write(
        `UNWIND $rows AS row MATCH (p:Person {uuid: row.uuid}) SET p.internalId = row.id`,
        { rows },
      );
    }
    this.logger.log(`Assigned internal IDs to ${people.length} people`);
    return people.length;
  }

  // ================================================================
  // Level 1: ORCID + Email 精确匹配 (0.99)
  // ================================================================

  async matchLevel1(): Promise<IdentityMatch[]> {
    const matches: IdentityMatch[] = [];

    // ORCID 精确匹配
    const orcidDups = await this.neo4j.read<any>(`
      MATCH (p:Person) WHERE p.orcid IS NOT NULL AND p.orcid <> '' AND NOT p.orcid CONTAINS '0000-000'
      WITH p.orcid AS orcid, collect(p) AS people, count(*) AS cnt
      WHERE cnt > 1
      RETURN orcid, [p IN people | {uuid: p.uuid, name: coalesce(p.chineseName, p.englishName), internalId: p.internalId}] AS people
    `);

    for (const row of orcidDups) {
      const canonical = row.people[0];
      matches.push({
        internalId: canonical.internalId,
        confidence: 0.99,
        level: 1,
        matchedBy: `ORCID: ${row.orcid}`,
        needsReview: false,
        externalIds: { orcid: row.orcid },
        profile: { name: canonical.name },
      });
    }

    // Email 精确匹配
    const emailDups = await this.neo4j.read<any>(`
      MATCH (p:Person) WHERE p.email IS NOT NULL AND p.email <> ''
      WITH p.email AS email, collect(p) AS people, count(*) AS cnt
      WHERE cnt > 1
      RETURN email, [p IN people | {uuid: p.uuid, name: coalesce(p.chineseName, p.englishName), internalId: p.internalId}] AS people
    `);

    for (const row of emailDups) {
      const canonical = row.people[0];
      if (!matches.find(m => m.internalId === canonical.internalId)) {
        matches.push({
          internalId: canonical.internalId,
          confidence: 0.99,
          level: 1,
          matchedBy: `Email: ${row.email}`,
          needsReview: false,
          externalIds: { email: row.email },
          profile: { name: canonical.name },
        });
      }
    }

    return matches;
  }

  // ================================================================
  // Level 2: 姓名+单位+研究方向+合作者+论文时间 (0.90-0.98)
  // ================================================================

  async matchLevel2(): Promise<IdentityMatch[]> {
    const matches: IdentityMatch[] = [];
    const BATCH_SIZE = 5000;

    // 获取所有人（分批）
    const total = await this.neo4j.readOne<{ c: number }>(`
      MATCH (p:Person) WHERE p.englishName IS NOT NULL
      RETURN count(p) AS c
    `);

    for (let offset = 0; offset < (total?.c ?? 0); offset += BATCH_SIZE) {
      const batch = await this.neo4j.read<any>(`
        MATCH (p:Person) WHERE p.englishName IS NOT NULL
        OPTIONAL MATCH (p)-[:AFFILIATED_WITH]->(u:University)
        OPTIONAL MATCH (p)-[:MEMBER_OF]->(lab:Lab)
        OPTIONAL MATCH (p)-[:COAUTHOR_WITH]-(co:Person)
        WITH p, u, lab,
             collect(DISTINCT co.englishName)[0..10] AS coauthors,
             p.firstPaperYear AS firstYear,
             p.lastPaperYear AS lastYear
        RETURN p.uuid AS uuid,
               p.internalId AS internalId,
               p.englishName AS name,
               p.chineseName AS chineseName,
               p.researchInterests AS interests,
               coalesce(u.englishName, u.name) AS institution,
               lab.name AS lab,
               coauthors,
               firstYear,
               lastYear
        ORDER BY p.englishName
        SKIP ${offset} LIMIT ${BATCH_SIZE}
      `);

      // 按规范化姓名分组
      const groups = new Map<string, any[]>();
      for (const p of batch) {
        const key = normalizeNameExact(p.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }

      for (const [, group] of groups) {
        if (group.length < 2) continue;

        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const score = this.computeLevel2Score(group[i], group[j]);
            if (score >= 0.90) {
              matches.push({
                internalId: group[i].internalId,
                confidence: score,
                level: 2,
                matchedBy: this.explainLevel2Match(group[i], group[j]),
                needsReview: score < 0.95,
                externalIds: {},
                profile: {
                  name: group[i].name,
                  institution: group[i].institution,
                  researchAreas: group[i].interests,
                  coauthors: group[i].coauthors,
                  firstPaperYear: group[i].firstYear?.toNumber?.(),
                  lastPaperYear: group[i].lastYear?.toNumber?.(),
                },
              });
            }
          }
        }
      }
    }

    return matches;
  }



  private computeLevel2Score(a: any, b: any): number {
    let score = 0;
    let weights = 0;

    // 姓名完全匹配 (0.3)
    if (a.name && b.name && a.name.toLowerCase() === b.name.toLowerCase()) {
      score += 0.30;
    }
    weights += 0.30;

    // 同机构 (0.25)
    if (a.institution && b.institution) {
      const normA = normalizeNameExact(a.institution);
      const normB = normalizeNameExact(b.institution);
      if (normA === normB) { score += 0.25; }
      else if (normA.includes(normB) || normB.includes(normA)) { score += 0.15; }
    }
    weights += 0.25;

    // 共享合作者 (0.20)
    const coA = new Set((a.coauthors || []).map((c: string) => normalizeNameExact(c)));
    const coB = new Set((b.coauthors || []).map((c: string) => normalizeNameExact(c)));
    if (coA.size > 0 && coB.size > 0) {
      const intersection = new Set([...coA].filter(x => coB.has(x)));
      const union = new Set([...coA, ...coB]);
      const jaccard = intersection.size / union.size;
      score += jaccard * 0.20;
    }
    weights += 0.20;

    // 研究方向重叠 (0.15)
    const raA = new Set((a.interests || []).map((r: string) => normalizeNameExact(r)));
    const raB = new Set((b.interests || []).map((r: string) => normalizeNameExact(r)));
    if (raA.size > 0 && raB.size > 0) {
      const intersection = new Set([...raA].filter(x => raB.has(x)));
      const union = new Set([...raA, ...raB]);
      const jaccard = intersection.size / union.size;
      score += jaccard * 0.15;
    }
    weights += 0.15;

    // 论文时间重叠 (0.10)
    const aFirst = a.firstYear?.toNumber?.() ?? a.firstYear;
    const aLast = a.lastYear?.toNumber?.() ?? a.lastYear;
    const bFirst = b.firstYear?.toNumber?.() ?? b.firstYear;
    const bLast = b.lastYear?.toNumber?.() ?? b.lastYear;
    if (aFirst && aLast && bFirst && bLast) {
      const overlap = Math.min(aLast, bLast) - Math.max(aFirst, bFirst);
      const range = Math.max(aLast, bLast) - Math.min(aFirst, bFirst);
      if (range > 0 && overlap > 0) {
        score += Math.min(1, overlap / range) * 0.10;
      }
    }
    weights += 0.10;

    return weights > 0 ? score / weights : 0;
  }

  private explainLevel2Match(a: any, b: any): string {
    const reasons: string[] = [];
    if (a.name?.toLowerCase() === b.name?.toLowerCase()) reasons.push('name match');
    if (a.institution === b.institution) reasons.push('same institution');
    if ((a.coauthors || []).some((c: string) => (b.coauthors || []).includes(c))) reasons.push('shared coauthors');
    return `Level2: ${reasons.join(' + ') || 'partial match'}`;
  }

  // ================================================================
  // Level 3: 姓名+关键词 模糊匹配 (<0.80) → 人工审核
  // ================================================================

  async matchLevel3(): Promise<IdentityMatch[]> {
    const matches: IdentityMatch[] = [];

    const candidates = await this.neo4j.read<any>(`
      MATCH (p:Person)
      WHERE p.englishName IS NOT NULL
        AND p.needsReview IS NOT TRUE
      OPTIONAL MATCH (p)-[:RESEARCHES_ON]->(rd:ResearchDirection)
      WITH p, collect(DISTINCT rd.name)[0..5] AS keywords
      RETURN p.uuid AS uuid, p.internalId AS internalId,
             coalesce(p.chineseName, p.englishName) AS name,
             p.researchInterests AS interests,
             keywords
      LIMIT 10000
    `);

    const groups = new Map<string, any[]>();
    for (const p of candidates) {
      const key = normalizeNameExact(p.name);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const score = this.computeLevel3Score(group[i], group[j]);
          if (score >= 0.50 && score < 0.80) {
            matches.push({
              internalId: group[i].internalId,
              confidence: score,
              level: 3,
              matchedBy: `Level3: name=${group[i].name}, keywords overlap`,
              needsReview: true, // 必须人工审核
              externalIds: {},
              profile: {
                name: group[i].name,
                researchAreas: group[i].interests,
              },
            });
          }
        }
      }
    }

    return matches;
  }

  private computeLevel3Score(a: any, b: any): number {
    const keywordsA = new Set((a.keywords || []).concat(a.interests || []).map((k: string) => normalizeNameExact(k)));
    const keywordsB = new Set((b.keywords || []).concat(b.interests || []).map((k: string) => normalizeNameExact(k)));
    if (keywordsA.size === 0 && keywordsB.size === 0) return 0;
    const intersection = new Set([...keywordsA].filter(x => keywordsB.has(x)));
    const union = new Set([...keywordsA, ...keywordsB]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  // ================================================================
  // 完整身份识别流程
  // ================================================================

  async runFullIdentityResolution(): Promise<{
    level1: number;
    level2: number;
    level3: number;
    needsReview: number;
    total: number;
  }> {
    // 1. 分配 Internal ID
    await this.assignInternalIds();

    // 2. Level 1: ORCID + Email
    const l1 = await this.matchLevel1();
    this.logger.log(`Level 1 matches: ${l1.length}`);

    // 3. Level 2: 姓名+单位+合作者+研究方向+时间
    const l2 = await this.matchLevel2();
    this.logger.log(`Level 2 matches: ${l2.length}`);

    // 4. Level 3: 模糊匹配 → 人工审核
    const l3 = await this.matchLevel3();
    this.logger.log(`Level 3 (needs review): ${l3.length}`);

    // 5. 将 Level 3 匹配结果标记为待审核
    if (l3.length > 0) {
      await this.neo4j.write(`
        UNWIND $rows AS row
        MATCH (p:Person {internalId: row.id})
        SET p.needsReview = true, p.reviewReason = row.reason
      `, { rows: l3.map(m => ({ id: m.internalId, reason: m.matchedBy })) });
    }

    return {
      level1: l1.length,
      level2: l2.length,
      level3: l3.length,
      needsReview: l3.length,
      total: l1.length + l2.length + l3.length,
    };
  }

  // ================================================================
  // 获取人物家谱 (Genealogy)
  // ================================================================

  async getGenealogy(internalId: string): Promise<any> {
    // 导师链 (往上追溯三代)
    const advisors = await this.neo4j.read<any>(`
      MATCH path = (p:Person {internalId: $id})-[:ADVISOR_OF*1..3]->(ancestor:Person)
      WITH p, ancestor, length(path) AS generation
      RETURN ancestor.internalId AS id,
             coalesce(ancestor.chineseName, ancestor.englishName) AS name,
             ancestor.hIndex AS hIndex,
             generation
      ORDER BY generation
    `, { id: internalId });

    // 学生链 (往下追溯三代)
    const students = await this.neo4j.read<any>(`
      MATCH path = (p:Person {internalId: $id})<-[:ADVISOR_OF*1..3]-(descendant:Person)
      WITH p, descendant, length(path) AS generation
      RETURN descendant.internalId AS id,
             coalesce(descendant.chineseName, descendant.englishName) AS name,
             descendant.hIndex AS hIndex,
             generation
      ORDER BY generation
    `, { id: internalId });

    // 学术兄弟 (同导师)
    const siblings = await this.neo4j.read<any>(`
      MATCH (advisor:Person)-[:ADVISOR_OF]->(p:Person {internalId: $id})
      MATCH (advisor)-[:ADVISOR_OF]->(sibling:Person)
      WHERE sibling.internalId <> $id
      RETURN sibling.internalId AS id,
             coalesce(sibling.chineseName, sibling.englishName) AS name
    `, { id: internalId });

    return {
      internalId,
      ancestors: advisors.map(r => ({ id: r.id, name: r.name, hIndex: r.hIndex, generation: r.generation })),
      descendants: students.map(r => ({ id: r.id, name: r.name, hIndex: r.hIndex, generation: r.generation })),
      siblings: siblings.map(r => ({ id: r.id, name: r.name })),
      treeDepth: {
        up: Math.max(0, ...advisors.map(r => r.generation || 0)),
        down: Math.max(0, ...students.map(r => r.generation || 0)),
      },
    };
  }
}
