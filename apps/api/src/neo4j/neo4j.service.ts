import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Session, Record as Neo4jRecord, types } from 'neo4j-driver';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;
  private readonly logger = new Logger(Neo4jService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const uri = this.configService.get<string>('NEO4J_URI', 'bolt://localhost:7687');
    const user = this.configService.get<string>('NEO4J_USER', 'neo4j');
    const password = this.configService.get<string>('NEO4J_PASSWORD', 'password');

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionLifetime: 30 * 60 * 1000,
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 10000,
    });

    await this.verifyConnection();
    this.logger.log(`Connected to Neo4j at ${uri}`);
  }

  async onModuleDestroy() {
    await this.driver?.close();
    this.logger.log('Neo4j connection closed');
  }

  private async verifyConnection() {
    const session = this.driver.session();
    try {
      await session.run('RETURN 1');
    } finally {
      await session.close();
    }
  }

  /** Execute a read query and return mapped records */
  async read<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    const session = this.driver.session({ defaultAccessMode: 'READ' });
    try {
      const result = await session.run(cypher, this.sanitizeParams(params));
      return result.records.map((record) => this.recordToObject(record)) as unknown as T[];
    } finally {
      await session.close();
    }
  }

  /** Execute a write query */
  async write(cypher: string, params?: Record<string, unknown>): Promise<Neo4jRecord[]> {
    const session = this.driver.session({ defaultAccessMode: 'WRITE' });
    try {
      const result = await session.run(cypher, this.sanitizeParams(params));
      return result.records;
    } finally {
      await session.close();
    }
  }

  /** Execute a single read query returning one record or null */
  async readOne<T = Record<string, unknown>>(
    cypher: string,
    params?: Record<string, unknown>,
  ): Promise<T | null> {
    const results = await this.read<T>(cypher, params);
    return results[0] ?? null;
  }

  /** Convert a Neo4j Record to a plain object */
  private recordToObject(record: Neo4jRecord): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const key of record.keys) {
      const k = String(key);
      const value = record.get(k);
      obj[k] = this.unwrapNeo4jValue(value);
    }
    return obj;
  }

  /** Unwrap Neo4j Node/Relationship objects to plain JS */
  private unwrapNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;

    // Handle Neo4j Node — use proper instanceof check
    if (value instanceof types.Node) {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(value.properties)) {
        props[pk] = this.unwrapNeo4jValue(pv);
      }
      return props;
    }

    // Handle Neo4j Relationship — use proper instanceof check
    if (value instanceof types.Relationship) {
      return {
        type: value.type,
        ...value.properties,
      };
    }

    // Handle Neo4j Integer
    if (neo4j.isInt(value)) {
      return (value as unknown as { toNumber(): number }).toNumber();
    }

    // Handle arrays (may contain nested Nodes/Relationships)
    if (Array.isArray(value)) {
      return value.map((v) => this.unwrapNeo4jValue(v));
    }

    // Plain value — return as-is
    return value;
  }

  /** Convert JS numbers to Neo4j integers to avoid LIMIT type errors */
  private sanitizeParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!params) return undefined;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number' && Number.isInteger(value)) {
        sanitized[key] = neo4j.int(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /** Check if driver is healthy */
  async healthCheck(): Promise<boolean> {
    try {
      await this.read('RETURN 1');
      return true;
    } catch {
      return false;
    }
  }
}
