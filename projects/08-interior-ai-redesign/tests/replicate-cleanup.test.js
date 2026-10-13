import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplicateCleanup } from '../web/replicate-cleanup.js';
import { readReplicateCleanupConfig,replicateTransportConfig,replicateSettings,
  replicateCleanupEnabled } from '../web/replicate-worker-config.js';
import { workerConfig } from '../scripts/worker.js';
import { workerEnv } from './replicate-generation-fixtures.js';
import { cleanupConfig,cleanupEnv,memoryFixture,mockBoundary,prediction } from './replicate-cleanup-fixtures.js';
const run=(f,http,c=cleanupConfig())=>createReplicateCleanup(f.pool,c,{trustedClock:f.trustedClock,
  monotonicNow:f.monotonicNow,transportOptions:{request:http.request}}).pass();

test('standalone cleanup opt-in exact pins/private token; absent/false disabled; no create settings',async()=>{
  const common={runtime:'test'},env=cleanupEnv();
  for(const value of [undefined,'false']) {
    const c=readReplicateCleanupConfig(common,{...env,REPLICATE_CLEANUP_ENABLED:value});assert.equal(c,common);
    const f=memoryFixture(),http=mockBoundary(()=>({json:prediction()}));
    assert.equal((await run(f,http,c)).actions,0);assert.equal(f.queries.length,0);assert.equal(http.calls.length,0);
  }
  for(const key of Object.keys(env))assert.throws(()=>readReplicateCleanupConfig(common,{...env,[key]:'bad\n'}));
  for(const value of ['',true,'1','TRUE',null])assert.throws(()=>readReplicateCleanupConfig(common,{...env,REPLICATE_CLEANUP_ENABLED:value}));
  const c=cleanupConfig();assert.equal(replicateCleanupEnabled(c),true);assert.equal(replicateCleanupEnabled({...c}),false);
  assert.ok(!JSON.stringify(c).includes(env.REPLICATE_API_TOKEN));assert.ok(!JSON.stringify(replicateTransportConfig(c)).includes(env.REPLICATE_API_TOKEN));
  assert.throws(()=>replicateSettings(c,'warm'));assert.equal(c.seed,undefined);assert.equal(c.replicate,undefined);
  assert.equal(replicateCleanupEnabled(await workerConfig(workerEnv('/tmp/synthetic-cleanup'))),true);
  assert.throws(()=>createReplicateCleanup({},readReplicateCleanupConfig({runtime:'production'},env),{trustedClock:()=>new Date()}));
});

test('cancel request persisted before sole first action; next pass GET; canceled confirmation only',async()=>{
  const f=memoryFixture(),http=mockBoundary((o,b,i)=>{
    assert.ok(f.rows[0].cancel_requested_at);assert.equal(f.rows[0].cleanup_state,'claimed');
    return {json:prediction(i===1?'processing':'canceled')};
  });
  assert.equal((await run(f,http)).needed,1);assert.equal(f.rows[0].cancel_confirmed_at,null);
  assert.equal((await run(f,http)).done,1);assert.ok(f.rows[0].cancel_confirmed_at);
  assert.deepEqual(http.calls.map(c=>[c.method,c.path]),[['POST','/v1/predictions/prediction_1/cancel'],['GET','/v1/predictions/prediction_1']]);
  assert.equal(f.rows[0].cleanup_fence,2);assert.equal((await run(f,http)).actions,0);
  const locks=f.queries.filter(q=>q.sql.includes('FOR UPDATE')).map(q=>q.sql);
  for(let i=0;i<locks.length;i+=3){assert.match(locks[i],/account/);assert.match(locks[i+1],/job/);assert.match(locks[i+2],/provider_submission/);}
});

test('stale cleanup fence observation and finalization write nothing (mutation oracle)',async()=>{
  const f=memoryFixture(),http=mockBoundary(()=>{
    // Simulate a newer owner with an unexpired lease but identical provider identity.
    f.rows[0].cleanup_fence++;f.rows[0].cleanup_lease_until=new Date(+f.trustedClock()+30000);
    return {json:prediction('canceled')};
  });
  const before=f.rows[0].provider_status,r=await run(f,http);
  assert.equal(r.stale,1);assert.equal(r.errors,1);assert.equal(f.rows[0].provider_status,before);
  assert.equal(f.rows[0].cancel_confirmed_at,null);assert.equal(f.rows[0].cleanup_state,'claimed');
  assert.equal(f.queries.filter(q=>q.sql.includes('SET provider_status')||q.sql.includes('SET cleanup_state=$2')).length,0);
});

test('expired lease observes nothing; reclaim gets fresh fence and GET after persisted cancel',async()=>{
  const f=memoryFixture(),http=mockBoundary(()=>{f.advance(30000);return {json:prediction('canceled')};});
  assert.equal((await run(f,http)).stale,1);assert.equal(f.rows[0].provider_status,'processing');
  const fresh=mockBoundary(()=>({json:prediction('canceled')}));assert.equal((await run(f,fresh)).done,1);
  assert.equal(f.rows[0].cleanup_fence,2);assert.equal(fresh.calls[0].method,'GET');
});

test('cancel request durable but exhausted before invocation: next pass GET without claiming cancellation sent',async()=>{
  const f=memoryFixture(),http=mockBoundary(()=>({json:prediction()}));let reads=0;
  const first=createReplicateCleanup(f.pool,cleanupConfig(),{trustedClock:f.trustedClock,
    monotonicNow:()=>++reads>=4?5000:0,transportOptions:{request:http.request}});
  const r=await first.pass();assert.equal(r.actions,0);assert.equal(r.needed,1);
  assert.ok(f.rows[0].cancel_requested_at);assert.equal(f.rows[0].cancel_confirmed_at,null);assert.equal(http.calls.length,0);
  await run(f,http);assert.equal(http.calls[0].method,'GET');assert.equal(f.rows[0].cancel_confirmed_at,null);
});

test('unknown, quarantine, missing/future timestamp and retention boundary unresolved zero HTTP',async()=>{
  for(const patch of [{prediction_id:null},{identity_conflict_at:new Date()}, {submitting_at:null},
    {submitting_at:'bad'},{submitting_at:new Date('2026-10-03T13:00:00Z')},
    {submitting_at:new Date('2026-10-03T11:05:00Z')},{model:'wrong/model'}]) {
    const f=memoryFixture(patch),http=mockBoundary(()=>({json:prediction()}));
    assert.equal((await run(f,http)).unresolved,1);assert.equal(http.calls.length,0);assert.equal(f.rows[0].cancel_confirmed_at,null);
  }
  for(const cleanup_state of ['none','done','unresolved']) {
    const f=memoryFixture({cleanup_state}),http=mockBoundary(()=>({json:prediction()}));
    assert.equal((await run(f,http)).actions,0);assert.equal(http.calls.length,0);
  }
});

test('recorded terminal done without network; success race exposes counts only and no cancellation confirmation',async()=>{
  for(const status of ['succeeded','failed','canceled','aborted']) {
    const f=memoryFixture({provider_status:status}),http=mockBoundary(()=>({json:prediction()}));
    assert.equal((await run(f,http)).done,1);assert.equal(http.calls.length,0);
    assert.equal(!!f.rows[0].cancel_confirmed_at,status==='canceled');
  }
  const f=memoryFixture(),http=mockBoundary(()=>({json:prediction('succeeded')})),r=await run(f,http);
  assert.equal(r.done,1);assert.equal(f.rows[0].cancel_confirmed_at,null);
  assert.ok(Object.values(r).every(Number.isSafeInteger));assert.ok(!JSON.stringify(r).includes('https:'));
});

test('errors/404/429/malformed never done; cancel requested retained and GET next pass',async()=>{
  for(const action of [{error:true},{status:404,json:{}},{status:429,json:{}},{json:{...prediction(),id:'different'}},
    {json:{...prediction('succeeded'),output:[]}}]) {
    const f=memoryFixture(),http=mockBoundary(()=>action);const r=await run(f,http);
    assert.equal(r.errors,1);assert.equal(r.needed,1);assert.equal(f.rows[0].cancel_confirmed_at,null);
    const next=mockBoundary(()=>({json:prediction()}));await run(f,next);assert.equal(next.calls[0].method,'GET');
  }
});

test('real I2 timeout is capped by remaining pass time and returns needed without retry',async()=>{
  const f=memoryFixture();let reads=0;
  const http=mockBoundary(options=>{
    assert.equal(options.hostname,'api.replicate.com');assert.equal(options.timeout,20);return {hang:true};
  });
  const r=await createReplicateCleanup(f.pool,cleanupConfig(),{trustedClock:f.trustedClock,
    monotonicNow:()=>reads++===0?0:4980,transportOptions:{request:http.request}}).pass();
  assert.equal(r.actions,1);assert.equal(r.errors,1);assert.equal(r.needed,1);assert.equal(http.calls.length,1);
  assert.ok(f.rows[0].cancel_requested_at);assert.equal(f.rows[0].cancel_confirmed_at,null);
});

test('one scan, max100 sequential actions, original expired attempt identity, pass budget exhaustion',async()=>{
  const f=memoryFixture({},101),http=mockBoundary(o=>({json:prediction('processing',o.path.split('/')[3])}));
  const r=await run(f,http);assert.equal(r.scanned,100);assert.equal(r.actions,100);assert.equal(r.needed,100);
  assert.equal(f.queries.filter(q=>q.sql.includes('SELECT s.id,s.job_id')).length,1);
  assert.equal(f.rows[100].cleanup_fence,0);assert.equal(+f.rows[0].attempt_deadline,+new Date('2026-10-03T12:03:00Z'));
  const timed=memoryFixture({},3),slow=mockBoundary(o=>{timed.tick(5000);return {json:prediction('processing',o.path.split('/')[3])};});
  const limited=await run(timed,slow);assert.equal(limited.actions,1);assert.equal(limited.claimed,1);
  assert.equal(timed.rows[1].cleanup_state,'needed');assert.equal(timed.rows[1].cleanup_fence,0);
});
