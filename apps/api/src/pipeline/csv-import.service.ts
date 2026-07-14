// =============================================================================
// CSV Import Service — 通过 API 端点在 Neo4j 中导入种子 CSV 数据
// 解决 ts-node 不可用的问题
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import * as path from 'path';

interface CsvRow {
  uuid: string;
  [key: string]: string;
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /** 解析 CSV 文件 */
  private async parseCsv(filePath: string): Promise<{ headers: string[]; rows: CsvRow[] }> {
    const content = await fsp.readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseLine(lines[i]);
      const row: CsvRow = { uuid: '' };
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || '').trim();
      });
      rows.push(row);
    }
    return { headers, rows };
  }

  private parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
      else { current += ch; }
    }
    result.push(current);
    return result;
  }

  /** 导入一个数据集 */
  async importAll(): Promise<{
    professors: number; labs: number; universities: number;
    papers: number; equipment: number; facilities: number;
    errors: string[];
  }> {
    const datasetDir = path.resolve('datasets');
    const errors: string[] = [];
    let professors = 0, labs = 0, universities = 0, papers = 0, equipment = 0, facilities = 0;

    // 导入大学 (先导入，因为其他实体依赖大学)
    try {
      const uniPath = path.join(datasetDir, 'universities/seed.csv');
      if (fs.existsSync(uniPath)) {
        const { rows } = await this.parseCsv(uniPath);
        universities = await this.importUniversities(rows);
        this.logger.log(`Universities: ${universities}`);
      }
    } catch (e: any) { errors.push(`Universities: ${e.message}`); }

    // 导入教授
    try {
      const profPath = path.join(datasetDir, 'professors/seed.csv');
      if (fs.existsSync(profPath)) {
        const { rows } = await this.parseCsv(profPath);
        professors = await this.importProfessors(rows);
        this.logger.log(`Professors: ${professors}`);
      }
    } catch (e: any) { errors.push(`Professors: ${e.message}`); }

    // 导入实验室
    try {
      const labPath = path.join(datasetDir, 'labs/seed.csv');
      if (fs.existsSync(labPath)) {
        const { rows } = await this.parseCsv(labPath);
        labs = await this.importLabs(rows);
        this.logger.log(`Labs: ${labs}`);
      }
    } catch (e: any) { errors.push(`Labs: ${e.message}`); }

    // 导入论文
    try {
      const paperPath = path.join(datasetDir, 'papers/seed.csv');
      if (fs.existsSync(paperPath)) {
        const { rows } = await this.parseCsv(paperPath);
        papers = await this.importPapers(rows);
        this.logger.log(`Papers: ${papers}`);
      }
    } catch (e: any) { errors.push(`Papers: ${e.message}`); }

    // 导入设备
    try {
      const eqPath = path.join(datasetDir, 'equipment/seed.csv');
      if (fs.existsSync(eqPath)) {
        const { rows } = await this.parseCsv(eqPath);
        equipment = await this.importEquipment(rows);
        this.logger.log(`Equipment: ${equipment}`);
      }
    } catch (e: any) { errors.push(`Equipment: ${e.message}`); }

    // 导入设施
    try {
      const facPath = path.join(datasetDir, 'synchrotrons/seed.csv');
      if (fs.existsSync(facPath)) {
        const { rows } = await this.parseCsv(facPath);
        facilities = await this.importFacilities(rows);
        this.logger.log(`Facilities: ${facilities}`);
      }
    } catch (e: any) { errors.push(`Facilities: ${e.message}`); }

    return { professors, labs, universities, papers, equipment, facilities, errors };
  }

  private async importUniversities(rows: CsvRow[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      try {
        await this.neo4j.write(
          `MERGE (u:University {uuid: $uuid})
           ON CREATE SET u.chineseName=$cn, u.englishName=$en, u.country=$c, u.city=$ci,
                         u.website=$w, u.description=$d, u.confidence=0.9,
                         u.createdAt=datetime(), u.updatedAt=datetime()
           ON MATCH SET u.updatedAt=datetime() RETURN u`,
          { uuid: row.uuid, cn: row.chineseName||null, en: row.englishName||null,
            c: row.country||null, ci: row.city||null, w: row.website||null, d: row.description||null }
        );
        count++;
      } catch (e: any) { this.logger.warn(`Univ ${row.englishName}: ${e.message}`); }
    }
    return count;
  }

  private async importProfessors(rows: CsvRow[]): Promise<number> {
    let count = 0;
    const batchSize = 10;
    for (let b = 0; b < rows.length; b += batchSize) {
      const batch = rows.slice(b, b + batchSize);
      for (const row of batch) {
        try {
          const uniUuid = row.universityUuid?.trim();
          await this.neo4j.write(
            `MERGE (p:Person {uuid: $uuid})
             ON CREATE SET p.chineseName=$cn, p.englishName=$en, p.orcid=$orcid,
                           p.homepage=$hp, p.email=$em, p.currentStatus='active',
                           p.researchInterests=split($ri,';'), p.confidence=0.8,
                           p.createdAt=datetime(), p.updatedAt=datetime()
             ON MATCH SET p.researchInterests=split($ri,';'), p.updatedAt=datetime()
             WITH p
             OPTIONAL MATCH (u:University {uuid: $uniUuid})
             FOREACH (_ IN CASE WHEN u IS NOT NULL THEN [1] ELSE [] END |
               MERGE (p)-[:AFFILIATED_WITH {confidence:0.8,source:'csv_import'}]->(u)
             )
             RETURN p.uuid`,
            { uuid: row.uuid, cn: row.chineseName||null, en: row.englishName||null,
              orcid: row.orcid||null, hp: row.homepage||null, em: row.email||null,
              ri: row.researchInterests||'', uniUuid: uniUuid || null }
          );
          count++;
        } catch (e: any) { /* skip duplicates */ }
      }
    }
    return count;
  }

  private async importLabs(rows: CsvRow[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      try {
        const uniUuid = row.universityUuid?.trim();
        await this.neo4j.write(
          `MERGE (l:Lab {uuid: $uuid})
           ON CREATE SET l.name=$n, l.englishName=$en, l.abbreviation=$abbr,
                         l.homepage=$hp, l.description=$d, l.foundedYear=$fy,
                         l.country=$c, l.city=$ci, l.keywords=split($kw,';'),
                         l.currentStatus='Active', l.confidence=0.8,
                         l.createdAt=datetime(), l.updatedAt=datetime()
           ON MATCH SET l.updatedAt=datetime()
           WITH l
           OPTIONAL MATCH (u:University {uuid: $uniUuid})
           FOREACH (_ IN CASE WHEN u IS NOT NULL THEN [1] ELSE [] END |
             MERGE (l)-[:BELONGS_TO {confidence:0.8,source:'csv_import'}]->(u)
           )
           RETURN l.uuid`,
          { uuid: row.uuid, n: row.name||null, en: row.englishName||null,
            abbr: row.abbreviation||null, hp: row.homepage||null, d: row.description||null,
            fy: row.foundedYear?parseInt(row.foundedYear):null, c: row.country||null,
            ci: row.city||null, kw: row.keywords||'', uniUuid: uniUuid || null }
        );
        count++;
      } catch (e: any) { /* skip */ }
    }
    return count;
  }

  private async importPapers(rows: CsvRow[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      try {
        await this.neo4j.write(
          `MERGE (p:Paper {doi: $doi})
           ON CREATE SET p.uuid=$uuid, p.title=$t, p.authors=split($a,';'),
                         p.year=$y, p.journal=$j, p.citationCount=$cc,
                         p.keywords=split($kw,';'), p.source='csv_import',
                         p.confidence=0.9, p.createdAt=datetime(), p.updatedAt=datetime()
           ON MATCH SET p.citationCount=$cc, p.updatedAt=datetime() RETURN p`,
          { doi: row.doi||`paper-${row.uuid}`, uuid: row.uuid, t: row.title||null,
            a: row.authors||'', y: row.year?parseInt(row.year):null,
            j: row.journal||null, cc: row.citationCount?parseInt(row.citationCount):0,
            kw: row.keywords||'' }
        );
        count++;
      } catch (e: any) { /* skip */ }
    }
    return count;
  }

  private async importEquipment(rows: CsvRow[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      try {
        await this.neo4j.write(
          `MERGE (e:Equipment {uuid: $uuid})
           ON CREATE SET e.name=$n, e.category=$cat, e.manufacturer=$mfr, e.model=$mdl,
                         e.description=$d, e.installationYear=$y, e.status='operational',
                         e.confidence=0.8, e.createdAt=datetime(), e.updatedAt=datetime()
           ON MATCH SET e.updatedAt=datetime() RETURN e`,
          { uuid: row.uuid, n: row.name||null, cat: row.category||'Other',
            mfr: row.manufacturer||null, mdl: row.model||null, d: row.description||null,
            y: row.installationYear?parseInt(row.installationYear):null }
        );
        count++;
      } catch (e: any) { /* skip */ }
    }
    return count;
  }

  private async importFacilities(rows: CsvRow[]): Promise<number> {
    let count = 0;
    for (const row of rows) {
      try {
        await this.neo4j.write(
          `MERGE (f:Facility {uuid: $uuid})
           ON CREATE SET f.name=$n, f.englishName=$en, f.country=$c, f.city=$ci,
                         f.website=$w, f.description=$d, f.facilityType='synchrotron',
                         f.confidence=0.95, f.createdAt=datetime(), f.updatedAt=datetime()
           RETURN f`,
          { uuid: row.uuid, n: row.name||null, en: row.englishName||null,
            c: row.country||null, ci: row.city||null, w: row.website||null,
            d: row.description||null }
        );
        count++;
      } catch (e: any) { /* skip */ }
    }
    return count;
  }
}
