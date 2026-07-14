import { Injectable, NotFoundException } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { parseArrayProperty, buildGraphFromRows } from '@arp/shared';

@Injectable()
export class LabService {
  constructor(private readonly neo4j: Neo4jService) {}

  async getProfile(uuid: string) {
    const cypher = `
      MATCH (l:Lab {uuid: $uuid})
      OPTIONAL MATCH (l)-[:BELONGS_TO]->(u:University)
      OPTIONAL MATCH (l)-[:PART_OF]->(s:School)
      RETURN l, u, s
    `;
    const result = await this.neo4j.readOne<any>(cypher, { uuid });
    if (!result) throw new NotFoundException(`未找到实验室 ${uuid}`);
    return {
      ...(result.l ?? {}),
      keywords: parseArrayProperty(result.l?.keywords),
      university: result.u ?? null,
      school: result.s ?? null,
    };
  }

  async getMembers(uuid: string) {
    const cypher = `
      MATCH (person:Person)-[:MEMBER_OF]->(l:Lab {uuid: $uuid})
      RETURN person ORDER BY person.englishName
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => row.person ?? {});
  }

  async getAlumni(uuid: string) {
    const cypher = `
      MATCH (person:Person)-[:ALUMNI_OF]->(l:Lab {uuid: $uuid})
      OPTIONAL MATCH (person)-[:WORKS_AT]->(company:Company)
      RETURN person, company ORDER BY person.englishName
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.person ?? {}), company: row.company ?? null }));
  }

  async getEquipment(uuid: string) {
    const cypher = `
      MATCH (l:Lab {uuid: $uuid})-[:HAS_EQUIPMENT]->(e:Equipment)
      RETURN e ORDER BY e.name
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => row.e ?? {});
  }

  async getDirections(uuid: string) {
    const cypher = `
      MATCH (l:Lab {uuid: $uuid})-[:RESEARCHES_ON]->(rd:ResearchDirection)
      OPTIONAL MATCH (parent:ResearchDirection)-[:PARENT_OF]->(rd)
      RETURN rd, parent ORDER BY rd.name
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.rd ?? {}), parent: row.parent ?? null }));
  }

  async getCollaborators(uuid: string) {
    const cypher = `
      MATCH (l:Lab {uuid: $uuid})-[:COLLABORATES_WITH]->(partner:Lab)
      OPTIONAL MATCH (partner)-[:BELONGS_TO]->(u:University)
      RETURN partner, u ORDER BY partner.name
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.partner ?? {}), university: row.u ?? null }));
  }

  async getTimeline(uuid: string) {
    const cypher = `
      MATCH (l:Lab {uuid: $uuid})-[rel:HAS_EVENT]->(event:Event)
      RETURN event ORDER BY event.date DESC LIMIT 50
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => row.event ?? {});
  }

  async getGraph(uuid: string) {
    const cypher = `
      MATCH (l:Lab {uuid: $uuid})-[r1]-(n1)
      WHERE n1:Person OR n1:Lab OR n1:University OR n1:ResearchDirection OR n1:Equipment
      WITH l, r1, n1
      OPTIONAL MATCH (n1)-[r2]-(n2)
      WHERE n2:Person OR n2:Lab OR n2:University OR n2:ResearchDirection OR n2:Equipment
        AND n2.uuid <> l.uuid
      WITH collect(DISTINCT {root: l, neighbor: n1, r: r1}) AS oneHop,
           collect(DISTINCT {root: n1, neighbor: n2, r: r2}) AS twoHop
      WITH oneHop + twoHop AS allRows
      UNWIND allRows AS row
      WITH row WHERE row.neighbor IS NOT NULL AND row.r IS NOT NULL
      RETURN row.root AS l, row.r AS r, row.neighbor AS neighbor
      LIMIT 150
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return buildGraphFromRows(results, 'l');
  }
}
