// =============================================================================
// Targon Nexus — 批量种子数据导入脚本
// 读取 datasets/ 下所有 CSV，通过 neo4j-driver 写入 Neo4j
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import neo4j from 'neo4j-driver';

// — Neo4j 连接配置 —
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

function parseCsv(filePath: string): { headers: string[]; rows: Record<string, string>[] } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function importDataset(
  session: neo4j.Session,
  filePath: string,
  entityType: string,
): Promise<{ created: number; errors: number }> {
  const { headers, rows } = parseCsv(filePath);
  if (rows.length === 0) {
    console.log(`  ⚠ ${entityType}: 空数据集，跳过`);
    return { created: 0, errors: 0 };
  }

  console.log(`  📦 ${entityType}: ${rows.length} 条记录`);

  let created = 0;
  let errors = 0;
  const batchSize = 50;

  for (let b = 0; b < rows.length; b += batchSize) {
    const batch = rows.slice(b, b + batchSize);
    const txn = session.beginTransaction();

    try {
      for (const row of batch) {
        const query = buildImportQuery(entityType, row, headers);
        if (query) {
          await txn.run(query.cypher, query.params);
          created++;
        }
      }
      await txn.commit();
    } catch (err: any) {
      await txn.rollback();
      errors += batch.length;
      console.error(`    ❌ 批次 ${b / batchSize + 1} 失败: ${err.message}`);
    }
  }

  return { created, errors };
}

function buildImportQuery(
  entityType: string,
  row: Record<string, string>,
  _headers: string[],
): { cypher: string; params: Record<string, unknown> } | null {
  switch (entityType) {
    case 'professor': return buildPersonQuery(row);
    case 'lab': return buildLabQuery(row);
    case 'university': return buildUniversityQuery(row);
    case 'equipment': return buildEquipmentQuery(row);
    case 'paper': return buildPaperQuery(row);
    case 'synchrotron': return buildSynchrotronQuery(row);
    case 'company': return buildCompanyQuery(row);
    case 'taxonomy': return buildTaxonomyQuery(row);
    default: return null;
  }
}

function buildPersonQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    chineseName: row.chineseName || null,
    englishName: row.englishName || null,
    orcid: row.orcid || null,
    homepage: row.homepage || null,
    email: row.email || null,
    researchInterests: row.researchInterests ? row.researchInterests.split(';').map((s) => s.trim()) : [],
    universityUuid: row.universityUuid || null,
  };

  const cypher = `
    MERGE (p:Person {uuid: $uuid})
    ON CREATE SET
      p.chineseName = $chineseName,
      p.englishName = $englishName,
      p.orcid = $orcid,
      p.homepage = $homepage,
      p.email = $email,
      p.researchInterests = $researchInterests,
      p.currentStatus = 'active',
      p.confidence = 0.8,
      p.createdAt = datetime(),
      p.updatedAt = datetime()
    ON MATCH SET
      p.englishName = coalesce($englishName, p.englishName),
      p.researchInterests = $researchInterests,
      p.updatedAt = datetime()
  `;

  let fullCypher = cypher;
  if (row.universityUuid) {
    fullCypher += `
    WITH p
    MATCH (u:University {uuid: $universityUuid})
    MERGE (p)-[r:AFFILIATED_WITH]->(u)
    ON CREATE SET r.confidence = 0.8, r.source = 'seed_import', r.createdAt = datetime()
    ON MATCH SET r.updatedAt = datetime()
    RETURN p.uuid AS uuid, p.englishName AS name
    `;
  } else {
    fullCypher += ` RETURN p.uuid AS uuid, p.englishName AS name`;
  }

  return { cypher: fullCypher, params };
}

function buildLabQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `lab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    name: row.name || null,
    englishName: row.englishName || null,
    abbreviation: row.abbreviation || null,
    homepage: row.homepage || null,
    description: row.description || null,
    foundedYear: row.foundedYear ? parseInt(row.foundedYear, 10) : null,
    country: row.country || null,
    city: row.city || null,
    keywords: row.keywords ? row.keywords.split(';').map((s) => s.trim()) : [],
    universityUuid: row.universityUuid || null,
  };

  const cypher = `
    MERGE (l:Lab {uuid: $uuid})
    ON CREATE SET
      l.name = $name,
      l.englishName = $englishName,
      l.abbreviation = $abbreviation,
      l.homepage = $homepage,
      l.description = $description,
      l.foundedYear = $foundedYear,
      l.country = $country,
      l.city = $city,
      l.keywords = $keywords,
      l.currentStatus = 'Active',
      l.confidence = 0.8,
      l.createdAt = datetime(),
      l.updatedAt = datetime()
    ON MATCH SET
      l.description = coalesce($description, l.description),
      l.keywords = apoc.coll.union(coalesce(l.keywords, []), $keywords),
      l.updatedAt = datetime()
  `;

  let fullCypher = cypher;
  if (row.universityUuid) {
    fullCypher += `
    WITH l
    MATCH (u:University {uuid: $universityUuid})
    MERGE (l)-[r:BELONGS_TO]->(u)
    ON CREATE SET r.confidence = 0.8, r.source = 'seed_import', r.createdAt = datetime()
    ON MATCH SET r.updatedAt = datetime()
    RETURN l.uuid AS uuid, l.name AS name
    `;
  } else {
    fullCypher += ` RETURN l.uuid AS uuid, l.name AS name`;
  }

  return { cypher: fullCypher, params };
}

function buildUniversityQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `univ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    chineseName: row.chineseName && row.chineseName !== 'None' ? row.chineseName : null,
    englishName: row.englishName || null,
    country: row.country || null,
    city: row.city || null,
    website: row.website || null,
    description: row.description || null,
  };

  return {
    cypher: `
      MERGE (u:University {uuid: $uuid})
      ON CREATE SET
        u.chineseName = $chineseName,
        u.englishName = $englishName,
        u.country = $country,
        u.city = $city,
        u.website = $website,
        u.description = $description,
        u.confidence = 0.9,
        u.createdAt = datetime(),
        u.updatedAt = datetime()
      ON MATCH SET
        u.description = coalesce($description, u.description),
        u.updatedAt = datetime()
      RETURN u.uuid AS uuid, u.englishName AS name
    `,
    params,
  };
}

function buildEquipmentQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `eq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    name: row.name || null,
    category: row.category || 'Other',
    manufacturer: row.manufacturer || null,
    model: row.model || null,
    description: row.description || null,
    installationYear: row.installationYear ? parseInt(row.installationYear, 10) : null,
    labUuid: row.labUuid || null,
  };

  const cypher = `
    MERGE (e:Equipment {uuid: $uuid})
    ON CREATE SET
      e.name = $name,
      e.category = $category,
      e.manufacturer = $manufacturer,
      e.model = $model,
      e.description = $description,
      e.installationYear = $installationYear,
      e.status = 'operational',
      e.confidence = 0.8,
      e.createdAt = datetime(),
      e.updatedAt = datetime()
    ON MATCH SET
      e.updatedAt = datetime()
  `;

  let fullCypher = cypher;
  if (row.labUuid) {
    fullCypher += `
    WITH e
    MATCH (l:Lab {uuid: $labUuid})
    MERGE (l)-[r:HAS_EQUIPMENT]->(e)
    ON CREATE SET r.confidence = 0.8, r.source = 'seed_import', r.createdAt = datetime()
    ON MATCH SET r.updatedAt = datetime()
    RETURN e.uuid AS uuid, e.name AS name
    `;
  } else {
    fullCypher += ` RETURN e.uuid AS uuid, e.name AS name`;
  }

  return { cypher: fullCypher, params };
}

function buildPaperQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    doi: row.doi || null,
    title: row.title || null,
    authors: row.authors ? row.authors.split(';').map((s) => s.trim()).filter(Boolean) : [],
    year: row.year ? parseInt(row.year, 10) : null,
    journal: row.journal || null,
    citationCount: row.citationCount ? parseInt(row.citationCount, 10) : 0,
    keywords: row.keywords ? row.keywords.split(';').map((s) => s.trim()).filter(Boolean) : [],
    source: 'seed_import',
  };

  return {
    cypher: `
      MERGE (p:Paper {doi: $doi})
      ON CREATE SET
        p.uuid = $uuid,
        p.title = $title,
        p.authors = $authors,
        p.year = $year,
        p.journal = $journal,
        p.citationCount = $citationCount,
        p.keywords = $keywords,
        p.source = $source,
        p.confidence = 0.9,
        p.createdAt = datetime(),
        p.updatedAt = datetime()
      ON MATCH SET
        p.citationCount = $citationCount,
        p.updatedAt = datetime()
      RETURN p.uuid AS uuid, p.title AS title
    `,
    params,
  };
}

function buildSynchrotronQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    name: row.name || null,
    englishName: row.englishName || null,
    country: row.country || null,
    city: row.city || null,
    website: row.website || null,
    description: row.description || null,
  };

  return {
    cypher: `
      MERGE (s:Facility {uuid: $uuid})
      ON CREATE SET
        s.name = $name,
        s.englishName = $englishName,
        s.country = $country,
        s.city = $city,
        s.website = $website,
        s.description = $description,
        s.facilityType = 'synchrotron',
        s.confidence = 0.95,
        s.createdAt = datetime(),
        s.updatedAt = datetime()
      RETURN s.uuid AS uuid, s.englishName AS name
    `,
    params,
  };
}

function buildCompanyQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const params: Record<string, unknown> = {
    uuid,
    name: row.name || null,
    country: row.country || null,
    city: row.city || null,
    website: row.website || null,
    industry: row.industry || null,
  };

  return {
    cypher: `
      MERGE (c:Company {uuid: $uuid})
      ON CREATE SET
        c.name = $name,
        c.country = $country,
        c.city = $city,
        c.website = $website,
        c.industry = $industry,
        c.confidence = 0.9,
        c.createdAt = datetime(),
        c.updatedAt = datetime()
      RETURN c.uuid AS uuid, c.name AS name
    `,
    params,
  };
}

function buildTaxonomyQuery(row: Record<string, string>): { cypher: string; params: Record<string, unknown> } {
  const uuid = row.uuid || `tax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const level = parseInt(row.level || '1', 10);
  const params: Record<string, unknown> = {
    uuid,
    name: row.name || null,
    level,
    description: row.description || null,
    parentUuid: row.parentUuid || null,
  };

  let cypher = `
    MERGE (rd:ResearchDirection {uuid: $uuid})
    ON CREATE SET
      rd.name = $name,
      rd.level = $level,
      rd.description = $description,
      rd.confidence = 0.9,
      rd.createdAt = datetime(),
      rd.updatedAt = datetime()
    ON MATCH SET
      rd.updatedAt = datetime()
  `;

  if (row.parentUuid) {
    cypher += `
    WITH rd
    MATCH (parent:ResearchDirection {uuid: $parentUuid})
    MERGE (rd)-[r:CHILD_OF]->(parent)
    ON CREATE SET r.confidence = 0.9, r.source = 'seed_import', r.createdAt = datetime()
    RETURN rd.uuid AS uuid, rd.name AS name
    `;
  } else {
    cypher += ` RETURN rd.uuid AS uuid, rd.name AS name`;
  }

  return { cypher, params };
}

// — 主入口 —
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Targon Nexus — 批量种子数据导入                      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Neo4j: ${NEO4J_URI}`);

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 30000,
  });

  let session: neo4j.Session | null = null;

  try {
    // 验证连接
    session = driver.session();
    await session.run('RETURN 1');
    console.log('  ✅ 数据库连接成功\n');

    // 定义数据集路径
    const datasetDir = path.resolve(__dirname, '../datasets');
    const datasets: { file: string; type: string }[] = [
      { file: 'universities/seed.csv', type: 'university' },
      { file: 'professors/seed.csv', type: 'professor' },
      { file: 'labs/seed.csv', type: 'lab' },
      { file: 'taxonomy/arpes-directions.csv', type: 'taxonomy' },
      { file: 'equipment/seed.csv', type: 'equipment' },
      { file: 'papers/seed.csv', type: 'paper' },
      { file: 'synchrotrons/seed.csv', type: 'synchrotron' },
      { file: 'companies/seed.csv', type: 'company' },
    ];

    let totalCreated = 0;
    let totalErrors = 0;
    const startTime = Date.now();

    // 按依赖顺序导入（先大学，再人物/实验室/设备）
    for (const ds of datasets) {
      const filePath = path.join(datasetDir, ds.file);
      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠ ${ds.type}: 文件不存在 ${ds.file}，跳过`);
        continue;
      }

      console.log(`\n  📂 ${ds.file}`);
      const result = await importDataset(session, filePath, ds.type);
      totalCreated += result.created;
      totalErrors += result.errors;
      console.log(`    ✅ 创建/更新 ${result.created} 条，失败 ${result.errors} 条`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  🎉 导入完成! 总计 ${totalCreated} 实体，${totalErrors} 错误 (${elapsed}s)`);
    console.log('═══════════════════════════════════════════════════════\n');

    // 输出统计
    const counts = await session.run(`
      MATCH (n)
      WHERE n:Person OR n:Lab OR n:University OR n:Equipment OR n:Paper OR n:ResearchDirection OR n:Facility OR n:Company
      RETURN labels(n)[0] AS type, count(n) AS cnt
      ORDER BY type
    `);
    console.log('  图谱统计:');
    counts.records.forEach((r) => {
      console.log(`    ${r.get('type')}: ${r.get('cnt')}`);
    });

  } catch (err: any) {
    console.error(`\n  ❌ 导入失败: ${err.message}`);
    process.exit(1);
  } finally {
    if (session) await session.close();
    await driver.close();
  }
}

main();
