// TEST ONLY. Actual I1/I2/I3/I5a worker; synthetic outbound API and delivery bytes.
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {lstat,realpath} from 'node:fs/promises';
import {assertOwnedPool} from './fixture-driver.js';
import {createJobs} from '../../web/jobs.js';
import {workerConfig} from '../worker.js';
import {runReplicateClaim} from '../../web/replicate-generation.js';
import {prepareArtifacts} from '../../web/generation.js';
import {workerEnv,mockBoundary} from '../../tests/replicate-generation-fixtures.js';
import {REPLICATE_MODEL,REPLICATE_VERSION} from '../../web/replicate.js';

export function assertHostedFixture(config) {
  if(config?.runtime!=='test'||config.providerMode!=='fixture'||config.origin!=='https://n8-ui.test'||
    !/^\/tmp\/n8-ui-[a-f0-9]{24}$/.test(config.storageDir??'')||
    config.platformDailyLimit!==200||config.accountDailyLimit!==20)
    throw new Error('owned_hosted_test_fixture_required');
}
// A bounded response gate, not a sleep. Always release/cancel in the caller's finally.
export function responseGate(timeoutMs=15000) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000)throw new Error('fixture_gate_bound_required');
  let enter,denyEnter,release,timer;
  const entered=new Promise((resolve,reject)=>{enter=resolve;denyEnter=reject;});
  const blocked=new Promise((resolve,reject)=>{
    release=()=>{clearTimeout(timer);resolve();};
    timer=setTimeout(()=>{const e=new Error('fixture_response_gate_expired');denyEnter(e);reject(e);},timeoutMs);
  });
  // A gate can expire before a worker reaches it; retain rejection for wait().
  blocked.catch(()=>{});entered.catch(()=>{});
  return {entered,async wait(){enter();await blocked;},release};
}
export function hostedBoundary(bytes,{gate,afterSend=async()=>{}}={}) {
  const prediction='ui_'+randomUUID().replaceAll('-','');
  const api=mockBoundary(async(options,body,index)=>{
    if(options.method==='POST'){await afterSend();await gate?.wait();}
    return {json:{id:prediction,model:REPLICATE_MODEL,version:REPLICATE_VERSION,
      status:index===1?'starting':'succeeded',
      output:['https://replicate.delivery/depth','https://replicate.delivery/output']}};
  });
  const delivery=mockBoundary(async options=>({bytes:options.path==='/depth'?bytes.depth:bytes.generated}),{mime:'image/png'});
  return {options:{transportOptions:{request:api.request,sleep:async()=>{}},
    mediaOptions:{request:delivery.request,resolveAddresses:async()=>[{address:'8.8.8.8',family:4}]}},
    counts:()=>({api:api.calls.length,post:api.calls.filter(c=>c.method==='POST').length,
      get:api.calls.filter(c=>c.method==='GET').length,delivery:delivery.calls.length})};
}
export async function createHostedFixture(pool,config) {
  assertHostedFixture(config);assertOwnedPool(pool);
  const schema=process.env.UI_SCHEMA;
  if(!/^n8_ui_[a-f0-9]{24}$/.test(schema??'')||
    (await pool.query('SELECT current_schema() AS schema')).rows[0]?.schema!==schema)
    throw new Error('owned_hosted_schema_required');
  const storage=await lstat(config.storageDir);
  if(!storage.isDirectory()||storage.isSymbolicLink()||storage.mode&0o077||
    await realpath(config.storageDir)!==config.storageDir)throw new Error('owned_private_storage_required');
  const budget=randomUUID();
  const env=workerEnv(config.storageDir,budget,{DATABASE_URL:process.env.DATABASE_URL,
    APP_ORIGIN:config.origin,PROVIDER_MODE:'fixture',WORKER_SOURCE_REVISION:'1182b04232294275d7d7adb2eb0ed81bb7b53d10'});
  const worker=await workerConfig(env);
  // Trusted local software envelope only. No production provisioning/API path.
  await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,
    authorization_sha,privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,
    window_start,window_end,ceiling_microusd,per_create_ceiling_microusd)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()-interval '1 hour',
      clock_timestamp()+interval '1 hour',12000000,300000)`,
    [budget,randomUUID(),...['model','version','contract_sha','authorization_sha','privacy_acceptance_sha',
      'license_acceptance_sha','safety_acceptance_sha','billing_acceptance_sha'].map(k=>worker.replicate[k])]);
  await prepareArtifacts(config.storageDir);
  const bytes={depth:await sharp({create:{width:512,height:512,channels:3,background:'#777'}}).png().toBuffer(),
    generated:await sharp({create:{width:512,height:512,channels:3,background:'#acf'}}).png().toBuffer()};
  return {async start(jobId,{gate,afterSend,beforeRun=async()=>{},envPatch={}}={}) {
    const boundary=hostedBoundary(bytes,{gate,afterSend}),abort=new AbortController();
    let claim;
    // Install the mock before validation. Even config failure has a literal zero-call receipt.
    const done=(async()=>{
      const c=await workerConfig({...env,...envPatch});
      const jobs=createJobs(pool,c);claim=await jobs.claim();
      if(!claim||claim.job_id!==jobId)throw new Error('fixture_target_claim_required');
      await beforeRun(claim);
      return runReplicateClaim(pool,jobs,c,claim,{...boundary.options,signal:abort.signal});
    })().then(completed=>({completed,error:null}),error=>({completed:false,error:error.message}));
    return {done,counts:boundary.counts,get claim(){return claim;},cancel(){abort.abort();gate?.release();}};
  }};
}
