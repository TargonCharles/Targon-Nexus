import { Injectable, NotFoundException } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { buildGraphFromRows } from '@arp/shared';

@Injectable()
export class EquipmentService {
  constructor(private readonly neo4j: Neo4jService) {}

  async getProfile(uuid: string) {
    const cypher = `
      MATCH (e:Equipment {uuid: $uuid})
      OPTIONAL MATCH (lab:Lab)-[:HAS_EQUIPMENT]->(e)
      OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
      RETURN e, lab, univ
    `;
    const result = await this.neo4j.readOne<any>(cypher, { uuid });
    if (!result) throw new NotFoundException(`未找到设备 ${uuid}`);
    return {
      ...(result.e ?? {}),
      lab: result.lab ?? null,
      university: result.univ ?? null,
    };
  }

  async getLabs(uuid: string) {
    const cypher = `
      MATCH (lab:Lab)-[:HAS_EQUIPMENT]->(e:Equipment {uuid: $uuid})
      OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
      RETURN lab, univ ORDER BY lab.name
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return results.map((row) => ({ ...(row.lab ?? {}), university: row.univ ?? null }));
  }

  async getGraph(uuid: string) {
    const cypher = `
      MATCH (e:Equipment {uuid: $uuid})-[r]-(neighbor)
      WHERE neighbor:Lab OR neighbor:Person OR neighbor:ResearchDirection
      RETURN e, r, neighbor LIMIT 100
    `;
    const results = await this.neo4j.read<any>(cypher, { uuid });
    return buildGraphFromRows(results, 'e');
  }
}
