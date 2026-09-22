import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const out = 'tests/artifacts/queue-and-probe/mutations'; mkdirSync(out,{recursive:true});
const cases = [
  ['fence','packages/db/src/attempts.ts','AND render_fence=$3 AND status=','AND status=','tests/queue-probe-guards.test.ts','ADR-001 source'],
  ['disk','apps/worker/src/media/download.ts','if (await available(directory) - reserved < required)','if (false)','tests/queue-probe.test.ts','ADR-006: no disk'],
  ['heartbeat','packages/db/src/probe.ts','SET updated_at=$3 WHERE id=$1 AND fence=$2','SET updated_at=updated_at WHERE id=$1 AND fence=$2','tests/queue-probe-guards.test.ts','deferred source'],
  ['retry-source','apps/web/src/server/video-retry.ts','!row.object_key || row.actual_bytes === null || BigInt(row.actual_bytes) <= 0n','false','tests/queue-probe.test.ts','RetryVideo rejects'],
];
const results=[];
for(const [name,file,from,to,test,pattern] of cases) {
  const source=readFileSync(file,'utf8'); if(!source.includes(from)) throw new Error(`Missing mutation target: ${name}`);
  const run=label=>{
    const r=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',test,'-t',pattern],{encoding:'utf8',timeout:60000});
    writeFileSync(`${out}/${name}-${label}.txt`,`${r.stdout ?? ''}${r.stderr ?? ''}`);
    return r.status;
  };
  let red;
  try { writeFileSync(file,source.replace(from,to)); red=run('red'); }
  finally { writeFileSync(file,source); }
  const green=run('green'); results.push({name,red,green,layer:name==='fence'||name==='heartbeat'?'source guard; PostgreSQL mutation not run':'unit behavior'});
  if(red!==1 || green!==0) process.exitCode=1;
}
writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2)+'\n'); console.log(JSON.stringify(results,null,2));
