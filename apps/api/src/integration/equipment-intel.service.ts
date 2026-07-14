import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';

export interface EquipmentStats {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  byBrand: Array<{ brand: string; count: number }>;
  avgAge: number;
  oldEquipment: Array<{ name: string; year: number; lab: string }>;
}

export interface EquipmentNetwork {
  equipment: string;
  lab: string;
  sharedBrandLabs: string[];
  sharedCategoryLabs: string[];
}

export interface SalesLead {
  labName: string;
  institution: string;
  country: string;
  hasEquipment: string[];
  missingEquipment: string[];
  potentialBrands: string[];
  score: number;
}

@Injectable()
export class EquipmentIntelService {
  private readonly logger = new Logger(EquipmentIntelService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 设备总体统计 */
  async getStats(): Promise<EquipmentStats> {
    const [byCat, byBrand, oldEq, totalR] = await Promise.all([
      this.neo4j.read<{ category: string; count: number }>(
        `MATCH (e:Equipment) WHERE e.category IS NOT NULL
         RETURN e.category AS category, count(e) AS count ORDER BY count DESC`,
      ),
      this.neo4j.read<{ brand: string; count: number }>(
        `MATCH (e:Equipment) WHERE e.brand IS NOT NULL
         RETURN e.brand AS brand, count(e) AS count ORDER BY count DESC`,
      ),
      this.neo4j.read<{ name: string; year: number; lab: string }>(
        `MATCH (e:Equipment) WHERE e.installationYear IS NOT NULL AND e.installationYear < 2018
         OPTIONAL MATCH (lab:Lab)-[:HAS_EQUIPMENT]->(e)
         RETURN e.name AS name, e.installationYear AS year,
                coalesce(lab.name, 'Unknown') AS lab
         ORDER BY e.installationYear LIMIT 10`,
      ),
      this.neo4j.read<{ t: number }>('MATCH (e:Equipment) RETURN count(e) AS t'),
    ]);

    // 计算平均机龄
    const ages = await this.neo4j.read<{ y: number }>(
      `MATCH (e:Equipment) WHERE e.installationYear IS NOT NULL
       RETURN 2026 - e.installationYear AS y`,
    );
    const avgAge = ages.length > 0
      ? Math.round(ages.reduce((s, r) => s + r.y, 0) / ages.length)
      : 0;

    return {
      total: totalR[0]?.t ?? 0,
      byCategory: byCat,
      byBrand,
      avgAge,
      oldEquipment: oldEq,
    };
  }

  /** 同品牌设备网络 */
  async getBrandNetwork(brand: string): Promise<EquipmentNetwork[]> {
    const results = await this.neo4j.read<{
      equipment: string; lab: string; sharedBrandLabs: string[];
    }>(
      `MATCH (e:Equipment {brand: $brand})<-[:HAS_EQUIPMENT]-(lab:Lab)
       OPTIONAL MATCH (otherLab:Lab)-[:HAS_EQUIPMENT]->(:Equipment {brand: $brand})
       WHERE otherLab.uuid <> lab.uuid
       RETURN e.name AS equipment, lab.name AS lab,
              collect(DISTINCT otherLab.name) AS sharedBrandLabs`,
      { brand },
    );
    return results.map((r) => ({
      ...r,
      sharedCategoryLabs: [],
    }));
  }

  /** 发现潜在销售机会 — 单次批量查询替代 N+1 */
  async discoverSalesLeads(): Promise<SalesLead[]> {
    // 批量查询：对每个 lab 列出它拥有的品牌和所在品类中缺少的品牌
    const results = await this.neo4j.read<{
      labName: string; instName: string; country: string;
      hasEquipment: string[]; categories: string[];
      missingBrands: string[];
    }>(
      `MATCH (lab:Lab)-[:HAS_EQUIPMENT]->(e:Equipment)
       OPTIONAL MATCH (lab)-[:BELONGS_TO]->(univ:University)
       WITH lab, univ, e,
            collect(DISTINCT e.name) AS equipment,
            collect(DISTINCT e.category) AS categories
       // 批量查找每个 lab 缺少的品牌：取所有该品类有设备的品牌，排除该 lab 已有的
       OPTIONAL MATCH (other:Equipment)
       WHERE other.category IN categories AND other.brand IS NOT NULL
         AND NOT EXISTS {
           MATCH (lab)-[:HAS_EQUIPMENT]->(:Equipment {brand: other.brand})
         }
       WITH lab, univ, equipment, categories,
            collect(DISTINCT other.brand)[0..5] AS missingBrands
       WHERE size(missingBrands) > 0
       RETURN lab.name AS labName,
              coalesce(univ.englishName, 'Unknown') AS instName,
              coalesce(lab.country, univ.country, 'Unknown') AS country,
              equipment AS hasEquipment,
              categories,
              missingBrands`,
    );

    return results
      .map((lab) => ({
        labName: lab.labName,
        institution: lab.instName,
        country: lab.country,
        hasEquipment: lab.hasEquipment,
        missingEquipment: lab.missingBrands,
        potentialBrands: lab.missingBrands,
        score: Math.min(0.9, 0.3 + lab.missingBrands.length * 0.15),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /** 设备采购窗口预测 */
  async predictUpgradeWindow(): Promise<Array<{
    equipment: string; lab: string; installed: number;
    age: number; upgradeUrgency: string;
  }>> {
    const equipment = await this.neo4j.read<{
      name: string; lab: string; year: number;
    }>(
      `MATCH (e:Equipment) WHERE e.installationYear IS NOT NULL
       OPTIONAL MATCH (lab:Lab)-[:HAS_EQUIPMENT]->(e)
       RETURN e.name AS name, coalesce(lab.name, 'Unknown') AS lab,
              e.installationYear AS year`,
    );

    return equipment
      .map((e) => {
        const age = 2026 - e.year;
        return {
          equipment: e.name,
          lab: e.lab,
          installed: e.year,
          age,
          upgradeUrgency: age > 15 ? 'urgent' : age > 10 ? 'soon' : age > 5 ? 'planned' : 'ok',
        };
      })
      .sort((a, b) => b.age - a.age);
  }
}
