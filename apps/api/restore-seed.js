const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const obj = {};
    const vals = line.split(',');
    headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
    return obj;
  });
}

async function main() {
  const session = driver.session();
  const base = path.resolve(__dirname, '../../datasets');

  // Clear all existing data first
  console.log('Clearing existing data...');
  await session.run('MATCH (n) DETACH DELETE n');

  // 1. Universities (uuid,chineseName,englishName,country,city,website,description)
  const unis = parseCSV(path.join(base, 'universities/seed.csv'));
  console.log(`Importing ${unis.length} universities...`);
  for (const u of unis) {
    await session.run(
      `CREATE (u:University {uuid: $uuid})
       SET u.chineseName = $chineseName, u.englishName = $englishName,
           u.country = $country, u.city = $city,
           u.website = $website, u.description = $description,
           u.confidence = 0.95, u.sourceTier = 'TIER_1_OFFICIAL',
           u.createdAt = datetime()`,
      { uuid: u.uuid, chineseName: u.chineseName, englishName: u.englishName,
        country: u.country, city: u.city, website: u.website,
        description: u.description }
    ).catch(e => {});
  }

  // 2. Labs (uuid,name,englishName,abbreviation,homepage,description,foundedYear,universityUuid,country,city,keywords)
  const labs = parseCSV(path.join(base, 'labs/seed.csv'));
  console.log(`Importing ${labs.length} labs...`);
  for (const l of labs) {
    await session.run(
      `CREATE (lab:Lab {uuid: $uuid})
       SET lab.name = $name, lab.englishName = $englishName,
           lab.abbreviation = $abbreviation, lab.homepage = $homepage,
           lab.description = $description, lab.foundedYear = $foundedYear,
           lab.country = $country, lab.keywords = $keywords,
           lab.confidence = 0.9, lab.sourceTier = 'TIER_1_OFFICIAL',
           lab.createdAt = datetime()`,
      { uuid: l.uuid, name: l.name, englishName: l.englishName,
        abbreviation: l.abbreviation, homepage: l.homepage,
        description: l.description, foundedYear: l.foundedYear,
        country: l.country, keywords: l.keywords }
    ).catch(e => {});
    if (l.universityUuid) {
      await session.run(
        `MATCH (lab:Lab {uuid: $lab}), (u:University {uuid: $uni})
         CREATE (lab)-[:BELONGS_TO {confidence:0.9,source:'seed_import'}]->(u)`,
        { lab: l.uuid, uni: l.universityUuid }
      ).catch(e => {});
    }
  }

  // 3. Professors (uuid,chineseName,englishName,orcid,homepage,email,researchInterests,universityUuid)
  const profs = parseCSV(path.join(base, 'professors/seed.csv'));
  console.log(`Importing ${profs.length} professors...`);
  for (const p of profs) {
    await session.run(
      `CREATE (per:Person {uuid: $uuid})
       SET per.chineseName = $chineseName, per.englishName = $englishName,
           per.orcid = $orcid, per.homepage = $homepage, per.email = $email,
           per.researchInterests = $interests,
           per.confidence = 0.85, per.sourceTier = 'TIER_1_OFFICIAL',
           per.createdAt = datetime()`,
      { uuid: p.uuid, chineseName: p.chineseName, englishName: p.englishName,
        orcid: p.orcid, homepage: p.homepage, email: p.email,
        interests: p.researchInterests }
    ).catch(e => {});
    if (p.universityUuid) {
      await session.run(
        `MATCH (p:Person {uuid: $per}), (u:University {uuid: $uni})
         CREATE (p)-[:AFFILIATED_WITH {confidence:0.8,source:'seed_import'}]->(u)`,
        { per: p.uuid, uni: p.universityUuid }
      ).catch(e => {});
    }
  }

  // 4. Equipment (uuid,name,category,manufacturer,model,labUuid,description,installationYear)
  const equip = parseCSV(path.join(base, 'equipment/seed.csv'));
  console.log(`Importing ${equip.length} equipment...`);
  for (const e of equip) {
    await session.run(
      `CREATE (eq:Equipment {uuid: $uuid})
       SET eq.name = $name, eq.category = $category,
           eq.manufacturer = $manufacturer, eq.model = $model,
           eq.description = $description,
           eq.installationYear = $installYear,
           eq.confidence = 0.8, eq.sourceTier = 'TIER_1_OFFICIAL',
           eq.createdAt = datetime()`,
      { uuid: e.uuid, name: e.name, category: e.category,
        manufacturer: e.manufacturer, model: e.model,
        description: e.description, installYear: e.installationYear }
    ).catch(e => {});
    if (e.labUuid) {
      await session.run(
        `MATCH (eq:Equipment {uuid: $eq}), (l:Lab {uuid: $lab})
         CREATE (l)-[:HAS_EQUIPMENT {confidence:0.8,source:'seed_import'}]->(eq)`,
        { eq: e.uuid, lab: e.labUuid }
      ).catch(e => {});
    }
  }

  // 5. Papers (doi,title,authors,year,journal,citationCount,keywords)
  const papers = parseCSV(path.join(base, 'papers/seed.csv'));
  console.log(`Importing ${papers.length} papers...`);
  for (const p of papers) {
    if (!p.doi) continue;
    await session.run(
      `CREATE (pp:Paper {uuid: randomUUID()})
       SET pp.title = $title, pp.doi = $doi,
           pp.authors = $authors, pp.year = $year,
           pp.journal = $journal, pp.citationCount = $cc,
           pp.keywords = $keywords,
           pp.confidence = 0.9, pp.sourceTier = 'TIER_2_ACADEMIC',
           pp.createdAt = datetime()`,
      { title: p.title || '', doi: p.doi,
        authors: p.authors || '', year: p.year || '',
        journal: p.journal || '', cc: p.citationCount || '0',
        keywords: p.keywords || '' }
    ).catch(e => {});
  }

  // Stats
  const r = await session.run(
    `MATCH (p:Person) RETURN 'Persons' AS label, count(p) AS count
     UNION ALL
     MATCH (l:Lab) RETURN 'Labs' AS label, count(l) AS count
     UNION ALL
     MATCH (u:University) RETURN 'Universities' AS label, count(u) AS count
     UNION ALL
     MATCH (e:Equipment) RETURN 'Equipment' AS label, count(e) AS count
     UNION ALL
     MATCH (pp:Paper) RETURN 'Papers' AS label, count(pp) AS count
     UNION ALL
     MATCH ()-[rel]->() RETURN 'Relationships' AS label, count(rel) AS count`
  );
  r.records.forEach(x => console.log(`  ${x.get('label')}: ${x.get('count')}`));

  await session.close();
  driver.close();
  console.log('Done! Refresh frontend to see restored data.');
}

main().catch(e => { console.error(e.message); driver.close(); });
