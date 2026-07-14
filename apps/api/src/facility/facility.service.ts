import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { paginate } from '@arp/shared';

export interface FacilityDetail {
  uuid: string;
  name: string;
  englishName: string;
  country: string;
  city: string;
  website: string;
  description: string;
  facilityType: string;
  createdAt: string;
}

export interface GraphData {
  nodes: Array<{ uuid: string; type: string; label: string; properties: Record<string, unknown>; degree?: number }>;
  edges: Array<{ source: string; target: string; type: string; label: string; properties: Record<string, unknown> }>;
}

@Injectable()
export class FacilityService {
  private readonly logger = new Logger(FacilityService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  async getFacility(uuid: string): Promise<FacilityDetail | null> {
    const results = await this.neo4j.read<FacilityDetail>(
      `MATCH (f:Facility {uuid: $uuid})
       RETURN f.uuid AS uuid, f.name AS name, f.englishName AS englishName,
              f.country AS country, f.city AS city, f.website AS website,
              f.description AS description, f.facilityType AS facilityType,
              toString(f.createdAt) AS createdAt`,
      { uuid },
    );
    return results[0] ?? null;
  }

  async listAll(opts?: { page?: number; pageSize?: number }): Promise<{ items: FacilityDetail[]; total: number }> {
    const { skip, limit } = paginate(opts, 100);

    const [items, countResult] = await Promise.all([
      this.neo4j.read<FacilityDetail>(
        `MATCH (f:Facility)
         RETURN f.uuid AS uuid, f.name AS name, f.englishName AS englishName,
                f.country AS country, f.city AS city, f.website AS website,
                f.description AS description, f.facilityType AS facilityType,
                toString(f.createdAt) AS createdAt
         ORDER BY f.country, f.name
         SKIP $skip LIMIT $limit`,
        { skip, limit },
      ),
      this.neo4j.read<{ total: number }>(
        `MATCH (f:Facility) RETURN count(f) AS total`,
      ),
    ]);

    return { items, total: countResult[0]?.total ?? 0 };
  }

  async getByCountry(country: string): Promise<FacilityDetail[]> {
    return this.neo4j.read<FacilityDetail>(
      `MATCH (f:Facility {country: $country})
       RETURN f.uuid AS uuid, f.name AS name, f.englishName AS englishName,
              f.country AS country, f.city AS city, f.website AS website,
              f.description AS description, f.facilityType AS facilityType,
              toString(f.createdAt) AS createdAt
       ORDER BY f.name`,
      { country },
    );
  }

  async getFacilityGraph(uuid: string): Promise<GraphData> {
    const results = await this.neo4j.read<{
      nodeUuid: string; nodeType: string; nodeLabel: string;
      description: string; facilityType: string;
      edgeSource: string; edgeTarget: string; edgeType: string; edgeLabel: string;
      confidence: number;
    }>(
      `MATCH (f:Facility {uuid: $uuid})
       OPTIONAL MATCH (f)-[r]-(related)
       WHERE labels(related)[0] IN ['Person', 'Lab', 'University', 'Equipment', 'ResearchDirection']
       RETURN
         f.uuid AS nodeUuid,
         'Facility' AS nodeType,
         coalesce(f.englishName, f.name) AS nodeLabel,
         f.description AS description,
         f.facilityType AS facilityType,
         null AS edgeSource,
         null AS edgeTarget,
         null AS edgeType,
         null AS edgeLabel,
         null AS confidence
       UNION
       MATCH (f:Facility {uuid: $uuid})-[r]-(related)
       WHERE labels(related)[0] IN ['Person', 'Lab', 'University', 'Equipment', 'ResearchDirection']
       RETURN
         related.uuid AS nodeUuid,
         labels(related)[0] AS nodeType,
         coalesce(related.englishName, related.name, related.title) AS nodeLabel,
         related.description AS description,
         null AS facilityType,
         startNode(r).uuid AS edgeSource,
         endNode(r).uuid AS edgeTarget,
         type(r) AS edgeType,
         type(r) AS edgeLabel,
         r.confidence AS confidence`,
      { uuid },
    );

    const nodesMap = new Map<string, any>();
    const edgesMap = new Map<string, any>();

    for (const row of results) {
      if (row.nodeUuid) {
        if (!nodesMap.has(row.nodeUuid)) {
          nodesMap.set(row.nodeUuid, {
            uuid: row.nodeUuid,
            type: row.nodeType?.toLowerCase() || 'facility',
            label: row.nodeLabel || 'Unknown',
            properties: {
              description: row.description || null,
              facilityType: row.facilityType || null,
            },
            degree: 0,
          });
        }
      }
      if (row.edgeSource && row.edgeTarget) {
        const key = `${row.edgeSource}|${row.edgeType}|${row.edgeTarget}`;
        if (!edgesMap.has(key)) {
          edgesMap.set(key, {
            source: row.edgeSource,
            target: row.edgeTarget,
            type: row.edgeType || 'LOCATED_AT',
            label: row.edgeLabel || '',
            properties: { confidence: row.confidence ?? null },
          });
        }
      }
    }

    for (const edge of edgesMap.values()) {
      if (nodesMap.has(edge.source)) nodesMap.get(edge.source).degree++;
      if (nodesMap.has(edge.target)) nodesMap.get(edge.target).degree++;
    }

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    };
  }
}
