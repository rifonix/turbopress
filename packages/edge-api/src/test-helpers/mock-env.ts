// In-memory test doubles for Cloudflare bindings with REAL SQL semantics:
// D1 is backed by node:sqlite (migrations 0001-0006 applied verbatim), KV is
// a Map, queues/R2 are recording stubs. This lets route tests exercise CHECK
// constraints and ON CONFLICT ownership clauses for real.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Env } from '../types/env.js';

class D1PreparedStatementShim {
  private params: unknown[] = [];
  constructor(
    private db: DatabaseSync,
    private sql: string
  ) {
    // node:sqlite compiles with DQS (double-quoted strings) disabled; D1
    // accepts them. Our SQL never uses double-quoted IDENTIFIERS, so
    // translating "literal" → 'literal' is lossless for this codebase.
    this.sql = sql.replace(/"([^"\n]+)"/g, "'$1'");
  }
  bind(...params: unknown[]) {
    this.params = params;
    return this;
  }
  async first<T = unknown>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.params as any)) as T | undefined;
    return row ?? null;
  }
  async all<T = unknown>(): Promise<{ results: T[] }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as any)) as T[];
    return { results: rows };
  }
  async run(): Promise<{ meta: { changes: number } }> {
    const info = this.db.prepare(this.sql).run(...(this.params as any));
    return { meta: { changes: Number(info.changes) } };
  }
}

class D1DatabaseShim {
  constructor(private db: DatabaseSync) {}
  prepare(sql: string) {
    return new D1PreparedStatementShim(this.db, sql);
  }
}

class KVNamespaceShim {
  private store = new Map<string, string>();
  async get(key: string, type?: string): Promise<unknown> {
    const v = this.store.get(key);
    if (v === undefined) return null;
    if (type === 'json') {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }
    return v;
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export function createTestEnv(overrides: Partial<Env> = {}): Env {
  const db = new DatabaseSync(':memory:');
  const migrationsDir = join(__dirname, '../../migrations');
  for (const file of readdirSync(migrationsDir).sort()) {
    if (file.endsWith('.sql')) {
      db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    }
  }

  const sent: unknown[] = [];
  const env = {
    DB: new D1DatabaseShim(db) as any,
    KV: new KVNamespaceShim() as any,
    OPTIMIZATION_QUEUE: {
      send: async (msg: unknown) => {
        sent.push(msg);
      },
    } as any,
    ASSETS_BUCKET: { put: async () => ({}), get: async () => null } as any,
    ENVIRONMENT: 'development',
    SAAS_APP_URL: 'https://app.wpinstant.dev',
    __db: db,
    __queueSent: sent,
    ...overrides,
  } as unknown as Env & { __db: DatabaseSync; __queueSent: unknown[] };
  return env;
}
