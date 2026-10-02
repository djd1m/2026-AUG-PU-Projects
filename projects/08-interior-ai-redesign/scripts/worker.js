import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readConfig } from '../web/config.js';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { prepareStorage } from '../web/media.js';
import { boundedRead, Engine, prepareArtifacts, runClaim, sha } from '../web/generation.js';
import { maintenancePass } from './maintenance.js';

export async function workerConfig(env=process.env) {
  const config=readConfig({...env,WORKER_MODE:'disabled'});
  if(!['fixture','controlnet'].includes(env.WORKER_MODE)||
    (env.NODE_ENV==='production'&&env.WORKER_MODE==='fixture'))throw new Error('worker_mode_denied');
  if(!/^[a-f0-9]{40,64}$/.test(env.WORKER_SOURCE_REVISION??''))throw new Error('worker_source_revision_required');
  if(!/^(0|[1-9][0-9]{0,9})$/.test(env.WORKER_SEED??'')||Number(env.WORKER_SEED)>=2**32)throw new Error('worker_seed_required');
  let manifestSha=sha('synthetic fixture; no model'),modelRevisions={sd:'synthetic-fixture',controlnet:'synthetic-fixture',depth:'synthetic-fixture'};
  if(env.WORKER_MODE==='controlnet') {
    if(!env.MODEL_ROOT?.startsWith('/'))throw new Error('offline_model_root_required');
    const raw=await boundedRead(resolve(env.MODEL_ROOT,'manifest.json'),1024*1024);const manifest=JSON.parse(raw);
    if(manifest.version!==1)throw new Error('offline_manifest_required');
    modelRevisions=Object.fromEntries(['sd','controlnet','depth'].map(role=>[role,manifest.models?.[role]?.revision]));
    if(Object.values(modelRevisions).some(v=>!/^[a-f0-9]{40}$/.test(v??'')))throw new Error('immutable_model_revisions_required');
    manifestSha=sha(raw);
  }
  return {...config,workerMode:env.WORKER_MODE,sourceRevision:env.WORKER_SOURCE_REVISION,seed:Number(env.WORKER_SEED),manifestSha,modelRevisions};
}
async function main() {
  const config=await workerConfig();const pool=createPool(config.databaseUrl);const jobs=createJobs(pool,config);
  const engine=new Engine(process.env.WORKER_PYTHON??'python3',[fileURLToPath(new URL('../worker/engine.py',import.meta.url))]);
  const abort=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>abort.abort());
  try {
    await prepareStorage(config.storageDir);await prepareArtifacts(config.storageDir);
    do {
      await maintenancePass(pool,config);
      const claim=await jobs.claim();
      if(claim) {
        try{await runClaim(pool,jobs,engine,config,claim,{signal:abort.signal});console.log('worker_job_completed');}
        catch(e){console.error(/^[a-z0-9_]{1,100}$/.test(e.message)?e.message:'worker_job_failed');if(process.argv.includes('--once'))throw e;}
      }
      if(process.argv.includes('--once')||abort.signal.aborted)break;
      await new Promise(resolve=>{const timer=setTimeout(done,1000);function done(){clearTimeout(timer);abort.signal.removeEventListener('abort',done);resolve();}abort.signal.addEventListener('abort',done,{once:true});});
    }while(!abort.signal.aborted);
  }finally{await engine.stop();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(/^[a-z0-9_]{1,100}$/.test(e.message)?e.message:'worker_start_failed');process.exitCode=1;});
