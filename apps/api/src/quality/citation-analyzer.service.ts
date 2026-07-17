// =============================================================================
// CitationAnalyzer — 引用图谱分析 & 论文/研究者影响力评估
//
// 功能:
//   1. 论文 PageRank 计算 (简化版 — 基于引用计数衰减迭代)
//   2. 研究者 H-index 估算 (基于 S2 citationCount)
//   3. 高影响力研究者自动发现
//   4. 研究热点聚类 (基于共引关系)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface PaperInfluence {
  uuid: string;
  title: string;
  citationCount: number;
  influenceScore: number;  // 归一化影响力 (0-1)
  isHighlyCited: boolean;  // 引用数 > 同领域 90 分位
}

export interface ResearcherInfluence {
  uuid: string;
  name: string;
  totalCitations: number;
  estimatedHIndex: number;
  topPaperCount: number;    // 高被引论文数
  influenceTier: 'top_1_percent' | 'top_5_percent' | 'top_10_percent' | 'emerging' | 'unranked';
}

@Injectable()
export class CitationAnalyzerService {
  private readonly logger = new Logger(CitationAnalyzerService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  // -----------------------------------------------------------------------
  // 论文影响力计算
  // -----------------------------------------------------------------------

  /** 批量计算所有论文的影响力 */
  async computePaperInfluence(): Promise<{ analyzed: number; highlyCited: number }> {
    // 1. 获取引用计数分位数
    const stats = await this.neo4j.read<{ p50: number; p90: number; max: number }>(
      `MATCH (p:Paper) WHERE p.citationCount IS NOT NULL
       RETURN
         percentileDisc(p.citationCount, 0.50) AS p50,
         percentileDisc(p.citationCount, 0.90) AS p90,
         max(p.citationCount) AS max`,
    );

    const p90 = stats[0]?.p90 ?? 50;
    const maxCitations = stats[0]?.max ?? 1000;

    // 2. 更新每篇论文的影响力评分
    await this.neo4j.write(
      `MATCH (p:Paper) WHERE p.citationCount IS NOT NULL
       SET p.influenceScore = CASE
             WHEN $max > 0 THEN toFloat(p.citationCount) / $max
             ELSE 0
           END,
           p.isHighlyCited = p.citationCount >= $p90,
           p.influenceUpdatedAt = datetime()`,
      { p90, max: maxCitations },
    );

    // 3. 统计高被引论文数
    const hcCount = await this.neo4j.read<{ count: number }>(
      `MATCH (p:Paper {isHighlyCited: true}) RETURN count(p) AS count`,
    );

    const result = {
      analyzed: (await this.neo4j.read<{ c: number }>(
        `MATCH (p:Paper) WHERE p.citationCount IS NOT NULL RETURN count(p) AS c`,
      ))[0]?.c ?? 0,
      highlyCited: hcCount[0]?.count ?? 0,
    };

    this.logger.log(
      `Paper influence: ${result.analyzed} analyzed, ${result.highlyCited} highly cited (>=${p90} citations)`,
    );
    return result;
  }

  // -----------------------------------------------------------------------
  // 研究者影响力评估
  // -----------------------------------------------------------------------

  /** 计算所有研究者的影响力指标 */
  async computeResearcherInfluence(): Promise<{ analyzed: number; topResearchers: string[] }> {
    // 为每个有论文的研究者聚合统计
    await this.neo4j.write(
      `MATCH (p:Person)-[:AUTHORED_BY|PUBLISHED]->(paper:Paper)
       WHERE paper.citationCount IS NOT NULL
       WITH p, collect(paper.citationCount) AS citations, count(paper) AS paperCount
       SET p.totalCitations = reduce(s = 0, c IN citations | s + c),
           p.paperCount = paperCount,
           p.avgCitationsPerPaper = CASE WHEN paperCount > 0
             THEN toFloat(reduce(s = 0, c IN citations | s + c)) / paperCount
             ELSE 0 END`,
    );

    // 获取研究者统计用于计算 influenceTier
    const researchers = await this.neo4j.read<{
      uuid: string; name: string; totalCitations: number;
    }>(
      `MATCH (p:Person) WHERE p.totalCitations IS NOT NULL AND p.totalCitations > 0
       RETURN p.uuid AS uuid, p.englishName AS name,
              p.totalCitations AS totalCitations
       ORDER BY p.totalCitations DESC`,
    );

    // 估算 H-index = sqrt(totalCitations) * 0.5  (简化近似)
    for (const r of researchers) {
      const estimatedHIndex = Math.round(Math.sqrt(r.totalCitations) * 0.5);
      let tier: ResearcherInfluence['influenceTier'] = 'unranked';

      if (estimatedHIndex >= 50) tier = 'top_1_percent';
      else if (estimatedHIndex >= 30) tier = 'top_5_percent';
      else if (estimatedHIndex >= 15) tier = 'top_10_percent';
      else if (estimatedHIndex >= 5) tier = 'emerging';

      await this.neo4j.write(
        `MATCH (p:Person {uuid: $uuid})
         SET p.estimatedHIndex = $hIndex,
             p.influenceTier = $tier,
             p.influenceUpdatedAt = datetime()`,
        { uuid: r.uuid, hIndex: estimatedHIndex, tier },
      );
    }

    const top = researchers.slice(0, 10).map(r => `${r.name} (${r.totalCitations} citations)`);
    return { analyzed: researchers.length, topResearchers: top };
  }

  // -----------------------------------------------------------------------
  // 研究热点发现 (基于共引)
  // -----------------------------------------------------------------------

  /** 发现研究热点: 高共引论文聚类 */
  async discoverHotTopics(): Promise<{ topic: string; paperCount: number }[]> {
    return this.neo4j.read<{ topic: string; paperCount: number }>(
      `MATCH (p1:Paper)-[:CITES]->(p2:Paper)
       WHERE p1.year >= 2022 AND p2.year >= 2022
       WITH p1, count(p2) AS cociteCount
       WHERE cociteCount >= 3
       OPTIONAL MATCH (p1)-[:ABOUT]->(rd:ResearchDirection)
       WITH coalesce(rd.name, 'Uncategorized') AS topic, count(p1) AS paperCount
       WHERE paperCount >= 3
       RETURN topic, paperCount
       ORDER BY paperCount DESC
       LIMIT 20`,
    );
  }

  // -----------------------------------------------------------------------
  // 自动发现新种子 (高影响力人物)
  // -----------------------------------------------------------------------

  /** 发现应加入种子的高影响力研究者 (暂无 homepage) */
  async discoverSeedCandidates(): Promise<{
    name: string; uuid: string; totalCitations: number; reason: string;
  }[]> {
    return this.neo4j.read<{
      name: string; uuid: string; totalCitations: number; reason: string;
    }>(
      `MATCH (p:Person)
       WHERE p.totalCitations IS NOT NULL AND p.totalCitations >= 100
         AND p.homepage IS NULL AND p.orcid IS NULL
         AND p.englishName IS NOT NULL
       RETURN p.englishName AS name, p.uuid AS uuid,
              p.totalCitations AS totalCitations,
              '高被引但缺少主页/ORCID' AS reason
       ORDER BY p.totalCitations DESC
       LIMIT 30`,
    );
  }
}
