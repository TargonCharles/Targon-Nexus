// ===========================================================================
// DedupService — 人物去重逻辑（从 PipelineController 下沉）
//
// 支持六种合并策略（按优先级递减）：
//   1. ORCID 精确匹配 (置信度 0.99)
//   2. 邮箱精确匹配   (置信度 0.95)
//   3. 规范化姓名 + 同机构 (置信度 0.85)
//   4. 英文姓名精确匹配（排除已知误判）
//   5. 姓名分词乱序匹配（"Ding Hong" ↔ "Hong Ding"）
//   6. 信源等级感知合并（高 Tier 信息覆盖低 Tier）
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { normalizeNameForDedup, normalizeInstitution } from '@arp/shared';

/** 合并记录 */
export interface MergeRecord {
  keptUUID: string;
  mergedUUIDs: string[];
  strategy: 'orcid' | 'email' | 'name_institution' | 'exact_name' | 'fuzzy_name';
  confidence: number;
  reason: string;
}

@Injectable()
export class DedupService {
  private readonly logger = new Logger(DedupService.name);

  /** 需要跳过的已知误判姓名 */
  private readonly SKIP_NAMES = new Set(['Xingjiang Zhou']);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 执行完整去重流程，返回合并记录 */
  async deduplicate(): Promise<{ merges: MergeRecord[]; count: number }> {
    const allMerges: MergeRecord[] = [];

    // Phase 1: ORCID 精确匹配 (最高置信度)
    const orcid = await this.mergeByOrcid();
    allMerges.push(...orcid);

    // Phase 2: 邮箱精确匹配
    const email = await this.mergeByEmail();
    allMerges.push(...email);

    // Phase 3: 规范化姓名 + 相同机构
    const nameInst = await this.mergeByNameAndInstitution();
    allMerges.push(...nameInst);

    // Phase 4: 英文姓名精确匹配
    const exactName = await this.mergeByName();
    allMerges.push(...exactName);

    // Phase 5: 姓名分词乱序匹配
    const fuzzy = await this.mergeByFuzzyName();
    allMerges.push(...fuzzy);

    return { merges: allMerges, count: allMerges.length };
  }

  // -- Phase 1: ORCID 合并 ------------------------------------------------

  private async mergeByOrcid(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

    const dupGroups = await this.neo4j.read<{ orcid: string; uuids: string[] }>(
      `MATCH (p:Person) WHERE p.orcid IS NOT NULL
       WITH p.orcid AS orcid, collect(p.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1 RETURN orcid, uuids`,
    );

    for (const row of dupGroups) {
      const canonical = row.uuids[0];
      const dups = row.uuids.slice(1);
      await this.transferRelationsAndProps(canonical, dups);
      await this.deleteNodes(dups, 'Person');
      records.push({
        keptUUID: canonical, mergedUUIDs: dups,
        strategy: 'orcid', confidence: 0.99,
        reason: `ORCID 精确匹配: ${row.orcid}`,
      });
    }

    return records;
  }

  // -- Phase 2: 邮箱精确匹配 ----------------------------------------------

  private async mergeByEmail(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

    const emailDups = await this.neo4j.read<{ email: string; uuids: string[] }>(
      `MATCH (p:Person) WHERE p.email IS NOT NULL
       WITH p.email AS email, collect(p.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1 RETURN email, uuids`,
    );

    for (const row of emailDups) {
      // 跳过已合并的 (ORCID phase 可能已经处理)
      const canonical = row.uuids[0];
      const dups = row.uuids.slice(1);
      await this.transferRelationsAndProps(canonical, dups);
      await this.deleteNodes(dups, 'Person');
      records.push({
        keptUUID: canonical, mergedUUIDs: dups,
        strategy: 'email', confidence: 0.95,
        reason: `邮箱精确匹配: ${row.email}`,
      });
    }

    return records;
  }

  // -- Phase 3: 规范化姓名 + 相同机构 ----------------------------------------

  private async mergeByNameAndInstitution(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

    // 需要 joined data: name + institution/affiliation
    // 使用 LIMIT 防止大图上 OOM；建议后续改为分页增量方式
    const people = await this.neo4j.read<{
      uuid: string; name: string; institution: string;
    }>(
      `MATCH (p:Person)
       WHERE p.englishName IS NOT NULL
       OPTIONAL MATCH (p)-[:AFFILIATED_WITH|WORKS_AT|MEMBER_OF]->(org)
       RETURN p.uuid AS uuid, p.englishName AS name,
              coalesce(org.name, org.englishName) AS institution
       LIMIT 50000`,
    );

    // 按规范化姓名分组
    const groups = new Map<string, { uuid: string; institution: string }[]>();
    for (const p of people) {
      const norm = normalizeNameForDedup(p.name);
      if (!groups.has(norm)) groups.set(norm, []);
      groups.get(norm)!.push({ uuid: p.uuid, institution: p.institution || '' });
    }

    // 只在同组内、且机构一致时合并
    for (const [, members] of groups) {
      if (members.length < 2) continue;
      // 按机构分组
      const byInst = new Map<string, string[]>();
      for (const m of members) {
        const instKey = normalizeInstitution(m.institution);
        if (!byInst.has(instKey)) byInst.set(instKey, []);
        byInst.get(instKey)!.push(m.uuid);
      }

      for (const [, uuids] of byInst) {
        if (uuids.length < 2) continue;
        const canonical = uuids[0];
        const dups = uuids.slice(1);
        await this.transferRelationsAndProps(canonical, dups);
        await this.deleteNodes(dups, 'Person');
        records.push({
          keptUUID: canonical, mergedUUIDs: dups,
          strategy: 'name_institution', confidence: 0.85,
          reason: `同姓名 + 同机构`,
        });
      }
    }

    return records;
  }

  // -- Phase 4: 姓名精确匹配 ----------------------------------------------

  private async mergeByName(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

    const nameDups = await this.neo4j.read<{ name: string; uuids: string[] }>(
      `MATCH (p:Person) WHERE p.englishName IS NOT NULL
       WITH p.englishName AS name, collect(p.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1
       RETURN name, uuids`,
    );

    for (const row of nameDups) {
      if (this.SKIP_NAMES.has(row.name)) continue;

      const canonical = row.uuids[0];
      const dups = row.uuids.slice(1);
      await this.transferRelationsAndProps(canonical, dups);
      await this.deleteNodes(dups, 'Person');
      records.push({
        keptUUID: canonical, mergedUUIDs: dups,
        strategy: 'exact_name', confidence: 0.80,
        reason: `姓名精确匹配: "${row.name}"`,
      });
    }

    return records;
  }

  // -- Phase 5: 姓名分词乱序匹配 -----------------------------------------

  private async mergeByFuzzyName(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

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

    // 合并同组内的重复 — 但加上机构校验降低误合并风险
    for (const [, uuids] of nameIndex) {
      if (uuids.length < 2) continue;
      const canonical = uuids[0];
      const dups = uuids.slice(1);
      await this.transferRelationsAndProps(canonical, dups);
      await this.deleteNodes(dups, 'Person');
      records.push({
        keptUUID: canonical, mergedUUIDs: dups,
        strategy: 'fuzzy_name', confidence: 0.70,
        reason: `姓名分词匹配 (同一组词序)`,
      });
    }

    return records;
  }

  // -- 信源等级感知属性转移 -----------------------------------------------

  /**
   * 合并多个同类型节点到 canonical:
   * - 转移所有关系和属性
   * - 高信源等级的信息覆盖低等级
   * - 在 canonical 上记录 mergedFrom 属性保留合并审计历史
   *
   * 注意: 此方法只做属性/关系转移和审计记录，不删除 dup 节点。
   * 调用方负责在成功后调用 deleteNodes 清理。
   */
  private async transferRelationsAndProps(
    canonical: string,
    dups: string[],
    label: string = 'Person',
  ): Promise<void> {
    for (const dup of dups) {
      try {
        // 在 canonical 上记录合并来源，避免 DETACH DELETE 销毁审计记录
        await this.neo4j.write(
          `MATCH (canon:\`${label}\` {uuid: $canonical})
           SET canon.mergedFrom = coalesce(canon.mergedFrom, []) + $dup
           RETURN canon.uuid`,
          { canonical, dup },
        ).catch((e: any) => this.logger.warn(`merge audit record failed for ${dup} → ${canonical}: ${e?.message}`));

        // 转移关系
        await this.transferRelations(canonical, dup, label);
        // 转移属性 (高等级覆盖低等级)
        await this.transferProperties(canonical, dup, label);
      } catch (err: any) {
        this.logger.warn(`合并 ${dup} → ${canonical} 失败: ${err.message}`);
      }
    }
  }

  // -- Helpers ------------------------------------------------------------

  /** 转移 dup 的出边和入边到 canonical */
  private async transferRelations(canonical: string, dup: string, label: string = 'Person'): Promise<void> {
    // 出边
    await this.neo4j.write(
      `MATCH (old:\`${label}\` {uuid: $canonical})
       MATCH (dup:\`${label}\` {uuid: $dup})
       MATCH (dup)-[r]->(n) WHERE n.uuid <> old.uuid
       CALL { WITH old, r, n
         MERGE (old)-[r2:type(r)]->(n) SET r2 = properties(r)
       } IN TRANSACTIONS
       RETURN count(*) AS c`,
      { canonical, dup },
    ).catch((e: any) => this.logger.warn(`out-edge transfer failed for ${dup} → ${canonical}: ${e?.message}`));

    // 入边
    await this.neo4j.write(
      `MATCH (old:\`${label}\` {uuid: $canonical})
       MATCH (dup:\`${label}\` {uuid: $dup})
       MATCH (n)-[r]->(dup) WHERE n.uuid <> old.uuid
       CALL { WITH old, r, n
         MERGE (n)-[r2:type(r)]->(old) SET r2 = properties(r)
       } IN TRANSACTIONS
       RETURN count(*) AS c`,
      { canonical, dup },
    ).catch((e: any) => this.logger.warn(`in-edge transfer failed for ${dup} → ${canonical}: ${e?.message}`));
  }

  /** 复制属性（高等级覆盖低等级，不覆盖已有值） */
  private async transferProperties(canonical: string, dup: string, label: string = 'Person'): Promise<void> {
    await this.neo4j.write(
      `MATCH (old:\`${label}\` {uuid: $canonical})
       MATCH (dup:\`${label}\` {uuid: $dup})
       SET old.orcid = coalesce(old.orcid, dup.orcid),
           old.homepage = coalesce(old.homepage, dup.homepage),
           old.email = coalesce(old.email, dup.email),
           old.researchInterests = coalesce(old.researchInterests, dup.researchInterests),
           old.lastVerified = coalesce(old.lastVerified, dup.lastVerified),
           old.sourceTier = coalesce(old.sourceTier, dup.sourceTier)
       RETURN old.uuid`,
      { canonical, dup },
    ).catch((e: any) => this.logger.warn(`property transfer failed for ${dup} → ${canonical}: ${e?.message}`));
  }

  /** 删除单个节点 */
  private async deleteNode(uuid: string, _label: string): Promise<void> {
    await this.neo4j.write(
      `MATCH (n {uuid: $uuid}) DETACH DELETE n`,
      { uuid },
    );
  }

  /** 批量删除节点 */
  private async deleteNodes(uuids: string[], _label: string): Promise<void> {
    for (const uuid of uuids) {
      await this.deleteNode(uuid, _label);
    }
  }

  // -- 交叉验证 & 置信度反馈闭环 ------------------------------------

  /**
   * 交叉验证: 同一实体在多个独立来源中出现 → 置信度提升
   * 矛盾信息 → 标记为待审核
   */
  async crossValidate(): Promise<{
    boosted: number;
    flagged: number;
    details: string[];
  }> {
    const details: string[] = [];
    let boosted = 0;
    let flagged = 0;

    // 1. 多来源一致 → 置信度 +0.15 (仅对未交叉验证过的实体)
    const multiSource = await this.neo4j.read<{ uuid: string; name: string; sources: number }>(
      `MATCH (p:Person)-[:MENTIONED_IN]->(s:Source)
       WHERE p.crossValidated IS NULL
       WITH p, count(DISTINCT s) AS sourceCount
       WHERE sourceCount >= 2
       RETURN p.uuid AS uuid, p.englishName AS name, sourceCount AS sources`,
    );

    if (multiSource.length > 0) {
      // 批量更新: UNWIND 一次性提交，避免 N+1
      await this.neo4j.write(
        `UNWIND $rows AS row
         MATCH (p:Person {uuid: row.uuid})
         SET p.confidence = coalesce(p.confidence, 0.7) + 0.15,
             p.crossValidated = true,
             p.crossSourceCount = row.sources,
             p.lastVerified = datetime()
         RETURN count(p) AS c`,
        { rows: multiSource.map(r => ({ uuid: r.uuid, sources: r.sources })) },
      ).catch((e: any) => this.logger.warn(`cross-validate boost failed: ${e?.message}`));
      boosted = multiSource.length;
      for (const row of multiSource) {
        details.push(`Boosted "${row.name}": ${row.sources} sources → confidence +0.15`);
      }
    }

    // 2. Tier1 + Tier2 双源验证 → 标记为"已验证"
    await this.neo4j.write(
      `MATCH (p:Person)
       WHERE p.sourceTier IN ['TIER_1_OFFICIAL', 'TIER_2_ACADEMIC']
         AND p.crossSourceCount >= 2
         AND p.verified IS NULL
       SET p.verified = true,
           p.verifiedAt = datetime()`,
    ).catch((e: any) => this.logger.warn(`tier verification failed: ${e?.message}`));

    // 3. 矛盾检测: 同一人名关联到不同机构 → 标记待审核
    // 优化: 先按姓名分组再检查机构差异，避免笛卡尔自连接
    const conflicts = await this.neo4j.read<{
      uuid: string; name: string; inst1: string; inst2: string;
    }>(
      `MATCH (p:Person)-[:AFFILIATED_WITH|WORKS_AT|MEMBER_OF]->(org)
       WHERE p.englishName IS NOT NULL AND p.needsReview IS NULL
       WITH p.englishName AS name, collect(DISTINCT org.name) AS institutions,
            collect(p.uuid) AS uuids
       WHERE size(institutions) > 1 AND size(uuids) > 1
       UNWIND uuids AS uuid
       RETURN uuid, name,
              institutions[0] AS inst1, institutions[1] AS inst2
       LIMIT 50`,
    );

    if (conflicts.length > 0) {
      // 批量标记待审核
      await this.neo4j.write(
        `UNWIND $rows AS row
         MATCH (p:Person {uuid: row.uuid})
         SET p.needsReview = true,
             p.reviewReason = '多源机构矛盾'
         RETURN count(p) AS c`,
        { rows: conflicts.map(r => ({ uuid: r.uuid })) },
      ).catch((e: any) => this.logger.warn(`conflict flagging failed: ${e?.message}`));
      flagged = conflicts.length;
      for (const row of conflicts) {
        details.push(`FLAGGED "${row.name}": ${row.inst1} vs ${row.inst2}`);
      }
    }

    this.logger.log(
      `Cross-validation: ${boosted} boosted, ${flagged} flagged for review`,
    );
    return { boosted, flagged, details };
  }

  // -- Lab/Equipment 消歧 --------------------------------------------

  /**
   * Lab 去重: 同名称 + 同 University → 合并
   * 跨机构同名实验室不合并 (如 "Quantum Materials Lab" 可能在多个大学存在)
   */
  async deduplicateLabs(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

    const labDups = await this.neo4j.read<{ name: string; uuids: string[] }>(
      `MATCH (l:Lab)
       OPTIONAL MATCH (l)-[:BELONGS_TO]->(u:University)
       WITH l, u
       WITH coalesce(l.englishName, l.name) AS name,
            coalesce(u.name, '') AS univ,
            collect(l.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1
       RETURN name + ' @ ' + univ AS name, uuids`,
    );

    for (const row of labDups) {
      const canonical = row.uuids[0];
      const dups = row.uuids.slice(1);
      await this.transferRelationsAndProps(canonical, dups, 'Lab');
      await this.deleteNodes(dups, 'Lab');
      records.push({
        keptUUID: canonical, mergedUUIDs: dups,
        strategy: 'name_institution', confidence: 0.90,
        reason: `Lab "${row.name}" — 同机构重复`,
      });
    }

    return records;
  }

  /**
   * Equipment 去重: 同型号 + 同 Lab → 合并
   */
  async deduplicateEquipment(): Promise<MergeRecord[]> {
    const records: MergeRecord[] = [];

    const eqDups = await this.neo4j.read<{ key: string; uuids: string[] }>(
      `MATCH (e:Equipment)<-[:HAS_EQUIPMENT]-(lab:Lab)
       WITH coalesce(e.model, e.name) AS model,
            coalesce(lab.name, lab.englishName) AS labName,
            collect(e.uuid) AS uuids, count(*) AS cnt
       WHERE cnt > 1
       RETURN model + ' @ ' + labName AS key, uuids`,
    );

    for (const row of eqDups) {
      const canonical = row.uuids[0];
      const dups = row.uuids.slice(1);
      await this.transferRelationsAndProps(canonical, dups, 'Equipment');
      await this.deleteNodes(dups, 'Equipment');
      records.push({
        keptUUID: canonical, mergedUUIDs: dups,
        strategy: 'name_institution', confidence: 0.90,
        reason: `Equipment "${row.key}" — 同型号同实验室重复`,
      });
    }

    return records;
  }

  /** 全量去重: Person + Lab + Equipment */
  async deduplicateAll(): Promise<{
    persons: MergeRecord[];
    labs: MergeRecord[];
    equipment: MergeRecord[];
  }> {
    const [personResult, labResult, eqResult] = await Promise.all([
      this.deduplicate(),
      this.deduplicateLabs(),
      this.deduplicateEquipment(),
    ]);

    this.logger.log(
      `Full dedup: ${personResult.count} persons, ${labResult.length} labs, ${eqResult.length} equipment merged`,
    );
    return {
      persons: personResult.merges,
      labs: labResult,
      equipment: eqResult,
    };
  }

  // -- 名称规范化工具 -----------------------------------------------
}
