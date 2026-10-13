// Synthetic transport boundary and actual private bytes: software proof only.
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { workerConfig } from '../scripts/worker.js';
import { prepareArtifacts,sha } from '../web/generation.js';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA } from '../web/replicate.js';
sharp.concurrency(1);
export function workerEnv(dir,budget=randomUUID(),patch={}) {
  return {NODE_ENV:'test',SESSION_SECRET:'1234567890abcdef'.repeat(4),
    DATABASE_URL:'postgres://test:synthetic-only-complex-password-abc@db/test',APP_ORIGIN:'http://localhost',
    STORAGE_DIR:dir,PLATFORM_DAILY_LIMIT:'200',ACCOUNT_DAILY_LIMIT:'20',WORKER_MODE:'replicate',
    WORKER_SOURCE_REVISION:'9'.repeat(40),WORKER_SEED:'42',REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA,
    REPLICATE_API_TOKEN:'offline-synthetic-token',REPLICATE_SPEND_BUDGET_ID:budget,REPLICATE_AUTHORIZATION_SHA:'3'.repeat(64),
    REPLICATE_PRIVACY_ACCEPTANCE_SHA:'4'.repeat(64),REPLICATE_LICENSE_ACCEPTANCE_SHA:'5'.repeat(64),
    REPLICATE_SAFETY_ACCEPTANCE_SHA:'6'.repeat(64),REPLICATE_BILLING_ACCEPTANCE_SHA:'7'.repeat(64),...patch};
}
export async function privateFixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'n8-i4b-'));t.after(()=>rm(dir,{recursive:true,force:true}));await prepareArtifacts(dir);
  const source=await sharp({create:{width:128,height:64,channels:3,background:'#abc'}}).png().toBuffer();
  const upload={id:randomUUID(),account_id:randomUUID(),private_key:randomUUID(),sha256:sha(source),
    width:128,height:64,mime:'image/png',deleted_at:null};await writeFile(join(dir,upload.private_key),source,{mode:0o600});
  const depth=await sharp({create:{width:512,height:512,channels:3,background:'#777'}}).png().toBuffer();
  const generated=await sharp({create:{width:512,height:512,channels:3,background:'#acf'}}).png().toBuffer();
  return {dir,upload,source,depth,generated,config:await workerConfig(workerEnv(dir))};
}
export function mockBoundary(handler,{mime='application/json'}={}) {
  const calls=[];
  return {calls,request(options,respond) {
    calls.push({method:options.method,path:options.path});const req=new EventEmitter();let destroyed=false;
    req.destroy=()=>{destroyed=true;};req.setTimeout=()=>req;req.end=body=>queueMicrotask(async()=>{
      try {
        const action=await handler(options,body,calls.length);if(!action||action.hang||destroyed)return;
        if(action.error){req.emit('error',new Error('private payload must never escape'));return;}
        const res=new Readable({read(){}});res.statusCode=action.status??200;res.headers={'content-type':mime,...action.headers};
        respond(res);if(!res.destroyed){res.push(action.bytes??Buffer.from(JSON.stringify(action.json)));res.push(null);}
      }catch(error){req.emit('error',error);}
    });return req;
  }};
}
export function boundaries(f,hook=async()=>{},statuses=['starting','processing','succeeded']) {
  const api=mockBoundary(async(options,body,index)=>{
    await hook(options,body,index);return {json:{id:'prediction_1',model:REPLICATE_MODEL,version:REPLICATE_VERSION,
      status:statuses[Math.min(index-1,statuses.length-1)],output:['https://replicate.delivery/depth','https://replicate.delivery/output']}};
  });
  const downloads=mockBoundary(async options=>({bytes:options.path==='/depth'?f.depth:f.generated}),{mime:'image/png'});
  return {api,downloads,options:{transportOptions:{request:api.request,sleep:async()=>{}},
    mediaOptions:{request:downloads.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]}}};
}
