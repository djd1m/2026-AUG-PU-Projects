import {readFile,lstat} from 'node:fs/promises';
import {z} from 'zod';
import {createPool} from '@n8/db/pool';
import {PgJobs} from '@n8/db/design';
import {loadConfig} from '../apps/web/src/server/config.js';
const schema=z.object({jobId:z.string().uuid(),expectedFence:z.number().int().min(1),expectedState:z.enum(['queued','running','succeeded','failed','uncertain']),evidenceId:z.string().trim().min(1).max(160),actualMicroUsd:z.number().int().min(0).max(100_000_000_000_000),outcome:z.enum(['succeeded','failed']).nullable(),scene:z.unknown().optional(),usage:z.record(z.unknown()).nullable().optional()}).strict();
async function main(){const file=process.argv[2];if(!file)throw new Error('EVIDENCE_FILE_REQUIRED');const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536)throw new Error('INVALID_EVIDENCE_FILE');const input=schema.parse(JSON.parse(await readFile(file,'utf8'))),config=loadConfig(),pool=createPool(config.databaseUrl);try{await new PgJobs(pool,config).reconcile(input);console.log('N8_JOB_RECONCILIATION_APPLIED');}finally{await pool.end();}}
main().catch(()=>{console.error('N8_JOB_RECONCILIATION_FAILED');process.exitCode=1;});
