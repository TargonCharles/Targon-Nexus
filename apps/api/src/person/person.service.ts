import { Injectable, NotFoundException } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { parseArrayProperty, buildGraphFromRows } from '@arp/shared';

@Injectable()
export class PersonService {
  constructor(private readonly neo4j: Neo4jService) {}

  async getProfile(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})
      OPTIONAL MATCH (p)-[:MEMBER_OF]->(lab:Lab)
      OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
      RETURN p, lab, univ
    `;
    const result = await this.neo4j.readOne<any>(cypher, { uuid });
    if (!result) throw new NotFoundException(`未找到人物 ${uuid}`);

    return {
      ...(result.p ?? {}),
      lab: result.lab ?? null,
      university: result.univ ?? null,
      aliases: parseArrayProperty(result.p?.aliases),
      researchInterests: parseArrayProperty(result.p?.researchInterests),
    };
  }

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

  async getTimeline(uuid: string) {
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[rel:HAS_EVENT]->(event:Event)
      RETURN event ORDER BY event.date DESC LIMIT 50
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => row.event ?? {});
  }

  /** 纯人物关系图谱 — 仅导师/学生/同学/合作者 */
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
    // 2-hop expanded network — shows richer connections
    const cypher = `
      MATCH (p:Person {uuid: $uuid})-[r1]-(n1)
      WHERE n1:Person OR n1:Lab OR n1:University OR n1:ResearchDirection OR n1:Equipment
      WITH p, r1, n1
      OPTIONAL MATCH (n1)-[r2]-(n2)
      WHERE n2:Person OR n2:Lab OR n2:University OR n2:ResearchDirection OR n2:Equipment
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
}
