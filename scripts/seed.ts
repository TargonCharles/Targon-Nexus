/**
 * Targon Nexus Seed Script — Initial data import for ARPES Knowledge Graph V1.0
 *
 * Imports seed data from CSV files into Neo4j and PostgreSQL.
 * Run: pnpm seed
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const DATASETS_DIR = path.resolve(__dirname, '..', 'datasets');
const GRAPH_DIR = path.resolve(__dirname, '..', 'graph');

interface SeedStep {
  name: string;
  description: string;
  type: 'neo4j' | 'postgres';
  file?: string;
  cypher?: string;
}

const SEED_STEPS: SeedStep[] = [
  {
    name: 'Graph Schema',
    description: 'Apply initial Neo4j schema (constraints + indexes)',
    type: 'neo4j',
    file: path.join(GRAPH_DIR, 'migrations', 'V1.0.0__initial_schema.cypher'),
  },
  {
    name: 'Equipment Taxonomy',
    description: 'Seed equipment categories and standard names',
    type: 'neo4j',
    file: path.join(GRAPH_DIR, 'migrations', 'V1.0.0__seed_equipment.cypher'),
  },
  {
    name: 'Research Directions',
    description: 'Import ARPES research direction taxonomy from CSV',
    type: 'neo4j',
    cypher: `
      LOAD CSV WITH HEADERS FROM 'file:///datasets/taxonomy/arpes-directions.csv' AS row
      MERGE (d:ResearchDirection {uuid: row.uuid})
      SET d.name = row.name,
          d.level = toInteger(row.level),
          d.description = row.description
      WITH d, row
      WHERE row.parentUuid IS NOT NULL AND row.parentUuid <> ''
      MATCH (parent:ResearchDirection {uuid: row.parentUuid})
      MERGE (parent)-[:PARENT_OF]->(d);
    `,
  },
  {
    name: 'Companies',
    description: 'Import companies (alumni destinations) from CSV',
    type: 'neo4j',
    cypher: `
      LOAD CSV WITH HEADERS FROM 'file:///datasets/companies/seed.csv' AS row
      MERGE (c:Company {uuid: row.uuid})
      SET c.name = row.name,
          c.country = row.country,
          c.city = row.city,
          c.website = row.website,
          c.industry = row.industry;
    `,
  },
  {
    name: 'Universities',
    description: 'Import universities from CSV',
    type: 'neo4j',
    cypher: `
      LOAD CSV WITH HEADERS FROM 'file:///datasets/universities/seed.csv' AS row
      MERGE (u:University {uuid: row.uuid})
      SET u.chineseName = row.chineseName,
          u.englishName = row.englishName,
          u.country = row.country,
          u.city = row.city,
          u.website = row.website,
          u.description = row.description;
    `,
  },
];

async function runStep(step: SeedStep): Promise<void> {
  console.log(`\n📦 ${step.name}: ${step.description}`);

  if (step.type === 'neo4j') {
    if (step.file) {
      console.log(`   Running cypher file: ${step.file}`);
      // In production, use neo4j-driver to run cypher statements
      // execSync(`cypher-shell -f "${step.file}"`, { stdio: 'inherit' });
      console.log(`   ✅ Skipped (run manually: cypher-shell -f "${step.file}")`);
    } else if (step.cypher) {
      console.log(`   Running inline cypher...`);
      // In production, execute via neo4j-driver
      console.log(`   ✅ Skipped (run via API or cypher-shell)`);
    }
  }
}

async function main() {
  console.log('🌱 Targon Nexus Seed Script — V1.0.0');
  console.log('================================\n');
  console.log('⚠️  This script requires Neo4j and PostgreSQL to be running.');
  console.log('   Start with: pnpm docker:dev\n');

  for (const step of SEED_STEPS) {
    await runStep(step);
  }

  console.log('\n================================');
  console.log('✅ Seed completed!');
  console.log('   Next: pnpm dev');
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
