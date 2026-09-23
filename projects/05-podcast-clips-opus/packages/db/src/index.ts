import { Pool } from 'pg';
export { Pool } from 'pg';
export type { PoolClient } from 'pg';

export function createPool(databaseUrl: string, schema?: string): Pool {
  if (schema !== undefined && !/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Непригодная схема БД');
  return new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000, statement_timeout: 5000, application_name: schema ?? 'n5-foundation',
    ...(schema === undefined ? {} : { options: `-c search_path=${schema},public` }) });
}
export * from './quota.js';
export * from './attempts.js';
export * from './probe.js';
export * from './transcription.js';
export * from './selection.js';
export * from './render.js';
