import { Pool } from 'pg';
export { Pool } from 'pg';
export type { PoolClient } from 'pg';

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000, statement_timeout: 5000, application_name: 'n5-foundation' });
}
export * from './quota.js';
export * from './attempts.js';
export * from './probe.js';
export * from './transcription.js';
export * from './selection.js';
