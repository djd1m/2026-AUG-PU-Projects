// из N5: projects/05-podcast-clips-opus/packages/db/src/index.ts — пул вынесен в pool.ts; attempts придут с фичей index-job-core; quota — фича quota-and-spend
export { Pool } from 'pg';
export type { PoolClient } from 'pg';
export { createPool } from './pool.js';
export * from './quota.js';
export * from './ceilings.js';
