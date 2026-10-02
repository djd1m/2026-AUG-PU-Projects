import { mkdir, lstat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readConfig } from '../web/config.js';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { UUID } from '../web/boundaries.js';
import { prepareStorage, sweepOrphans } from '../web/media.js';

// Output storage is disjoint from upload UUIDs: the F01 sweep only knows upload rows.
export async function prepareOutputStorage(dir) {
  const root=join(dir,'outputs'); await mkdir(root,{recursive:true,mode:0o700});
  const stat=await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid output storage');
  return root;
}
export async function cleanupDeleted(pool,dir,{limit=100}={}) {
  if (!Number.isSafeInteger(limit) || limit<1 || limit>1000) throw new Error('Invalid cleanup limit');
  const rows=(await pool.query(`SELECT id,private_key AS key,'upload' AS type,cleanup_attempted_at FROM upload
    WHERE deleted_at IS NOT NULL AND files_cleaned_at IS NULL
    UNION ALL SELECT id,output_key AS key,'output' AS type,cleanup_attempted_at FROM job
    WHERE deleted_at IS NOT NULL AND output_key IS NOT NULL AND files_cleaned_at IS NULL
    ORDER BY cleanup_attempted_at NULLS FIRST,id LIMIT $1`,[limit])).rows;
  let removed=0;
  for (const row of rows) {
    if (!UUID.test(row.key)) throw new Error('Invalid cleanup key');
    const path=row.type==='output'?join(dir,'outputs',row.key):join(dir,row.key);
    const table=row.type==='output'?'job':'upload'; // Closed internal enum, never request data.
    let cleaned=false;
    try { await unlink(path); removed++; cleaned=true; }
    catch(error) { if (error.code==='ENOENT') cleaned=true; else console.error('media_cleanup_pending'); }
    const sql=table==='job'?'UPDATE job SET cleanup_attempted_at=clock_timestamp(),files_cleaned_at=CASE WHEN $2 THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND deleted_at IS NOT NULL':
      'UPDATE upload SET cleanup_attempted_at=clock_timestamp(),files_cleaned_at=CASE WHEN $2 THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND deleted_at IS NOT NULL';
    await pool.query(sql,[row.id,cleaned]);
  }
  return removed;
}
export async function sweepOutputs(pool,dir,now=Date.now(),options={}) {
  await prepareOutputStorage(dir);
  return sweepOrphans(pool,dir,now,{...options,kind:'output'});
}
export async function maintenancePass(pool,config) {
  const jobs=createJobs(pool,config); await jobs.maintenance({limit:1000});
  await cleanupDeleted(pool,config.storageDir);
  const now=(await pool.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime();
  await sweepOrphans(pool,config.storageDir,now);
  await sweepOutputs(pool,config.storageDir,now);
}
async function main() {
  const config=readConfig(); const pool=createPool(config.databaseUrl);
  let stopping=false; for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{stopping=true;});
  try {
    await prepareStorage(config.storageDir); await prepareOutputStorage(config.storageDir);
    do {
      try { await maintenancePass(pool,config); }
      catch { console.error('maintenance_pass_failed'); if (process.argv.includes('--once')) throw new Error('Maintenance failed'); }
      if (process.argv.includes('--once') || stopping) break;
      await new Promise(resolve=>setTimeout(resolve,10000));
    } while(!stopping);
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(()=>{console.error('maintenance_failed');process.exitCode=1;});
}
