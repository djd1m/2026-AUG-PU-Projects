import {randomUUID} from 'node:crypto';
import {writeFile,rename,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createPool} from '@n8/db/pool';
import {checkReady} from '../../web/src/server/health.js';
import {PgJobs} from '@n8/db/design';
import {prepareAssetDirectory} from '@n8/adapters/assets';
import {cleanupAssets} from '@n8/adapters/cleanup';
import {createOpenRouter} from '@n8/adapters/openrouter';
import {loadConfig} from '../../web/src/server/config.js';
import {runOneJob} from './jobs.js';
import {sweepJobs} from './watchdog.js';
import {runMaintenance} from './runtime.js';
async function main(){
 const config=loadConfig();const pool=createPool(config.databaseUrl);
 const heartbeat=join(dirname(config.assetDir),'worker-heartbeat.json'),temporary=heartbeat+'.tmp';
 const workerId=randomUUID();let stopping=false,lastMaintenance=0,lastCleanup=0,runtimeHealthy=true;
 const stop=()=>{stopping=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 const writeHeartbeat=async(state:'ready'|'failed')=>{await writeFile(temporary,JSON.stringify({at:Date.now(),state}),{mode:0o600});await rename(temporary,heartbeat);};
 try{
  await prepareAssetDirectory(config.assetDir);if(!await checkReady({pool,config}))throw new Error('RUNTIME_NOT_READY');
  const jobs=new PgJobs(pool,config),provider=config.aiLive?createOpenRouter(config.aiLive):null;
  console.log('N8_WORKER_READY');
  while(!stopping){
   const now=Date.now();
   if(now-lastMaintenance>=10_000){runtimeHealthy=await runMaintenance([
    {name:'readiness',run:async()=>{if(!await checkReady({pool,config}))throw new Error('RUNTIME_NOT_READY');}},
    {name:'jobs',run:()=>sweepJobs({jobs})},
    ...(now-lastCleanup>=60_000?[{name:'assets',run:async()=>{await cleanupAssets(pool,config.assetDir);lastCleanup=now;}}]:[])
   ],name=>console.error('N8_WORKER_STEP_FAILED',name));lastMaintenance=now;}
   if(!runtimeHealthy){await writeHeartbeat('failed');await delay(1000);continue;}
   const worked=await runOneJob({jobs,provider,workerId});await writeHeartbeat('ready');
   if(!worked)await delay(1000);
  }
 }finally{await unlink(heartbeat).catch(()=>{});await unlink(temporary).catch(()=>{});await pool.end();}
}
main().catch(()=>{console.error('N8_WORKER_START_OR_LOOP_FAILED');process.exitCode=1;});
