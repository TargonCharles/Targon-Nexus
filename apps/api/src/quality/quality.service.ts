import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface DQReport {
  timestamp: string;
  totals: {
    persons: number; labs: number; universities: number;
    papers: number; equipment: number; facilities: number;
    relationships: number;
  };
  issues: {
    orphans: number;
    circularAdvisors: string[][];
    duplicates: number;
    missingEvidence: number;
    expired: number;
    lowConfidence: number;
  };
  scores: {
    completeness: number;
    evidenceCoverage: number;
    freshness: number;
    overall: number;
  };
}

@Injectable()
export class QualityService {
  private readonly logger = new Logger(QualityService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 生成完整 DQ 报告 */
  async generateReport(): Promise<DQReport> {
    const [
      totals, orphans, circular, duplicates,
      missingEvidence, expired, lowConf,
    ] = await Promise.all([
      this.countTotals(),
      this.detectOrphans(),
      this.detectCircularAdvisors(),
      this.detectDuplicates(),
      this.countMissingEvidence(),
      this.countExpired(),
      this.countLowConfidence(),
    ]);

    const completeness = await this.calcCompleteness(totals);
    const evidenceCoverage = totals.relationships > 0
      ? 1 - missingEvidence / totals.relationships : 1;
    const freshness = 1 - expired / (totals.persons + totals.labs + 1);
    const overall = Math.round(
      (completeness * 0.3 + evidenceCoverage * 0.4 + freshness * 0.3) * 100,
    ) / 100;

    return {
      timestamp: new Date().toISOString(),
      totals,
      issues: {
        orphans,
        circularAdvisors: circular,
        duplicates,
        missingEvidence,
        expired,
        lowConfidence: lowConf,
      },
      scores: { completeness, evidenceCoverage, freshness, overall },
    };
  }

  private async countTotals(): Promise<DQReport['totals']> {
    const r = await this.neo4j.read<{ label: string; c: number }>(
      `MATCH (n) WHERE labels(n)[0] IN ['Person','Lab','University','Paper','Equipment','Facility']
       RETURN labels(n)[0] AS label, count(n) AS c`,
    );
    const relR = await this.neo4j.read<{ c: number }>(
      'MATCH ()-[r]->() RETURN count(r) AS c',
    );

    const map: Record<string, number> = {};
    r.forEach((row) => { map[row.label.toLowerCase()] = row.c; });

    return {
      persons: map['person'] || 0,
      labs: map['lab'] || 0,
      universities: map['university'] || 0,
      papers: map['paper'] || 0,
      equipment: map['equipment'] || 0,
      facilities: map['facility'] || 0,
      relationships: relR[0]?.c ?? 0,
    };
  }

  /** 孤立节点检测 */
  private async detectOrphans(): Promise<number> {
    const r = await this.neo4j.read<{ c: number }>(
      `MATCH (n)
       WHERE labels(n)[0] IN ['Person','Lab','University','Equipment','Paper']
       AND NOT (n)--()
       RETURN count(n) AS c`,
    );
    return r[0]?.c ?? 0;
  }

  /** ADVISOR_OF 循环引用检测 */
  private async detectCircularAdvisors(): Promise<string[][]> {
    try {
      const r = await this.neo4j.read<{ cycle: string[] }>(
        `MATCH path = (a:Person)-[:ADVISOR_OF*2..5]->(a)
         RETURN [n IN nodes(path) | coalesce(n.chineseName, n.englishName)] AS cycle
         LIMIT 5`,
      );
      return r.map((row) => row.cycle);
    } catch {
      return [];
    }
  }

  /** 重复实体检测 */
  private async detectDuplicates(): Promise<number> {
    const r = await this.neo4j.read<{ c: number }>(
      `MATCH (p:Person) WHERE p.englishName IS NOT NULL
       WITH toLower(p.englishName) AS n, collect(p.uuid) AS uuids
       WHERE size(uuids) > 1 RETURN count(*) AS c`,
    );
    return r[0]?.c ?? 0;
  }

  /** 缺失证据的关系数 */
  private async countMissingEvidence(): Promise<number> {
    const r = await this.neo4j.read<{ c: number }>(
      `MATCH ()-[r]->()
       WHERE r.evidenceUrl IS NULL
         AND NOT EXISTS { (r)-[:HAS_EVIDENCE]->(:Evidence) }
       RETURN count(r) AS c`,
    );
    return r[0]?.c ?? 0;
  }

  /** 过期数据（超过 90 天未验证） */
  private async countExpired(): Promise<number> {
    const r = await this.neo4j.read<{ c: number }>(
      `MATCH (n)
       WHERE (n:Person OR n:Lab) AND n.lastVerified IS NOT NULL
         AND n.lastVerified < datetime() - duration('P90D')
       RETURN count(n) AS c`,
    );
    return r[0]?.c ?? 0;
  }

  /** 低置信度关系数 */
  private async countLowConfidence(): Promise<number> {
    const r = await this.neo4j.read<{ c: number }>(
      `MATCH ()-[r]->()
       WHERE r.confidence IS NOT NULL AND r.confidence < 0.6
       RETURN count(r) AS c`,
    );
    return r[0]?.c ?? 0;
  }

  /** 完整性评分: 各实体类型必填字段填充率的加权平均 */
  private async calcCompleteness(
    totals: DQReport['totals'],
  ): Promise<number> {
    // 检查每个实体类型的核心字段填充情况
    const checks = await Promise.all([
      // Person: 检查 englishName/orcid/email
      this.neo4j.read<{ c: number }>(
        `MATCH (p:Person) WHERE p.englishName IS NOT NULL OR p.chineseName IS NOT NULL RETURN count(p) AS c`,
      ),
      // Lab: 检查 name/homepage
      this.neo4j.read<{ c: number }>(
        `MATCH (l:Lab) WHERE l.name IS NOT NULL AND l.homepage IS NOT NULL RETURN count(l) AS c`,
      ),
      // University: 检查 englishName/country
      this.neo4j.read<{ c: number }>(
        `MATCH (u:University) WHERE u.englishName IS NOT NULL AND u.country IS NOT NULL RETURN count(u) AS c`,
      ),
      // Paper: 检查 title/doi/year
      this.neo4j.read<{ c: number }>(
        `MATCH (p:Paper) WHERE p.title IS NOT NULL AND p.year IS NOT NULL RETURN count(p) AS c`,
      ),
      // Equipment: 检查 name/category
      this.neo4j.read<{ c: number }>(
        `MATCH (e:Equipment) WHERE e.name IS NOT NULL AND e.category IS NOT NULL RETURN count(e) AS c`,
      ),
      // Facility: 检查 name/country
      this.neo4j.read<{ c: number }>(
        `MATCH (f:Facility) WHERE f.name IS NOT NULL AND f.country IS NOT NULL RETURN count(f) AS c`,
      ),
      // Person with ORCID
      this.neo4j.read<{ c: number }>(
        `MATCH (p:Person) WHERE p.orcid IS NOT NULL RETURN count(p) AS c`,
      ),
    ]);

    const personComplete = totals.persons > 0 ? checks[0][0]?.c / totals.persons : 1;
    const labComplete = totals.labs > 0 ? checks[1][0]?.c / totals.labs : 1;
    const univComplete = totals.universities > 0 ? checks[2][0]?.c / totals.universities : 1;
    const paperComplete = totals.papers > 0 ? checks[3][0]?.c / totals.papers : 1;
    const equipComplete = totals.equipment > 0 ? checks[4][0]?.c / totals.equipment : 1;
    const facComplete = totals.facilities > 0 ? checks[5][0]?.c / totals.facilities : 1;
    const orcidCoverage = totals.persons > 0 ? checks[6][0]?.c / totals.persons : 0;

    return Math.round(
      (personComplete * 0.2 + labComplete * 0.15 + univComplete * 0.1 +
       paperComplete * 0.2 + equipComplete * 0.1 + facComplete * 0.1 +
       orcidCoverage * 0.15) * 100,
    ) / 100;
  }

  /** 孤立节点清理建议 */
  async getCleanupSuggestions(): Promise<Array<{ type: string; uuid: string; name: string; reason: string }>> {
    return this.neo4j.read(
      `MATCH (n)
       WHERE labels(n)[0] IN ['Person','Lab','Equipment']
       AND NOT (n)--()
       RETURN labels(n)[0] AS type, n.uuid AS uuid,
              coalesce(n.chineseName, n.englishName, n.name) AS name,
              'no_relationships' AS reason
       LIMIT 20`,
    );
  }
}
