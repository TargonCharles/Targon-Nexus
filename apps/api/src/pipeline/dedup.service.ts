// ===========================================================================
// DedupService — 人物去重逻辑（从 PipelineController 下沉）
//
// 支持三种合并策略：
//   1. ORCID 精确匹配
//   2. 英文姓名精确匹配（排除已知误判）
//   3. 姓名分词乱序匹配（"Ding Hong" ↔ "Hong Ding"）
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  /** 需要跳过的已知误判姓名 */
  private readonly SKIP_NAMES = new Set(['Xingjiang Zhou']);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 执行完整去重流程，返回合并记录 */
  async deduplicate(): Promise<{ merges: string[]; count: number }> {
    const merges: string[] = [];

    // Phase 1: ORCID 精确匹配
    const orcidMerges = await this.mergeByOrcid();
    merges.push(...orcidMerges);

    // Phase 2: 英文姓名精确匹配
    const nameMerges = await this.mergeByName();
    merges.push(...nameMerges);

    // Phase 3: 姓名分词乱序匹配
    const fuzzyMerges = await this.mergeByFuzzyName();
    merges.push(...fuzzyMerges);

    return { merges, count: merges.length };
  }

  // -- Phase 1: ORCID 合并 ------------------------------------------------

  private async mergeByOrcid(): Promise<string[]> {
    const merges: string[] = [];

    const dupGroups = await this.neo4j.read<{ orcid: string; uuids: string[] }>(
      `MATCH (p:Person) WHERE p.orcid IS NOT NULL
       WITH p.orcid AS orcid, collect(p.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1 RETURN orcid, uuids`,
    );

    for (const row of dupGroups) {
      const canonical = row.uuids[0];
      for (let i = 1; i < row.uuids.length; i++) {
        const dup = row.uuids[i];
        await this.transferRelations(canonical, dup);
        await this.transferProperties(canonical, dup);
        await this.deleteNode(dup, 'Person');
        merges.push(`ORCID ${row.orcid}: ${dup} → ${canonical}`);
      }
    }

    return merges;
  }

  // -- Phase 2: 姓名精确匹配 ----------------------------------------------

  private async mergeByName(): Promise<string[]> {
    const merges: string[] = [];

    const nameDups = await this.neo4j.read<{ name: string; uuids: string[] }>(
      `MATCH (p:Person) WHERE p.englishName IS NOT NULL
       WITH p.englishName AS name, collect(p.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1
       RETURN name, uuids`,
    );

    for (const row of nameDups) {
      if (this.SKIP_NAMES.has(row.name)) continue;

      const canonical = row.uuids[0];
      for (let i = 1; i < row.uuids.length; i++) {
        const dup = row.uuids[i];
        try {
          await this.transferRelations(canonical, dup);
          await this.transferProperties(canonical, dup);
          await this.deleteNode(dup, 'Person');
          merges.push(`Name "${row.name}": ${dup} → ${canonical}`);
        } catch { /* skip if already merged */ }
      }
    }

    return merges;
  }

  // -- Phase 3: 姓名分词乱序匹配 -----------------------------------------

  private async mergeByFuzzyName(): Promise<string[]> {
    const merges: string[] = [];

    const allPeople = await this.neo4j.read<{ uuid: string; name: string }>(
      `MATCH (p:Person) WHERE p.englishName IS NOT NULL
       RETURN p.uuid AS uuid, p.englishName AS name`,
    );

    // 建立姓名分词索引
    const nameIndex = new Map<string, string[]>();
    for (const p of allPeople) {
      const parts = p.name.toLowerCase().split(/\s+/).sort();
      const key = parts.join(' ');
      if (!nameIndex.has(key)) nameIndex.set(key, []);
      nameIndex.get(key)!.push(p.uuid);
    }

    // 合并同组内的重复
    for (const [, uuids] of nameIndex) {
      if (uuids.length < 2) continue;
      const canonical = uuids[0];
      for (let i = 1; i < uuids.length; i++) {
        const dup = uuids[i];
        try {
          await this.transferRelations(canonical, dup);
          await this.transferProperties(canonical, dup);
          await this.deleteNode(dup, 'Person');
          merges.push(`Fuzzy: ${dup} → ${canonical}`);
        } catch { /* skip if already merged */ }
      }
    }

    return merges;
  }

  // -- Helpers ------------------------------------------------------------

  /** 转移 dup 的出边和入边到 canonical */
  private async transferRelations(canonical: string, dup: string): Promise<void> {
    // 出边
    await this.neo4j.write(
      `MATCH (old:Person {uuid: $canonical})
       MATCH (dup:Person {uuid: $dup})
       MATCH (dup)-[r]->(n) WHERE n.uuid <> old.uuid
       CALL { WITH old, r, n
         MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r)
       } IN TRANSACTIONS
       RETURN count(*) AS c`,
      { canonical, dup },
    ).catch(() => {});

    // 入边
    await this.neo4j.write(
      `MATCH (old:Person {uuid: $canonical})
       MATCH (dup:Person {uuid: $dup})
       MATCH (n)-[r]->(dup) WHERE n.uuid <> old.uuid
       CALL { WITH old, r, n
         MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r)
       } IN TRANSACTIONS
       RETURN count(*) AS c`,
      { canonical, dup },
    ).catch(() => {});
  }

  /** 复制属性（不覆盖 canonical 已有值） */
  private async transferProperties(canonical: string, dup: string): Promise<void> {
    await this.neo4j.write(
      `MATCH (old:Person {uuid: $canonical})
       MATCH (dup:Person {uuid: $dup})
       SET old.orcid = coalesce(old.orcid, dup.orcid),
           old.homepage = coalesce(old.homepage, dup.homepage),
           old.email = coalesce(old.email, dup.email),
           old.researchInterests = coalesce(old.researchInterests, dup.researchInterests)
       RETURN old.uuid`,
      { canonical, dup },
    );
  }

  /** 删除节点 */
  private async deleteNode(uuid: string, _label: string): Promise<void> {
    await this.neo4j.write(
      `MATCH (n {uuid: $uuid}) DETACH DELETE n`,
      { uuid },
    );
  }
}
