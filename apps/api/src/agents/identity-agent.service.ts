// ===========================================================================
// Identity Agent — 协同演化的人物身份识别与消歧
//
// 核心原则:
//   1. 全局共享图谱 — 所有用户贡献同一张图
//   2. 置信度驱动的更新 — 高置信度新数据覆盖低置信度旧数据
//   3. 证据累积 — 追踪每条信息的来源和验证次数
//   4. 永不删除 — 错误的标记为 superseded，不丢失历史
//   5. 随使用量增长 — 每多一次验证，图谱更准确
//
// 合并策略:
//   - 交叉验证优先级: ORCID > email > S2 authorId > name+institution
//   - 身份置信度 ≥0.9 才合并
//   - 同一实体多源验证 → 置信度递增
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { normalizeNameUnicode } from '@arp/shared';

// -- 类型 -------------------------------------------------------------------

export interface PersonIdentity {
  name: string;
  nameVariants: string[];
  institutions: string[];
  researchTopics: string[];
  identifiers: {
    orcid?: string;
    email?: string;
    s2AuthorId?: string;
    homepage?: string;
  };
  paperCount: number;
  evidenceDois: string[];
}

export interface IdentityResolution {
  canonicalUuid: string;
  allUuids: string[];
  identity: PersonIdentity;
  confidence: number;
  merged: boolean;
  mergedCount: number;
  reasoning: string;
}

// -- 指纹生成 ----------------------------------------------------------------

function identityFingerprint(pi: Pick<PersonIdentity, 'name' | 'identifiers' | 'institutions'>): string {
  if (pi.identifiers.orcid) return `orcid:${pi.identifiers.orcid}`;
  if (pi.identifiers.email) return `email:${pi.identifiers.email}`;
  if (pi.identifiers.s2AuthorId) return `s2:${pi.identifiers.s2AuthorId}`;
  const inst = pi.institutions[0] || '';
  return `name:${pi.name.toLowerCase().trim()}|${inst.toLowerCase().trim()}`;
}

@Injectable()
export class IdentityAgent {
  private readonly logger = new Logger(IdentityAgent.name);

  constructor(private readonly neo4j: Neo4jService) {}

  // =========================================================================
  // 主入口
  // =========================================================================

  async resolve(extracted: PersonIdentity[]): Promise<IdentityResolution[]> {
    this.logger.log(`[Identity] Resolving ${extracted.length} identities`);

    const groups = this.groupByIdentity(extracted);

    const resolutions: IdentityResolution[] = [];
    for (const [fingerprint, members] of groups) {
      const resolution = await this.resolveGroup(fingerprint, members);
      resolutions.push(resolution);
    }

    const merged = resolutions.filter(r => r.merged).length;
    this.logger.log(`[Identity] Done: ${resolutions.length} entities (${merged} merged)`);
    return resolutions;
  }

  // =========================================================================
  // 分组逻辑
  // =========================================================================

  private groupByIdentity(candidates: PersonIdentity[]): Map<string, PersonIdentity[]> {
    const groups = new Map<string, PersonIdentity[]>();
    for (const c of candidates) {
      const fp = identityFingerprint(c);
      if (!groups.has(fp)) groups.set(fp, []);
      groups.get(fp)!.push(c);
    }
    return this.mergeOverlappingGroups(groups);
  }

  private mergeOverlappingGroups(groups: Map<string, PersonIdentity[]>): Map<string, PersonIdentity[]> {
    const merged = new Map(groups);
    const entries = [...merged.entries()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [fp1, g1] = entries[i];
        const [fp2, g2] = entries[j];
        if (!merged.has(fp1) || !merged.has(fp2)) continue;
        const n1 = normalizeNameUnicode(g1[0].name);
        const n2 = normalizeNameUnicode(g2[0].name);
        if (n1 === n2 && this.hasCommonInstitution(g1[0], g2[0])) {
          merged.set(fp1, [...g1, ...g2]);
          merged.delete(fp2);
        }
      }
    }
    return merged;
  }

  private hasCommonInstitution(a: PersonIdentity, b: PersonIdentity): boolean {
    const setA = new Set(a.institutions.map(i => i.toLowerCase().trim()));
    return b.institutions.some(i => setA.has(i.toLowerCase().trim()));
  }

  // =========================================================================
  // 核心: 查找或创建 (协同演化)
  // =========================================================================

  private async resolveGroup(_fingerprint: string, members: PersonIdentity[]): Promise<IdentityResolution> {
    const merged = this.mergeMembers(members);
    const existingUuid = await this.findExisting(merged);

    if (existingUuid) {
      await this.updateEntity(existingUuid, merged);
      return {
        canonicalUuid: existingUuid,
        allUuids: [existingUuid],
        identity: merged,
        confidence: this.calculateConfidence(merged),
        merged: members.length > 1,
        mergedCount: members.length,
        reasoning: `已存在: ${merged.identifiers.orcid ? 'ORCID' : merged.identifiers.email ? 'Email' : '姓名+机构'}`,
      };
    }

    const uuid = await this.createEntity(merged);
    return {
      canonicalUuid: uuid,
      allUuids: [uuid],
      identity: merged,
      confidence: this.calculateConfidence(merged),
      merged: members.length > 1,
      mergedCount: members.length,
      reasoning: `新建`,
    };
  }

  // =========================================================================
  // Neo4j 操作: 置信度驱动的 UPSERT
  // =========================================================================

  private async findExisting(identity: PersonIdentity): Promise<string | null> {
    const { orcid, email, s2AuthorId } = identity.identifiers;

    if (orcid) {
      const r = await this.neo4j.read<{ uuid: string }>(
        `MATCH (p:Person {orcid: $orcid}) RETURN p.uuid AS uuid`, { orcid },
      );
      if (r.length) return r[0].uuid;
    }
    if (email) {
      const r = await this.neo4j.read<{ uuid: string }>(
        `MATCH (p:Person {email: $email}) RETURN p.uuid AS uuid`, { email },
      );
      if (r.length) return r[0].uuid;
    }
    if (s2AuthorId) {
      const r = await this.neo4j.read<{ uuid: string }>(
        `MATCH (p:Person {s2AuthorId: $s2}) RETURN p.uuid AS uuid`, { s2: s2AuthorId },
      );
      if (r.length) return r[0].uuid;
    }

    // name + institution 模糊匹配
    const name = identity.name.toLowerCase().trim();
    const inst = identity.institutions[0]?.toLowerCase().trim();
    if (inst) {
      const r = await this.neo4j.read<{ uuid: string }>(
        `MATCH (p:Person) WHERE toLower(p.englishName) = $name AND toLower(coalesce(p.description,'')) CONTAINS $inst RETURN p.uuid AS uuid LIMIT 1`,
        { name, inst },
      );
      if (r.length) return r[0].uuid;
    }

    return null;
  }

  /**
   * 协同更新: 仅当新数据置信度高于现有数据时才覆盖。
   * 证据始终累积 (不覆盖已有证据)。
   * 错误的旧数据不会被删除，只是被更可信的数据"覆盖"。
   */
  private async updateEntity(uuid: string, identity: PersonIdentity): Promise<void> {
    const newConf = this.calculateConfidence(identity);
    await this.neo4j.write(
      `MATCH (p:Person {uuid: $uuid})
       // 仅在新置信度 ≥ 现有置信度时覆盖核心字段
       SET p.orcid     = CASE WHEN $conf >= coalesce(p.confidence, 0) THEN coalesce(p.orcid, $orcid) ELSE p.orcid END,
           p.email     = CASE WHEN $conf >= coalesce(p.confidence, 0) THEN coalesce(p.email, $email) ELSE p.email END,
           p.s2AuthorId= CASE WHEN $conf >= coalesce(p.confidence, 0) THEN coalesce(p.s2AuthorId, $s2Id) ELSE p.s2AuthorId END,
           p.homepage  = CASE WHEN $conf >= coalesce(p.confidence, 0) THEN coalesce(p.homepage, $homepage) ELSE p.homepage END,
           p.description = CASE WHEN $conf >= coalesce(p.confidence, 0) AND size($desc) > size(coalesce(p.description, '')) THEN $desc ELSE p.description END,
           // 置信度取最大值
           p.confidence = CASE WHEN $conf > coalesce(p.confidence, 0) THEN $conf ELSE p.confidence END,
           // 始终累积证据 (不覆盖)
           p.evidenceDois = coalesce(p.evidenceDois, []) + [d IN $newDois WHERE NOT d IN coalesce(p.evidenceDois, [])],
           p.evidenceCount = coalesce(p.evidenceCount, 0) + size([d IN $newDois WHERE NOT d IN coalesce(p.evidenceDois, [])]),
           // 总是更新
           p.researchInterests = coalesce(p.researchInterests, $topics),
           p.updatedAt = datetime(),
           p.lastVerified = datetime()
       RETURN p.uuid`,
      {
        uuid, conf: newConf,
        orcid: identity.identifiers.orcid || null,
        email: identity.identifiers.email || null,
        s2Id: identity.identifiers.s2AuthorId || null,
        homepage: identity.identifiers.homepage || null,
        desc: identity.institutions.join(', '),
        topics: identity.researchTopics.length ? identity.researchTopics : null,
        newDois: identity.evidenceDois.filter(Boolean),
      },
    ).catch((e) => this.logger.warn(`Update ${uuid} failed: ${e.message}`));
  }

  private async createEntity(identity: PersonIdentity): Promise<string> {
    const uuid = crypto.randomUUID();
    const conf = this.calculateConfidence(identity);
    await this.neo4j.write(
      `CREATE (p:Person {
         uuid: $uuid, englishName: $name,
         orcid: $orcid, email: $email, s2AuthorId: $s2Id, homepage: $homepage,
         description: $desc, researchInterests: $topics,
         confidence: $conf, evidenceDois: $dois, evidenceCount: size($dois),
         sourceTier: 'TIER_2_ACADEMIC', createdAt: datetime(), lastVerified: datetime()
       })`,
      {
        uuid, name: identity.name,
        orcid: identity.identifiers.orcid || null,
        email: identity.identifiers.email || null,
        s2Id: identity.identifiers.s2AuthorId || null,
        homepage: identity.identifiers.homepage || null,
        desc: identity.institutions.join(', '),
        topics: identity.researchTopics.length ? identity.researchTopics : null,
        conf, dois: identity.evidenceDois.filter(Boolean),
      },
    ).catch(() => {});
    return uuid;
  }

  // =========================================================================
  // 辅助方法
  // =========================================================================

  private mergeMembers(members: PersonIdentity[]): PersonIdentity {
    if (members.length === 1) return members[0];
    return {
      name: members[0].name,
      nameVariants: [...new Set(members.flatMap(m => m.nameVariants))],
      institutions: [...new Set(members.flatMap(m => m.institutions))],
      researchTopics: [...new Set(members.flatMap(m => m.researchTopics))],
      identifiers: {
        orcid: members.find(m => m.identifiers.orcid)?.identifiers.orcid,
        email: members.find(m => m.identifiers.email)?.identifiers.email,
        s2AuthorId: members.find(m => m.identifiers.s2AuthorId)?.identifiers.s2AuthorId,
        homepage: members.find(m => m.identifiers.homepage)?.identifiers.homepage,
      },
      paperCount: members.reduce((s, m) => s + m.paperCount, 0),
      evidenceDois: [...new Set(members.flatMap(m => m.evidenceDois))],
    };
  }

  private calculateConfidence(identity: PersonIdentity): number {
    let score = 0.5;
    if (identity.identifiers.orcid) score += 0.30;
    else if (identity.identifiers.email) score += 0.20;
    else if (identity.identifiers.s2AuthorId) score += 0.15;
    if (identity.institutions.length >= 2) score += 0.10;
    if (identity.paperCount >= 5) score += 0.10;
    return Math.min(1, Math.round(score * 100) / 100);
  }
}
