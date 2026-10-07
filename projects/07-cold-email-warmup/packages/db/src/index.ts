import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { MIGRATIONS } from './migrations.ts';

type AnyClient = {
  query<T>(sql: string, args: unknown[]): Promise<{ rows: T[] }>;
  exec?(sql: string): Promise<unknown>;
};


export interface Db {
  rows<T>(sql: string, args?: unknown[]): Promise<T[]>;
  one<T>(sql: string, args?: unknown[]): Promise<T | null>;
  exec(sql: string, args?: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export interface Driver {
  db: Db;
  close(): Promise<void>;
  native: 'pg' | 'pglite';
}

const q2 = <T>(client: AnyClient, sql: string, args?: unknown[]) =>
  client.query<T>(sql, args && args.length > 0 ? args : undefined);

function clientDb(client: AnyClient, inTx = false): Db {
  return {
    async rows<T>(sql: string, args?: unknown[]) {
      const r = await q2<T>(client, sql, args);
      return r.rows;
    },
    async one<T>(sql: string, args?: unknown[]) {
      const r = await q2<T>(client, sql, args);
      return r.rows[0] ?? null;
    },
    async exec(sql: string, args?: unknown[]) {
      if (args && args.length > 0) {
        await q2(client, sql, args);
        return;
      }
      if (typeof client.exec === 'function') await client.exec(sql);
      else await q2(client, sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      if (inTx) return fn(clientDb(client, true));
      await q2(client, 'BEGIN');
      try {
        const out = await fn(clientDb(client, true));
        await q2(client, 'COMMIT');
        return out;
      } catch (e) {
        await q2(client, 'ROLLBACK');
        throw e;
      }
    },
  };
}

export async function openDb(env: NodeJS.ProcessEnv = process.env): Promise<Driver> {
  if (env.DATABASE_URL) {
    const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    return { db: clientDb(pool), close: () => pool.end(), native: 'pg' };
  }
  const dataDir = env.PGLITE_DATA_DIR ?? 'data/pg';
  const pgl = new PGlite(dataDir);
  return { db: clientDb(pgl), close: async () => { await pgl.close(); }, native: 'pglite' };
}

export async function migrate(driver: Driver): Promise<string[]> {
  await driver.db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set((await driver.db.rows<{ id: string }>('SELECT id FROM schema_migrations', [])).map((r) => r.id));
  const done: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await driver.db.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.exec('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
    });
    done.push(m.id);
  }
  return done;
}
