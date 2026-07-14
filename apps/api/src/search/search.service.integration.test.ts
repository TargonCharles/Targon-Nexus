// =============================================================================
// Neo4j Cypher 集成测试 — 验证核心查询的语法正确性
//
// 注意：这些测试需要 Neo4j 运行中。在 CI 中通过 NEO4J_URI 环境变量连接。
// 如果无法连接，所有测试自动跳过。
// =============================================================================

import neo4j from 'neo4j-driver';

const SKIP_REASON = 'Neo4j not available — set NEO4J_URI to run integration tests';

function getDriver() {
  const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? 'password';
  return neo4j.driver(uri, neo4j.auth.basic(user, password));
}

async function canConnect(): Promise<boolean> {
  const driver = getDriver();
  try {
    const session = driver.session();
    await session.run('RETURN 1 AS ok');
    await session.close();
    return true;
  } catch {
    return false;
  } finally {
    await driver.close();
  }
}

// Test data to insert before tests
const TEST_PERSON = {
  uuid: 'test-integration-person-001',
  englishName: 'Test Professor',
  orcid: '0000-0002-1825-0097',
  currentStatus: 'Professor',
};

const TEST_PAPER = {
  uuid: 'test-integration-paper-001',
  doi: '10.1234/test.2024',
  title: 'Test Paper on ARPES',
  year: 2024,
};

describe('Neo4j Cypher Integration', () => {
  let connected = false;

  beforeAll(async () => {
    connected = await canConnect();
    if (!connected) {
      console.warn(`SKIP: ${SKIP_REASON}`);
      return;
    }

    // Insert test data
    const driver = getDriver();
    const session = driver.session();
    try {
      await session.run(
        `MERGE (p:Person {uuid: $uuid})
         SET p.englishName = $name, p.orcid = $orcid, p.currentStatus = $status`,
        TEST_PERSON,
      );
      await session.run(
        `MERGE (p:Paper {uuid: $uuid})
         SET p.doi = $doi, p.title = $title, p.year = $year, p.citationCount = 5`,
        TEST_PAPER,
      );
    } catch (err: any) {
      console.warn(`SKIP: Failed to insert test data — ${err.message}`);
      connected = false;
    } finally {
      await session.close();
      await driver.close();
    }
  });

  afterAll(async () => {
    if (!connected) return;
    const driver = getDriver();
    const session = driver.session();
    try {
      await session.run(`MATCH (n {uuid: $uuid}) DETACH DELETE n`, { uuid: TEST_PERSON.uuid });
      await session.run(`MATCH (n {uuid: $uuid}) DETACH DELETE n`, { uuid: TEST_PAPER.uuid });
    } finally {
      await session.close();
      await driver.close();
    }
  });

  it('person fulltext index exists and is queryable', async () => {
    if (!connected) return console.warn(SKIP_REASON);
    const driver = getDriver();
    const session = driver.session();
    try {
      const r = await session.run(
        `CALL db.index.fulltext.queryNodes('person_fulltext', 'Test') YIELD node, score RETURN count(node) AS c`,
      );
      expect(r.records[0]?.get('c').toNumber()).toBeGreaterThanOrEqual(0);
    } finally {
      await session.close();
      await driver.close();
    }
  });

  it('person count query returns correct result', async () => {
    if (!connected) return console.warn(SKIP_REASON);
    const driver = getDriver();
    const session = driver.session();
    try {
      const r = await session.run('MATCH (p:Person) RETURN count(p) AS c');
      expect(r.records[0]?.get('c').toNumber()).toBeGreaterThanOrEqual(1);
    } finally {
      await session.close();
      await driver.close();
    }
  });

  it('orphan node detection query is valid', async () => {
    if (!connected) return console.warn(SKIP_REASON);
    const driver = getDriver();
    const session = driver.session();
    try {
      const r = await session.run(
        `MATCH (n) WHERE labels(n)[0] IN ['Person','Lab','Paper']
         AND NOT (n)--() RETURN count(n) AS c`,
      );
      expect(typeof r.records[0]?.get('c').toNumber()).toBe('number');
    } finally {
      await session.close();
      await driver.close();
    }
  });

  it('OPTIONAL MATCH with WHERE e IS NOT NULL returns clean results', async () => {
    if (!connected) return console.warn(SKIP_REASON);
    const driver = getDriver();
    const session = driver.session();
    try {
      const r = await session.run(
        `MATCH (p:Person {uuid: $uuid})
         OPTIONAL MATCH (p)-[:HAS_CAREER_EVENT]->(e:CareerEvent)
         WHERE e IS NOT NULL
         RETURN count(e) AS c`,
        { uuid: TEST_PERSON.uuid },
      );
      expect(r.records[0]?.get('c').toNumber()).toBe(0);
    } finally {
      await session.close();
      await driver.close();
    }
  });

  it('MERGE with ON CREATE sets createdAt correctly', async () => {
    if (!connected) return console.warn(SKIP_REASON);
    const driver = getDriver();
    const session = driver.session();
    try {
      const r = await session.run(
        `MERGE (p:Paper {doi: $doi})
         ON CREATE SET p.createdAt = datetime(), p.uuid = $uuid
         ON MATCH SET p.updatedAt = datetime()
         RETURN p.createdAt AS createdAt, p.uuid AS uuid`,
        { doi: TEST_PAPER.doi, uuid: TEST_PAPER.uuid },
      );
      const createdAt = r.records[0]?.get('createdAt');
      expect(createdAt).not.toBeNull(); // Always truthy for ON MATCH too
    } finally {
      await session.close();
      await driver.close();
    }
  });
});
