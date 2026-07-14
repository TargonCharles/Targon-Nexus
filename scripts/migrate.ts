#!/usr/bin/env npx ts-node
// ---------------------------------------------------------------------------
// ARP Migration Runner
// ---------------------------------------------------------------------------
// Runs Prisma (PostgreSQL) and Cypher (Neo4j) migrations in order.
//
// Usage:
//   npx ts-node scripts/migrate.ts [--prisma] [--cypher] [--dry-run]
//
// Default: runs both Prisma and Cypher migrations.
// ---------------------------------------------------------------------------

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import neo4j from 'neo4j-driver';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const ROOT = resolve(__dirname, '..');
const CYPHER_DIR = join(ROOT, 'graph', 'migrations');
const PRISMA_DIR = join(ROOT, 'apps', 'api', 'prisma');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const runPrisma = !args.includes('--cypher') || args.includes('--prisma');
const runCypher = !args.includes('--prisma') || args.includes('--cypher');

// ---------------------------------------------------------------------------
// Prisma migrations (PostgreSQL)
// ---------------------------------------------------------------------------
function migratePrisma(): void {
  console.log('\n📦 Running Prisma migrations (PostgreSQL)...\n');

  const schemaPath = join(PRISMA_DIR, 'schema.prisma');
  if (!existsSync(schemaPath)) {
    console.warn('⚠ No Prisma schema found — skipping.');
    return;
  }

  if (dryRun) {
    const migrations = readdirSync(join(PRISMA_DIR, 'migrations'), {
      withFileTypes: true,
    });
    console.log(
      `Dry run: would apply ${migrations.filter((d) => d.isDirectory()).length} Prisma migrations`,
    );
    return;
  }

  execSync('npx prisma migrate deploy', {
    cwd: join(ROOT, 'apps', 'api'),
    stdio: 'inherit',
  });

  console.log('✅ Prisma migrations applied.');
}

// ---------------------------------------------------------------------------
// Cypher migrations (Neo4j)
// ---------------------------------------------------------------------------
async function migrateCypher(): Promise<void> {
  console.log('\n📊 Running Cypher migrations (Neo4j)...\n');

  const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? 'password';

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 5,
  });

  try {
    // Ensure migration tracking node exists
    const session = driver.session();

    try {
      await session.run(`
        MERGE (m:MigrationTracker {id: 'cypher'})
        ON CREATE SET m.appliedVersions = [], m.lastAppliedAt = datetime()
      `);

      // Get already-applied versions
      const result = await session.run(
        `MATCH (m:MigrationTracker {id: 'cypher'}) RETURN m.appliedVersions AS versions`,
      );
      const applied: string[] =
        result.records[0]?.get('versions') ?? [];

      // Discover migration files
      const files = readdirSync(CYPHER_DIR)
        .filter((f) => f.endsWith('.cypher'))
        .sort();

      const pending = files.filter((f) => !applied.includes(f));

      if (pending.length === 0) {
        console.log('No pending Cypher migrations.');
        return;
      }

      console.log(`Found ${pending.length} pending migration(s):`);
      pending.forEach((f) => console.log(`  - ${f}`));
      console.log();

      if (dryRun) {
        console.log('Dry run — skipping execution.');
        return;
      }

      // Apply pending migrations in order
      for (const file of pending) {
        const path = join(CYPHER_DIR, file);
        const cypher = readFileSync(path, 'utf-8');
        const statements = cypher
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('//'));

        console.log(`Applying ${file}...`);

        for (const stmt of statements) {
          try {
            await session.run(stmt);
          } catch (err: any) {
            console.error(`  Failed at: ${stmt.substring(0, 80)}...`);
            throw err;
          }
        }

        // Record applied version
        await session.run(
          `
          MATCH (m:MigrationTracker {id: 'cypher'})
          SET m.appliedVersions = m.appliedVersions + $version,
              m.lastAppliedAt = datetime()
          `,
          { version: file },
        );

        console.log(`  ✅ ${file} applied.`);
      }
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }

  console.log('✅ Cypher migrations applied.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('═'.repeat(60));
  console.log('ARP Migration Runner');
  if (dryRun) console.log('(DRY RUN — no changes will be applied)');
  console.log('═'.repeat(60));

  try {
    if (runPrisma) await migratePrisma();
    if (runCypher) await migrateCypher();
    console.log('\n🎉 All migrations complete.\n');
  } catch (err: any) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  }
}

main();
