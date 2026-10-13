import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createProviderSubmissions } from '../web/provider-submissions.js';
import { createReplicateCleanup } from '../web/replicate-cleanup.js';
import { readReplicateCleanupConfig } from '../web/replicate-worker-config.js';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA } from '../web/replicate.js';
import { migrate } from '../scripts/migrate.js';
import { cleanupEnv,mockBoundary,prediction } from './replicate-cleanup-fixtures.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function reached(gate) {
  let timer;
  try {await Promise.race([gate.promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('HTTP barrier not reached')),6000);})]);}
  finally {clearTimeout(timer);}
}

// Parent executes this suite on exact frozen source. Real I1/job lifecycle and PG
// barriers; only the fixed I2 HTTPS boundary is mocked. No submission/evidence INSERT.
test('F07 I4c cleanup on owned internal PostgreSQL16',async t=>{
  assert.match(process.versions.node,/^22\./);
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Internal owned database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f07_cleanup_'+randomBytes(8).toString('hex'),appName=schema+'_app';let pool,now;
  const common={runtime:'test',platformDailyLimit:200,accountDailyLimit:20};
  const config=readReplicateCleanupConfig(common,cleanupEnv());
  const jobs=()=>createJobs(pool,common,{trustedClock:()=>now});
  const authority=()=>createProviderSubmissions(pool,common,{trustedClock:()=>now});
  const sub=async id=>(await pool.query('SELECT * FROM provider_submission WHERE job_id=$1',[id])).rows[0];
  const row=async id=>(await pool.query('SELECT * FROM job WHERE id=$1',[id])).rows[0];
  const count=async(sql,params=[])=>(await pool.query(sql,params)).rows[0].n;
  const advance=ms=>{now=new Date(+now+ms);};
  const run=(http,options={},c=config)=>createReplicateCleanup(pool,c,{trustedClock:()=>now,
    transportOptions:{request:http.request},...options}).pass();
  const binding=id=>({model:REPLICATE_MODEL,version:REPLICATE_VERSION,contract_sha:REPLICATE_CONTRACT_SHA,
    spend_budget_id:id,source_input_sha:'a'.repeat(64),transmitted_input_sha:'b'.repeat(64),request_sha:'c'.repeat(64),
    authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),license_acceptance_sha:'5'.repeat(64),
    safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),
    transform:{original_width:640,original_height:480,canvas_width:512,canvas_height:512,
      content_rect:{x:0,y:64,width:512,height:384}}});
  const identity=(id='prediction_1',status)=>({request_sha:'c'.repeat(64),prediction_id:id,
    version:REPLICATE_VERSION,...(status?{status}:{})});
  async function reset() {
    await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');
    // Earlier trusted test clock keeps DB scan's expired-lease prefilter inclusive;
    // every authority decision still uses the explicitly injected post-lock clock.
    now=new Date(+(await pool.query('SELECT clock_timestamp() AS now')).rows[0].now-7200000);
  }
  async function submitted({known=true,status,id='prediction_1',stop='fail'}={}) {
    const account=randomUUID(),upload=randomUUID(),budget=randomUUID(),b=binding(budget);
    await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[account,account+'@example.test','synthetic-unused']);
    await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,5,'purchase',$3)",[randomUUID(),account,randomUUID()]);
    await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,640,480,'image/webp')",[upload,account,b.source_input_sha]);
    const q=jobs(),r=await q.reserve(account,{upload_id:upload,style:'warm',idempotency_key:randomUUID()}),c=await q.claim();
    assert.equal(c.job_id,r.job_id);
    await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,authorization_sha,
      privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,
      window_start,window_end,ceiling_microusd,per_create_ceiling_microusd)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,12000000,300000)`,
      [budget,randomUUID(),b.model,b.version,b.contract_sha,b.authorization_sha,b.privacy_acceptance_sha,
        b.license_acceptance_sha,b.safety_acceptance_sha,b.billing_acceptance_sha,new Date(+now-86400000),new Date(+now+86400000)]);
    const a=authority();assert.equal((await a.authorize(c,b)).authorized,true);
    if(known)assert.equal((await a.bindPrediction(c.job_id,identity(id))).recorded,true);
    if(status)await a.observe(c.job_id,identity(id,status));
    if(stop==='fail')assert.equal(await q.fail(c.job_id,c.fence,{retryable:false}),true);
    if(stop==='delete')await q.deleteUpload(account,upload);
    return {c,a,budget,id};
  }
  const IMMUTABLE=['id','created_at','job_id','attempt_number','attempt_ticket_id','submission_fence','provider',
    'model','version','contract_sha','source_input_sha','transmitted_input_sha','request_sha','transform',
    'attempt_deadline','spend_budget_id','authorization_sha','privacy_acceptance_sha','license_acceptance_sha',
    'safety_acceptance_sha','billing_acceptance_sha','spend_reserved_microusd','prediction_id','submitting_at','identity_conflict_at'];
  async function snapshot() {
    const out={};
    for(const table of ['account','upload','job','credit_ledger','attempt_ticket','attempt_budget','provider_spend_budget','generation_evidence'])
      out[table]=(await pool.query(`SELECT * FROM ${table} ORDER BY ${table==='attempt_budget'?'bucket,owner,day':table==='generation_evidence'?'job_id':'id'}`)).rows;
    out.identity=(await pool.query('SELECT * FROM provider_submission ORDER BY id')).rows.map(s=>Object.fromEntries(IMMUTABLE.map(k=>[k,s[k]])));
    return out;
  }
  async function conserved(h,before) {
    assert.deepEqual(await snapshot(),before);
    const s=await sub(h.c.job_id),j=await row(h.c.job_id);
    assert.equal(j.attempts,1);assert.equal(s.attempt_number,1);assert.equal(s.submission_fence,h.c.fence);
    assert.equal(s.attempt_ticket_id,j.first_ticket_id);assert.equal(+s.attempt_deadline,+h.c.attempt_deadline);
    assert.equal(s.spend_reserved_microusd,'300000');assert.equal(s.billing_actual_microusd,null);
    assert.equal(j.output_key,null);assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
    assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE job_id=$1',[j.id]),1);
    assert.equal((await pool.query('SELECT reserved_microusd FROM provider_spend_budget WHERE id=$1',[h.budget])).rows[0].reserved_microusd,'300000');
  }
  async function barrier(sql,values,actions,beforeRelease=async()=>{}) {
    const blocker=await pool.connect();let pending;
    try {
      await blocker.query('BEGIN');await blocker.query(sql,values);pending=Promise.allSettled(actions.map(fn=>fn()));
      const until=Date.now()+3500;let waiting=0;
      do {
        waiting=Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n);
        if(waiting>=actions.length)break;
        await new Promise(r=>setTimeout(r,10));
      }while(Date.now()<until);
      assert.ok(waiting>=actions.length,'all real PG contenders reached lock barrier');
      await beforeRelease(blocker);await blocker.query('COMMIT');return await pending;
    }finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
  }
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    db.searchParams.set('application_name',appName);pool=createPool(db.href);await migrate(pool);
    await t.test('two real PG owners produce one cancel while the other sees live claim',async()=>{
      await reset();const h=await submitted(),before=await snapshot(),loser=deferred();
      const http=mockBoundary(async()=>{await loser.promise;return {json:prediction()};});
      const action=async()=>{const result=await run(http);if(result.claimed===0)loser.resolve();return result;};
      const results=await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[h.c.account_id],[action,action]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
      assert.equal(results.map(r=>r.value.claimed).reduce((a,b)=>a+b,0),1);
      assert.equal(http.calls.length,1);assert.equal(http.calls[0].path,'/v1/predictions/prediction_1/cancel');
      assert.equal((await sub(h.c.job_id)).cleanup_state,'needed');assert.equal((await sub(h.c.job_id)).cancel_confirmed_at,null);
      await conserved(h,before);
    });
    await t.test('first cancel then GET one action each; only canceled confirms',async()=>{
      await reset();const h=await submitted(),before=await snapshot();
      const http=mockBoundary(async(o,b,i)=>{
        assert.ok((await sub(h.c.job_id)).cancel_requested_at);return {json:prediction(i===1?'processing':'canceled')};
      });
      assert.equal((await run(http)).needed,1);assert.equal((await run(http)).done,1);
      assert.deepEqual(http.calls.map(c=>c.method),['POST','GET']);const s=await sub(h.c.job_id);
      assert.ok(s.cancel_confirmed_at);assert.equal(s.cleanup_fence,2);assert.equal((await run(http)).actions,0);await conserved(h,before);
    });
    await t.test('expired lease/reclaim: late old observation and reconciliation make zero changes',async()=>{
      await reset();const h=await submitted(),before=await snapshot(),old=deferred(),fresh=deferred(),oldSeen=deferred(),newSeen=deferred();
      const oldHttp=mockBoundary(async()=>{oldSeen.resolve();await old.promise;return {json:prediction('succeeded')};});
      const freshHttp=mockBoundary(async()=>{newSeen.resolve();await fresh.promise;return {json:prediction('canceled')};});
      const p=run(oldHttp);await reached(oldSeen);advance(30000);
      const newer=run(freshHttp);await reached(newSeen);const winner=await sub(h.c.job_id);
      assert.equal(winner.cleanup_fence,2);assert.equal(freshHttp.calls[0].method,'GET');
      old.resolve();const stale=await p;assert.equal(stale.stale,1);assert.equal(stale.errors,1);
      assert.deepEqual(await sub(h.c.job_id),winner);await conserved(h,before);
      fresh.resolve();assert.equal((await newer).done,1);assert.equal((await sub(h.c.job_id)).provider_status,'canceled');await conserved(h,before);
    });
    await t.test('observation waits on real account lock past lease: no provider observation or finalization',async()=>{
      await reset();const h=await submitted(),before=await snapshot(),arrived=deferred(),send=deferred();
      const http=mockBoundary(async()=>{arrived.resolve();await send.promise;return {json:prediction('canceled')};});
      const pending=run(http);await reached(arrived);
      const blocker=await pool.connect();
      try {
        await blocker.query('BEGIN');await blocker.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[h.c.account_id]);
        const claimed=await sub(h.c.job_id);send.resolve();
        const until=Date.now()+3500;let waiting=0;
        do {
          waiting=Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n);
          if(waiting)break;await new Promise(r=>setTimeout(r,10));
        }while(Date.now()<until);
        assert.ok(waiting,'cleanup observation reached actual PG lock barrier');advance(30000);
        await blocker.query('COMMIT');const result=await pending;
        assert.equal(result.errors,1);assert.equal(result.stale,1);assert.deepEqual(await sub(h.c.job_id),claimed);await conserved(h,before);
      }finally {await blocker.query('ROLLBACK');blocker.release();send.resolve();await pending;}
    });
    await t.test('request recorded before invocation then budget exhaustion: GET later, never assert cancel sent',async()=>{
      await reset();const h=await submitted(),before=await snapshot(),http=mockBoundary(()=>({json:prediction()}));let reads=0;
      const result=await run(http,{monotonicNow:()=>++reads>=4?5000:0});
      assert.equal(result.actions,0);assert.equal(http.calls.length,0);const s=await sub(h.c.job_id);
      assert.ok(s.cancel_requested_at);assert.equal(s.cancel_confirmed_at,null);assert.equal(s.cleanup_state,'needed');
      await run(http);assert.equal(http.calls[0].method,'GET');assert.equal((await sub(h.c.job_id)).cancel_confirmed_at,null);await conserved(h,before);
    });
    await t.test('post-lock clock at retention boundary resolves without HTTP',async()=>{
      await reset();const h=await submitted(),before=await snapshot(),http=mockBoundary(()=>({json:prediction()}));
      const results=await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[h.c.account_id],
        [()=>run(http)],async()=>advance(3600000));
      assert.equal(results[0].status,'fulfilled');assert.equal(results[0].value.unresolved,1);assert.equal(http.calls.length,0);await conserved(h,before);
    });
    await t.test('expired original deadline, hold, revoked spend and deleted upload still permit cleanup',async()=>{
      for(const cause of ['deadline','hold','revoked','deleted']) {
        await reset();const h=await submitted({stop:cause==='deleted'?'delete':cause==='deadline'?null:'fail'});
        if(cause==='deadline'){advance(180000);await jobs().maintenance();}
        if(cause==='hold')await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[h.c.account_id]);
        if(cause==='revoked')await pool.query('UPDATE provider_spend_budget SET revoked_at=$2 WHERE id=$1',[h.budget,now]);
        const before=await snapshot(),http=mockBoundary(()=>({json:prediction('canceled')}));
        assert.equal((await run(http)).done,1);assert.equal(http.calls.length,1);await conserved(h,before);
        await assert.rejects(h.a.workerContext(h.c));assert.equal(await h.a.finalAuthorize(h.c,{}),false);
      }
    });
    await t.test('success racing cancellation cannot attach output or refund reservations; terminal cannot regress',async()=>{
      await reset();const h=await submitted(),before=await snapshot(),http=mockBoundary(()=>({json:prediction('succeeded')}));
      const result=await run(http);assert.equal(result.done,1);assert.ok(Object.values(result).every(Number.isSafeInteger));
      assert.ok(!JSON.stringify(result).includes('https:'));const s=await sub(h.c.job_id);
      assert.equal(s.provider_status,'succeeded');assert.equal(s.cancel_confirmed_at,null);await conserved(h,before);
      const after=await sub(h.c.job_id);await h.a.observe(h.c.job_id,identity(h.id,'processing'));
      assert.deepEqual(await sub(h.c.job_id),after);assert.equal((await run(http)).actions,0);await conserved(h,before);
      assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[h.c.job_id]),1);
    });
    await t.test('recorded terminal statuses done without network; no fabricated erasure confirmation',async()=>{
      for(const status of ['succeeded','failed','canceled','aborted']) {
        await reset();const h=await submitted({status}),before=await snapshot(),http=mockBoundary(()=>({json:prediction()}));
        assert.equal((await run(http)).done,1);assert.equal(http.calls.length,0);
        assert.equal(!!(await sub(h.c.job_id)).cancel_confirmed_at,status==='canceled');await conserved(h,before);
      }
    });
    await t.test('unknown identity, quarantine and retention remain unresolved with zero HTTP',async()=>{
      for(const cause of ['unknown','quarantine','retention']) {
        await reset();const h=await submitted({known:cause!=='unknown'});
        if(cause==='quarantine')await h.a.bindPrediction(h.c.job_id,identity('conflicting_id'));
        if(cause==='retention')advance(3600000);
        const before=await snapshot(),http=mockBoundary(()=>({json:prediction()}));await run(http);
        const s=await sub(h.c.job_id);assert.equal(s.cleanup_state,'unresolved');assert.equal(s.cancel_confirmed_at,null);
        assert.equal(http.calls.length,0);await conserved(h,before);
      }
    });
    await t.test('transport errors/429/404/timeout leave needed; later passes GET only; no confirmation',async()=>{
      for(const response of [{error:true},{status:429,json:{}},{status:404,json:{}},{hang:true}]) {
        await reset();const h=await submitted(),before=await snapshot(),http=mockBoundary(()=>response);
        // Actual I2 timeout timer, shortened through test-only monotonic budget.
        let ticks=0;const monotonicNow=response.hang?()=>ticks++===0?0:4980:undefined;
        const result=await run(http,monotonicNow?{monotonicNow}:{});
        assert.equal(result.errors,1);assert.equal(result.needed,1);const s=await sub(h.c.job_id);
        assert.ok(s.cancel_requested_at);assert.equal(s.cleanup_state,'needed');assert.equal(s.cancel_confirmed_at,null);
        const next=mockBoundary(()=>({json:prediction()}));await run(next);assert.equal(next.calls[0].method,'GET');await conserved(h,before);
      }
    });
    await t.test('default disabled and invalid opt-in deny without outbound calls or row changes',async()=>{
      await reset();await submitted();const before=await snapshot(),s=(await pool.query('SELECT * FROM provider_submission')).rows;
      const http=mockBoundary(()=>({json:prediction()}));assert.equal((await run(http,{},common)).actions,0);
      for(const key of Object.keys(cleanupEnv()))assert.throws(()=>readReplicateCleanupConfig(common,{...cleanupEnv(),[key]:key==='REPLICATE_API_TOKEN'?'':'invalid'}));
      assert.equal(http.calls.length,0);assert.deepEqual((await pool.query('SELECT * FROM provider_submission')).rows,s);assert.deepEqual(await snapshot(),before);
    });
    await t.test('scan at most100 once; sequential per-row actions and absolute pass exhaustion',async()=>{
      await reset();const handles=[];
      for(let i=0;i<101;i++)handles.push(await submitted({id:'prediction_'+(i+1)}));
      const before=await snapshot();let active=0,maxActive=0;
      const http=mockBoundary(async o=>{active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,1));active--;
        return {json:prediction('processing',o.path.split('/')[3])};});
      const result=await run(http);assert.equal(result.scanned,100);assert.equal(result.actions,100);assert.equal(maxActive,1);
      assert.equal(new Set(http.calls.map(c=>c.path)).size,100);assert.equal((await pool.query('SELECT count(*)::int AS n FROM provider_submission WHERE cleanup_fence=0')).rows[0].n,1);
      assert.deepEqual(await snapshot(),before);assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),202);
      await reset();const h=await submitted();await submitted({id:'prediction_2'});const conservedBefore=await snapshot();let mono=0;
      const slow=mockBoundary(o=>{mono=5000;return {json:prediction('processing',o.path.split('/')[3])};});
      const bounded=await run(slow,{monotonicNow:()=>mono});assert.equal(bounded.claimed,1);assert.equal(bounded.actions,1);
      assert.equal(slow.calls.length,1);await conserved(h,conservedBefore);
    });
  }finally {await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
