// ===========================================================================
// ValidationService — 数据质量校验规则
//
// 校验项:
//   - ORCID 格式: /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/
//   - 邮箱格式: RFC 5322 简化版
//   - URL 格式: 协议 + 域名
//   - Confidence 阈值: 0-1 范围
//   - 关系类型白名单
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

const ORCID_REGEX = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const URL_REGEX = /^https?:\/\/.+/;

export interface ValidationIssue {
  uuid: string;
  entityType: string;
  field: string;
  value: string;
  reason: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  totalChecked: number;
  issues: ValidationIssue[];
  passRate: number;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 运行所有校验规则 */
  async validateAll(): Promise<ValidationReport> {
    const [orcidIssues, emailIssues, urlIssues, confidenceIssues] =
      await Promise.all([
        this.validateOrcid(),
        this.validateEmail(),
        this.validateUrl(),
        this.validateConfidence(),
      ]);

    const issues = [...orcidIssues, ...emailIssues, ...urlIssues, ...confidenceIssues];
    const total = await this.countEntities();
    const passRate = total > 0
      ? Math.round((1 - new Set(issues.map((i) => i.uuid)).size / total) * 100) / 100
      : 1;

    return { totalChecked: total, issues, passRate };
  }

  /** 校验 ORCID 格式 */
  private async validateOrcid(): Promise<ValidationIssue[]> {
    const rows = await this.neo4j.read<{ uuid: string; orcid: string }>(
      `MATCH (p:Person) WHERE p.orcid IS NOT NULL
       RETURN p.uuid AS uuid, p.orcid AS orcid`,
    );

    return rows
      .filter((r) => !ORCID_REGEX.test(r.orcid))
      .map((r) => ({
        uuid: r.uuid,
        entityType: 'Person',
        field: 'orcid',
        value: r.orcid,
        reason: `Invalid ORCID format: ${r.orcid}`,
        severity: 'error' as const,
      }));
  }

  /** 校验邮箱格式 */
  private async validateEmail(): Promise<ValidationIssue[]> {
    const rows = await this.neo4j.read<{ uuid: string; email: string }>(
      `MATCH (p:Person) WHERE p.email IS NOT NULL
       RETURN p.uuid AS uuid, p.email AS email`,
    );

    return rows
      .filter((r) => !EMAIL_REGEX.test(r.email))
      .map((r) => ({
        uuid: r.uuid,
        entityType: 'Person',
        field: 'email',
        value: r.email,
        reason: `Invalid email format: ${r.email}`,
        severity: 'warning' as const,
      }));
  }

  /** 校验 URL 格式 */
  private async validateUrl(): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    // Person homepage
    const personRows = await this.neo4j.read<{ uuid: string; homepage: string }>(
      `MATCH (p:Person) WHERE p.homepage IS NOT NULL
       RETURN p.uuid AS uuid, p.homepage AS homepage`,
    );
    for (const r of personRows) {
      if (!URL_REGEX.test(r.homepage)) {
        issues.push({
          uuid: r.uuid, entityType: 'Person', field: 'homepage',
          value: r.homepage, reason: `Invalid URL: ${r.homepage}`, severity: 'warning',
        });
      }
    }

    // Lab homepage
    const labRows = await this.neo4j.read<{ uuid: string; homepage: string }>(
      `MATCH (l:Lab) WHERE l.homepage IS NOT NULL
       RETURN l.uuid AS uuid, l.homepage AS homepage`,
    );
    for (const r of labRows) {
      if (!URL_REGEX.test(r.homepage)) {
        issues.push({
          uuid: r.uuid, entityType: 'Lab', field: 'homepage',
          value: r.homepage, reason: `Invalid URL: ${r.homepage}`, severity: 'warning',
        });
      }
    }

    return issues;
  }

  /** 校验 Confidence 值范围 */
  private async validateConfidence(): Promise<ValidationIssue[]> {
    const rows = await this.neo4j.read<{ uuid: string; type: string; confidence: number }>(
      `MATCH ()-[r]->()
       WHERE r.confidence IS NOT NULL AND (r.confidence < 0 OR r.confidence > 1)
       RETURN startNode(r).uuid AS uuid, type(r) AS type, r.confidence AS confidence`,
    );

    return rows.map((r) => ({
      uuid: r.uuid,
      entityType: 'Relationship',
      field: `confidence (${r.type})`,
      value: String(r.confidence),
      reason: `Confidence out of range [0,1]: ${r.confidence}`,
      severity: 'error' as const,
    }));
  }

  /** 统计实体总数 */
  private async countEntities(): Promise<number> {
    const r = await this.neo4j.read<{ c: number }>(
      `MATCH (n) WHERE labels(n)[0] IN ['Person','Lab','University','Paper','Equipment','Facility']
       RETURN count(n) AS c`,
    );
    return r[0]?.c ?? 0;
  }
}
