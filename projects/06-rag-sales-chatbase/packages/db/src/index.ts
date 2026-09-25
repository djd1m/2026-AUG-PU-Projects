// из N5: projects/05-podcast-clips-opus/packages/db/src/index.ts — пул вынесен в pool.ts; quota/attempts придут с фичами quota-and-spend и index-job-core
export { Pool } from 'pg';
export type { PoolClient } from 'pg';
export { createPool } from './pool.js';
