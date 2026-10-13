import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runReplicateClaim } from '../web/replicate-generation.js';
import { workerConfig } from '../scripts/worker.js';
import { validateHostedOutput } from '../web/replicate-evidence.js';
import { prepareReplicateInput,getPrivateReplicateInput } from '../web/replicate-media.js';
import { hashReplicateRequest,REPLICATE_VERSION } from '../web/replicate.js';
import { replicateSettings } from '../web/replicate-worker-config.js';
import { privateFixture,boundaries,workerEnv,mockBoundary } from './replicate-generation-fixtures.js';
async function harness(t) {
  const f=await privateFixture(t),created=new Date(Date.now()-1000),consumed=new Date(Date.now()-500);
  const claim={job_id:randomUUID(),account_id:f.upload.account_id,fence:1,attempt:1,
    attempt_deadline:new Date(Date.now()+180000),hard_deadline:new Date(Date.now()+360000)};
  let submission=null,output=null,failed=0,authorizations=0,contexts=0,reference={referenced:false,winner:false};
  const ticket={id:randomUUID(),consumed_at:consumed};
  const authority={async workerContext(){contexts++;return {claim,input:f.upload,submission,style:'warm',
    job_created_at:created,consumed_ticket:ticket,db_now:new Date(),remaining_ms:claim.attempt_deadline-Date.now()};},
    async authorize(c,b){authorizations++;submission={...structuredClone(b),id:randomUUID(),job_id:c.job_id,provider:'replicate',
      state:'submitting',prediction_id:null,cleanup_state:'none',identity_conflict_at:null,attempt_number:1,
      attempt_ticket_id:ticket.id,submission_fence:1,attempt_deadline:claim.attempt_deadline,submitting_at:new Date()};
      return {authorized:true,code:'submission_authorized',submission};},
    async finalAuthorize(){return true;},async bindPrediction(id,body){submission={...submission,state:'known',prediction_id:body.prediction_id};
      return {recorded:true,submission_id:submission.id,prediction_id:submission.prediction_id,cleanup_required:false,completion_authorized:false};},
    async observe(id,body){submission={...submission,provider_status:body.status,observed_at:new Date()};return {status:body.status};},
    async markAmbiguous(){if(!submission.prediction_id)submission.state='ambiguous';}};
  const jobs={async heartbeat(){return true;},async complete(id,fence,value){validateHostedOutput(value);output=value;
    reference={referenced:true,winner:true};return true;},async fail(){failed++;return true;}};
  const pool={async query(){return {rows:[{status:reference.winner?'succeeded':'running',has_evidence:reference.winner,
    referenced:reference.referenced,output_key:output?.output_key}]};}};
  const b=boundaries(f),run=(extra={},config=f.config)=>runReplicateClaim(pool,jobs,config,claim,{...b.options,authority,...extra});
  async function known() {
    const input=await prepareReplicateInput({storageDir:f.dir,upload:f.upload,accountId:claim.account_id});
    const settings=replicateSettings(f.config,'warm'),candidate={version:REPLICATE_VERSION,
      input:{...settings,image:getPrivateReplicateInput(input).image}};
    await authority.authorize(claim,{...f.config.replicate,source_input_sha:input.source_input_sha,
      transmitted_input_sha:input.transmitted_input_sha,transform:input.transform,request_sha:hashReplicateRequest(candidate)});
    await authority.bindPrediction(claim.job_id,{prediction_id:'prediction_1'});authorizations=0;
  }
  return {...f,claim,ticket,authority,jobs,pool,b,run,known,get output(){return output;},get submission(){return submission;},
    get failed(){return failed;},get authorizations(){return authorizations;},get contexts(){return contexts;},
    setReference:value=>{reference=value;}};
}
const files=async h=>readdir(join(h.dir,'outputs'));
test('new create poll import: real files, closed evidence, durable queue and null metrics',async t=>{
  const h=await harness(t);assert.equal(await h.run(),true);
  assert.deepEqual(h.b.api.calls.map(c=>c.method),['POST','GET','GET']);assert.equal(h.authorizations,1);
  assert.equal(h.output.evidence.queue_ms,500);assert.ok(h.contexts>=3);
  assert.equal(h.output.evidence.attempt_started_at,h.ticket.consumed_at.toISOString());
  for(const k of ['hardware','warm','inference_ms','billing_actual_microusd'])assert.equal(h.output.evidence[k],null);
  assert.equal(Object.getOwnPropertyDescriptor(h.output,'cleanup'),undefined);assert.equal((await files(h)).length,1);assert.equal(h.failed,0);
  assert.ok(!(await readFile(join(h.dir,'configs',h.output.output_key),'utf8')).includes('data:image'));
});
test('known identity recovery reconstructs request and uses GET only',async t=>{
  const h=await harness(t);await h.known();const original=structuredClone(h.submission);
  assert.equal(await h.run(),true);assert.ok(h.b.api.calls.every(c=>c.method==='GET'));assert.equal(h.authorizations,0);
  assert.equal(h.output.evidence.request_sha,original.request_sha);assert.equal(h.output.evidence.submission_id,original.id);
});
test('changed recovery seed or request binding makes ZERO GET/POST',async t=>{
  for(const change of ['seed','request','transmitted','transform','settings'])await t.test(change,async t=>{
    const h=await harness(t);await h.known();let config=h.config;
    if(change==='seed')config=await workerConfig(workerEnv(h.dir,h.config.replicate.spend_budget_id,{WORKER_SEED:'43'}));
    if(change==='request'||change==='settings')h.submission.request_sha='8'.repeat(64);
    if(change==='transmitted')h.submission.transmitted_input_sha='8'.repeat(64);
    if(change==='transform')h.submission.transform.content_rect.x++;
    await assert.rejects(h.run({},config));
    assert.equal(h.b.api.calls.length,0,'changed reconstruction must refuse before any GET');assert.equal(h.authorizations,0);
  });
});
test('changed actual private bytes fail before any recovery GET',async t=>{
  const h=await harness(t);await h.known();await writeFile(join(h.dir,h.upload.private_key),Buffer.from('changed'));
  await assert.rejects(h.run());assert.equal(h.b.api.calls.length,0);
});
test('no-ID submitting and ambiguous never replay or authorize',async t=>{
  for(const state of ['submitting','ambiguous']) {const h=await harness(t);await h.known();h.submission.prediction_id=null;h.submission.state=state;
    await assert.rejects(h.run(),/submission_no_replay/);assert.equal(h.b.api.calls.length,0);assert.equal(h.authorizations,0);}
});
test('original consumed timestamp refreshed after authorization UTC replacement',async t=>{
  const h=await harness(t),authorize=h.authority.authorize;
  h.authority.authorize=async(...args)=>{h.ticket.consumed_at=new Date();h.ticket.id=randomUUID();return authorize(...args);};
  assert.equal(await h.run(),true);assert.equal(h.output.evidence.attempt_started_at,h.ticket.consumed_at.toISOString());
  assert.notEqual(h.output.evidence.queue_ms,500);
});
test('false or throw completion preserves referenced winner and never fails it',async t=>{
  for(const mode of ['false','throw'])await t.test(mode,async t=>{const h=await harness(t);
    h.jobs.complete=async()=>{h.setReference({referenced:true,winner:true});if(mode==='throw')throw new Error('uncertain commit');return false;};
    assert.equal(await h.run(),false);assert.equal((await files(h)).length,1);assert.equal(h.failed,0);});
});
test('unavailable DB after uncertain completion preserves files',async t=>{
  const h=await harness(t);h.jobs.complete=async()=>{throw new Error('uncertain commit');};h.pool.query=async()=>{throw new Error('DB down');};
  await assert.rejects(h.run(),/replicate_completion_uncertain/);assert.equal((await files(h)).length,1);assert.equal(h.failed,0);
});
test('definitely unreferenced rejection guards cleanup and fenced fail',async t=>{
  const h=await harness(t);h.jobs.complete=async()=>false;
  await assert.rejects(h.run(),/replicate_completion_denied/);assert.deepEqual(await files(h),[]);assert.equal(h.failed,1);
});
test('serialized lost heartbeat aborts provider and prevents attachment',async t=>{
  const h=await harness(t);let active=0,max=0;h.jobs.heartbeat=async()=>{active++;max=Math.max(max,active);
    await new Promise(r=>setTimeout(r,10));active--;return false;};
  const transportOptions={request:mockBoundary(async()=>({hang:true})).request,sleep:async()=>{}};
  await assert.rejects(h.run({transportOptions,heartbeatMs:5}),/lease_lost/);assert.equal(max,1);assert.equal(h.output,null);assert.equal(h.failed,1);
});
test('external abort and unknown errors expose safe fixed codes only',async t=>{
  const h=await harness(t),abort=new AbortController();abort.abort();
  await assert.rejects(h.run({signal:abort.signal}),e=>e.message==='provider_aborted'&&!e.cause);assert.equal(h.b.api.calls.length,0);
  h.authority.workerContext=async()=>{throw new Error('token/private URL');};await assert.rejects(h.run(),/replicate_worker_failed/);
});

test('invalid original DB remaining budget never sends or creates a replacement',async t=>{
  for(const remaining_ms of [0,180001,null]) {
    const h=await harness(t),context=h.authority.workerContext;
    h.authority.workerContext=async()=>({...await context(),remaining_ms});
    await assert.rejects(h.run(),/provider_deadline/);assert.equal(h.b.api.calls.length,0);assert.equal(h.authorizations,0);
  }
});
test('one monotonic original budget expires during GET with no import or new create',async t=>{
  const h=await harness(t);let time=0;const b=boundaries(h,async(options,body,index)=>{if(index===2)time=180001;});
  await assert.rejects(h.run({...b.options,now:()=>time}),/provider_deadline/);
  assert.deepEqual(b.api.calls.map(c=>c.method),['POST','GET']);assert.deepEqual(await files(h),[]);assert.equal(h.authorizations,1);
});

test('initial context transaction time reduces original budget',async t=>{
  const h=await harness(t),context=h.authority.workerContext;let time=0;
  h.authority.workerContext=async()=>{const value=await context();time=180001;return value;};
  await assert.rejects(h.run({now:()=>time}),/provider_deadline/);assert.equal(h.b.api.calls.length,0);
});
