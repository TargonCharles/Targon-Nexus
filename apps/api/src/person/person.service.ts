import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { parseArrayProperty, buildGraphFromRows } from '@arp/shared';
import { EnrichmentService } from './enrichment.service';

@Injectable()
export class PersonService {
  private readonly logger = new Logger(PersonService.name);

  constructor(
    private readonly neo4j: Neo4jService,
    private readonly enrichment: EnrichmentService,
  ) {}

  // =======================================================================
  // 核心: 人物详情 + 实时深度富化
  // =======================================================================

  async getProfile(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})
      OPTIONAL MATCH (p)-[:MEMBER_OF]->(lab:Lab)
      OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
      OPTIONAL MATCH (p)-[:AFFILIATED_WITH]->(affUniv:University)
      OPTIONAL MATCH (p)-[:AUTHORED]->(paper:Paper)
      // 导师 & 学生 (学术家谱)
      OPTIONAL MATCH (advisor:Person)-[:ADVISOR_OF]->(p)
      OPTIONAL MATCH (p)-[:ADVISOR_OF]->(student:Person)
      WITH p, lab, univ, affUniv,
           count(DISTINCT paper) AS paperCount,
           count(DISTINCT advisor) AS advisorCount,
           [x IN collect(DISTINCT {name: coalesce(advisor.chineseName, advisor.englishName, advisor.name), uuid: advisor.uuid}) WHERE x.uuid IS NOT NULL][0..8] AS advisorList,
           count(DISTINCT student) AS studentCount,
           [x IN collect(DISTINCT {name: coalesce(student.chineseName, student.englishName, student.name), uuid: student.uuid}) WHERE x.uuid IS NOT NULL][0..20] AS studentList
      OPTIONAL MATCH (p)-[:COAUTHOR_WITH]-(co:Person)
      WITH p, lab, univ, affUniv, paperCount, advisorCount, advisorList, studentCount, studentList,
           count(DISTINCT co) AS coauthorCount
      RETURN p, lab, univ,
             CASE WHEN univ IS NOT NULL THEN {
               name: coalesce(univ.chineseName, univ.englishName, univ.name),
               uuid: univ.uuid,
               country: univ.country
             }
             WHEN affUniv IS NOT NULL THEN {
               name: coalesce(affUniv.chineseName, affUniv.englishName, affUniv.name),
               uuid: affUniv.uuid,
               country: affUniv.country
             }
             ELSE NULL END AS university,
             paperCount, coauthorCount,
             advisorCount, advisorList,
             studentCount, studentList
    `;
    const result = await this.neo4j.readOne<any>(cypher, { uuid });
    if (!result) throw new NotFoundException(`未找到人物 ${uuid}`);

    const personName = result.p?.englishName || result.p?.chineseName || result.p?.name || '';

    // 带超时的同步富化 (3s 内能拿到的数据直接返回给用户)
    const enrichPromise = this.enrichment.enrichPerson(uuid, personName, result);
    const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 3_000));
    const quickEnrich = await Promise.race([enrichPromise, timeoutPromise]);
    // 未完成的继续后台运行
    if (!quickEnrich) {
      enrichPromise.catch((e) => this.logger.warn(`BG enrich timeout: ${e?.message || e}`));
    }

    return this.mapProfile(result);
  }

  // =======================================================================
  // 其他查询方法
  // =======================================================================

  async getStudents(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[r:ADVISOR_OF]->(student:Person)
      OPTIONAL MATCH (student)-[:MEMBER_OF]->(lab:Lab)
      RETURN student, r, lab ORDER BY student.englishName
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({
      ...(row.student ?? {}),
      relationship: row.r ?? {},
      lab: row.lab ?? null,
    }));
  }

  async getAdvisors(uuid: string) {
    const cypher = `
      MATCH (advisor:Person)-[r:ADVISOR_OF]->(p:Person {uuid: $uuid})
      RETURN advisor, r
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.advisor ?? {}), relationship: row.r ?? {} }));
  }

  async getCoauthors(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[:COAUTHOR_WITH]-(coauthor:Person)
      RETURN coauthor LIMIT 50
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => row.coauthor ?? {});
  }

  async getLabs(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[r:MEMBER_OF|ALUMNI_OF]->(lab:Lab)
      OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
      RETURN lab, univ, type(r) AS membershipType, r
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({
      ...(row.lab ?? {}),
      university: row.univ ?? null,
      membershipType: row.membershipType,
      details: row.r ?? {},
    }));
  }

  async getPapers(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[:AUTHORED]->(paper:Paper)
      OPTIONAL MATCH (paper)-[:RESEARCHES_ON]->(rd:ResearchDirection)
      RETURN paper, collect(DISTINCT rd.name) AS topics
      ORDER BY paper.year DESC, paper.citationCount DESC LIMIT 50
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({
      ...(row.paper ?? {}),
      title: row.paper?.title || row.paper?.name || '',
      topics: row.topics ?? [],
    }));
  }

  async getTimeline(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[rel:HAS_EVENT]->(event:Event)
      RETURN event ORDER BY event.date DESC LIMIT 50
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => row.event ?? {});
  }

  async getGenealogy(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[r:ADVISOR_OF|COAUTHOR_WITH]-(other:Person)
      RETURN p, r, other AS neighbor
      UNION
      MATCH (p:Person {uuid: $uuid})<-[r:ADVISOR_OF|COAUTHOR_WITH]-(other:Person)
      RETURN p, r, other AS neighbor
      LIMIT 60
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return buildGraphFromRows(results, 'p');
  }

  async getGraph(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[r1]-(n1)
      WHERE n1:Person OR n1:Lab OR n1:University OR n1:ResearchDirection OR n1:Equipment OR n1:Paper
      WITH p, r1, n1
      OPTIONAL MATCH (n1)-[r2]-(n2)
      WHERE n2:Person OR n2:Lab OR n2:University OR n2:ResearchDirection OR n2:Equipment OR n2:Paper
        AND n2.uuid <> p.uuid
      WITH collect(DISTINCT {root: p, neighbor: n1, r: r1}) AS oneHop,
           collect(DISTINCT {root: n1, neighbor: n2, r: r2}) AS twoHop
      WITH oneHop + twoHop AS allRows
      UNWIND allRows AS row
      WITH row WHERE row.neighbor IS NOT NULL AND row.r IS NOT NULL
      RETURN row.root AS p, row.r AS r, row.neighbor AS neighbor
      LIMIT 150
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return buildGraphFromRows(results, 'p');
  }

  // =======================================================================
  // 辅助方法
  // =======================================================================

  private mapProfile(raw: any) {
    const p = raw.p ?? {};
    const univ = raw.university;
    const advisorList = raw.advisorList ?? [];
    const studentList = raw.studentList ?? [];
    return {
      uuid: p.uuid,
      internalId: p.internalId,
      englishName: p.englishName,
      chineseName: p.chineseName,
      currentStatus: p.currentStatus,
      description: p.description,
      bio: p.bio,
      education: p.education,
      title: p.title,
      researchInterests: parseArrayProperty(p.researchInterests),
      aliases: parseArrayProperty(p.aliases),
      photoUrl: p.photoUrl,
      orcid: p.orcid,
      homepage: p.homepage,
      hIndex: p.hIndex,
      // paperCount: 取属性值与图谱边计数的较大者
      paperCount: Math.max(p.paperCount ?? 0, raw.paperCount ?? 0),
      coauthorCount: raw.coauthorCount ?? 0,
      citationCount: p.citationCount,
      // 学术家谱
      advisorCount: raw.advisorCount ?? 0,
      advisorList,
      studentCount: raw.studentCount ?? 0,
      studentList,
      potentialAdvisors: p.potentialAdvisors ?? [],
      // 职业履历
      firstPaperYear: p.firstPaperYear?.toNumber?.() ?? p.firstPaperYear,
      lastPaperYear: p.lastPaperYear?.toNumber?.() ?? p.lastPaperYear,
      activeYears: p.activeYears?.toNumber?.() ?? p.activeYears,
      timeline: p.timeline,
      // 机构
      lab: raw.lab ? { uuid: raw.lab.uuid, name: raw.lab.chineseName || raw.lab.englishName || raw.lab.name, englishName: raw.lab.englishName, city: raw.lab.city, country: raw.lab.country, description: raw.lab.description, keywords: raw.lab.keywords } : null,
      university: univ ? { uuid: univ.uuid, name: univ.name, englishName: univ.englishName, chineseName: univ.chineseName, country: univ.country ?? null } : null,
    };
  }
}
