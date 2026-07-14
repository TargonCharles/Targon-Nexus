import { Injectable, NotFoundException } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { buildGraphFromRows } from '@arp/shared';

@Injectable()
export class DirectionService {
  constructor(private readonly neo4j: Neo4jService) {}

  async getProfile(uuid: string) {
    const cypher = `
      MATCH (rd:ResearchDirection {uuid: $uuid})
      OPTIONAL MATCH (parent:ResearchDirection)-[:PARENT_OF]->(rd)
      OPTIONAL MATCH (rd)-[:PARENT_OF]->(child:ResearchDirection)
      RETURN rd, parent, collect(DISTINCT child) AS children
    `;
    const result = await this.neo4j.readOne<any>(cypher, { uuid });
    if (!result) throw new NotFoundException(`未找到研究方向 ${uuid}`);
    return {
      ...(result.rd ?? {}),
      parent: result.parent ?? null,
      children: (result.children ?? []).filter((c: any) => c?.uuid),
    };
  }

  async getPeople(uuid: string) {
    const cypher = `
      MATCH (rd:ResearchDirection {uuid: $uuid})<-[:RESEARCHES_ON]-(person:Person)
      OPTIONAL MATCH (person)-[:MEMBER_OF]->(lab:Lab)
      RETURN person, lab ORDER BY person.englishName
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.person ?? {}), lab: row.lab ?? null }));
  }

  async getLabs(uuid: string) {
    const cypher = `
      MATCH (rd:ResearchDirection {uuid: $uuid})<-[:RESEARCHES_ON]-(lab:Lab)
      OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
      RETURN lab, univ ORDER BY lab.name
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.lab ?? {}), university: row.univ ?? null }));
  }

  async getGraph(uuid: string) {
    const cypher = `
      MATCH (rd:ResearchDirection {uuid: $uuid})-[r]-(neighbor)
      WHERE neighbor:Person OR neighbor:Lab OR neighbor:ResearchDirection
      RETURN rd, r, neighbor LIMIT 100
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return buildGraphFromRows(results, 'rd');
  }
}
