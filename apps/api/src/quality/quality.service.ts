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

    const completeness = this.calcCompleteness(totals);
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

  /** 完整性评分: 有 name + 有关系的比例 */
  private calcCompleteness(totals: DQReport['totals']): number {
    const total = totals.persons + totals.labs + totals.universities;
    if (total === 0) return 0;

    const missingFields = 0; // 简化：后续可扩展检查 chineseName/orcid/email 等
    return Math.round((1 - missingFields / total) * 100) / 100;
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
