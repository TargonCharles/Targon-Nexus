// =============================================================================
// FeedbackCollectorService — 提取质量反馈闭环
//
// 收集用户纠错 → 构建 few-shot 样本库 → 优化 LLM prompt
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface ExtractionFeedback {
  entityName: string;
  entityType: string;
  field: string;
  wrongValue: string;
  correctValue: string;
  sourceUrl?: string;
  submittedAt: string;
}

export interface FewShotExample {
  input: string;
  expectedOutput: string;
  domain: string;
  successCount: number;
}

@Injectable()
export class FeedbackCollectorService {
  private readonly logger = new Logger(FeedbackCollectorService.name);
  private readonly promptSamples: FewShotExample[] = [];

  constructor(private readonly neo4j: Neo4jService) {}

  /** 记录一次纠错反馈 */
  async recordCorrection(feedback: ExtractionFeedback): Promise<void> {
    await this.neo4j.write(
      `CREATE (f:Feedback {
        uuid: randomUUID(),
        entityName: $entityName, entityType: $entityType,
        field: $field, wrongValue: $wrongValue, correctValue: $correctValue,
        sourceUrl: $sourceUrl, submittedAt: datetime()
      })
      RETURN f.uuid`,
      { ...feedback },
    );

    this.logger.log(
      `Feedback: "${feedback.entityName}" ${feedback.field}: "${feedback.wrongValue}" → "${feedback.correctValue}"`,
    );
  }

  /** 获取最常见的错误模式 */
  async getTopErrors(limit = 20): Promise<{
    field: string; count: number; examples: string[];
  }[]> {
    return this.neo4j.read(
      `MATCH (f:Feedback)
       WITH f.field AS field, count(*) AS cnt, collect(f.wrongValue + '→' + f.correctValue)[0..3] AS examples
       WHERE cnt >= 1
       RETURN field, cnt AS count, examples
       ORDER BY cnt DESC
       LIMIT ${limit}`,
    );
  }

  /** 构建 few-shot 样本 (从已确认的高置信度实体中提取) */
  async buildFewShotSamples(entityType: string, limit = 10): Promise<FewShotExample[]> {
    const confirmed = await this.neo4j.read<{
      name: string; type: string; description: string; institution: string;
    }>(
      `MATCH (n)
       WHERE n.confidence >= 0.9
         AND n.verified = true
         AND (n:Person OR n:Lab OR n:University OR n:Equipment OR n:ResearchDirection)
         AND n.description IS NOT NULL
       RETURN n.name AS name, labels(n)[0] AS type,
              n.description AS description,
              coalesce(n.institution, '') AS institution
       LIMIT ${limit}`,
    );

    return confirmed.map(c => ({
      input: `从文本中提取科研实体。`,
      expectedOutput: JSON.stringify({
        name: c.name,
        type: c.type,
        description: c.description,
        institution: c.institution,
      }),
      domain: c.type,
      successCount: 1,
    }));
  }

  /** 生成供 LLM prompt 使用的 few-shot 增强文本 */
  generatePromptEnhancement(samples: FewShotExample[]): string {
    if (samples.length === 0) return '';

    const header = '\n\n## 已验证的高质量提取示例 (Few-Shot):\n';
    const examples = samples
      .filter(s => s.successCount >= 1)
      .slice(0, 5)
      .map((s, i) =>
        `### 示例 ${i + 1} (${s.domain}):\n输入: ${s.input}\n期望输出: ${s.expectedOutput}`,
      )
      .join('\n\n');

    return header + examples;
  }
}
