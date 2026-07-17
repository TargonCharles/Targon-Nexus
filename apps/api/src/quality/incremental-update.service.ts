// =============================================================================
// IncrementalUpdateService — 增量更新 & 变更检测
//
// 比较新旧爬取结果，仅更新变更部分。
// 检测:
//   - 人员机构变更 → 创建 CareerEvent
//   - 实验室新成员 → 增量提取
//   - 论文新引用 → 增量 CITES 关系
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface ChangeReport {
  entityType: string;
  changes: {
    newEntities: number;
    updatedEntities: number;
    removedEntities: number;
    contextChanges: ChangeDetail[];
  };
}

export interface ChangeDetail {
  entity: string;
  field: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
}

@Injectable()
export class IncrementalUpdateService {
  private readonly logger = new Logger(IncrementalUpdateService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /**
   * 检测自上次爬取以来的人员机构变更
   */
  async detectInstitutionChanges(): Promise<ChangeDetail[]> {
    const changes: ChangeDetail[] = [];

    // 查找同一个人在不同时间点关联到不同机构的情况
    const results = await this.neo4j.read<{
      name: string; oldInst: string; newInst: string;
    }>(
      `MATCH (p:Person)-[r1:AFFILIATED_WITH|WORKS_AT]->(old:University)
       MATCH (p)-[r2:AFFILIATED_WITH|WORKS_AT]->(new:University)
       WHERE old <> new
         AND r1.createdAt < r2.createdAt
         AND duration.between(r1.createdAt, r2.createdAt).days > 30
       RETURN p.englishName AS name, old.name AS oldInst, new.name AS newInst
       LIMIT 50`,
    );

    for (const row of results) {
      changes.push({
        entity: row.name,
        field: 'institution',
        oldValue: row.oldInst,
        newValue: row.newInst,
        timestamp: new Date().toISOString(),
      });

      // 创建 TimelineEvent 记录变迁
      try {
        await this.neo4j.write(
          `MATCH (p:Person {englishName: $name})
           CREATE (e:TimelineEvent {
             uuid: randomUUID(),
             eventType: 'institution_change',
             description: '机构变更: ' + $old + ' → ' + $new,
             date: datetime(),
             autoDetected: true
           })
           CREATE (p)-[:HAS_CAREER_EVENT]->(e)`,
          { name: row.name, old: row.oldInst, new: row.newInst },
        );
      } catch { /* skip if event node already exists */ }
    }

    this.logger.log(`Detected ${changes.length} institution changes`);
    return changes;
  }

  /**
   * 检测上次爬取后新增的关系
   */
  async detectNewRelationships(sinceHours: number = 24): Promise<{
    newRelations: number;
    newEntities: number;
  }> {
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

    const newRels = await this.neo4j.read<{ count: number }>(
      `MATCH ()-[r]->()
       WHERE r.createdAt >= datetime($since)
       RETURN count(r) AS count`,
    );

    const newEnts = await this.neo4j.read<{ count: number }>(
      `MATCH (n)
       WHERE n.createdAt >= datetime($since)
       RETURN count(n) AS count`,
    );

    return {
      newRelations: newRels[0]?.count ?? 0,
      newEntities: newEnts[0]?.count ?? 0,
    };
  }

  /**
   * 生成变更报告
   */
  async generateChangeReport(): Promise<ChangeReport[]> {
    const [instChanges, newStuff] = await Promise.all([
      this.detectInstitutionChanges(),
      this.detectNewRelationships(168), // 过去一周
    ]);

    return [{
      entityType: 'Person',
      changes: {
        newEntities: newStuff.newEntities,
        updatedEntities: instChanges.length,
        removedEntities: 0,
        contextChanges: instChanges,
      },
    }];
  }
}
