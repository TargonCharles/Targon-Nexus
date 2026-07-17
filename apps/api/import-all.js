// Comprehensive: import ALL seed datasets + link with relationships
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

function parseCSV(f) {
  const c = fs.readFileSync(f, 'utf-8');
  const lines = c.split('\n').filter(l => l.trim() && !l.startsWith('#') && l.includes(','));
  if (lines.length < 2) return [];
  const h = lines[0].split(',').map(x => x.trim());
  return lines.slice(1).map(line => {
    const o = {}; const v = line.split(',');
    h.forEach((k, i) => o[k] = (v[i] || '').trim());
    return o;
  });
}

async function main() {
  const s = driver.session();
  const base = path.resolve(__dirname, '../../datasets');
  console.log('Base:', base);

  // === Import in dependency order ===
  const imports = [
    { label: 'ResearchDirection', file: 'taxonomy/arpes-directions.csv', props: ['name', 'level', 'description', 'aliases'] },
  ];

  for (const imp of imports) {
    const rows = parseCSV(path.join(base, imp.file));
    console.log(`${imp.label}: ${rows.length} rows`);
    for (const r of rows) {
      const props = {};
      imp.props.forEach(p => { if (r[p]) props[p] = r[p]; });
      await s.run(
        `MERGE (n:${imp.label} {uuid: $uuid})
         ON CREATE SET n += $props, n.createdAt = datetime(), n.confidence = 0.95
         ON MATCH SET n.updatedAt = datetime()`,
        { uuid: r.uuid || null, props }
      ).catch(() => {});
    }
  }

  // Link labs to persons (PI)
  const labs = await s.run('MATCH (l:Lab) RETURN l.uuid AS uuid, l.name AS name');
  const persons = await s.run('MATCH (p:Person) RETURN p.uuid AS uuid, p.englishName AS name, p.chineseName AS cn');
  let linked = 0;

  for (const l of labs.records) {
    const labName = (l.get('name') || '').toLowerCase();
    const labUuid = l.get('uuid');
    for (const p of persons.records) {
      const pName = (p.get('name') || '').toLowerCase();
      const pCn = (p.get('cn') || '').toLowerCase();
      // Match: lab name contains person name or vice versa
      if (pName.length > 2 && (labName.includes(pName) || pName.includes(labName.split(' ')[0]))) {
        await s.run(
          `MATCH (p:Person {uuid: $p}), (l:Lab {uuid: $l})
           MERGE (p)-[:MEMBER_OF {role:'pi', confidence:0.9, source:'seed_match'}]->(l)`,
          { p: p.get('uuid'), l: labUuid }
        ).catch(() => {});
        linked++;
      }
    }
  }
  console.log(`PI-Lab links created: ${linked}`);

  // Stats
  const stats = await s.run(
    `MATCH (n:Person) RETURN count(n) AS c UNION ALL
     MATCH (n:Lab) RETURN count(n) UNION ALL
     MATCH (n:University) RETURN count(n) UNION ALL
     MATCH (n:Equipment) RETURN count(n) UNION ALL
     MATCH (n:Paper) RETURN count(n) UNION ALL
     MATCH ()-[r]->() RETURN count(r)`
  );
  const labels = ['Persons','Labs','Universities','Equipment','Papers','Relations'];
  stats.records.forEach((r, i) => console.log(`${labels[i]}: ${r.get('c')}`));

  await s.close();
  driver.close();
  console.log('\nDone! Refresh http://localhost:3002/search');
}

main().catch(e => { console.error(e.message); driver.close(); });
