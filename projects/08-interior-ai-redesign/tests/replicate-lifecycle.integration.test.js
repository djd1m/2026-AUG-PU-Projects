import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createProviderSubmissions,isCleanupOnly } from '../web/provider-submissions.js';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA } from '../web/replicate.js';
import { migrate } from '../scripts/migrate.js';
import { fixtureOutput } from './job-fixtures.js';

test('cleanup-only includes every non-none durable marker',()=>{
  assert.equal(isCleanupOnly(null),false);
  assert.equal(isCleanupOnly({cleanup_state:'none'}),false);
  for(const cleanup_state of ['needed','claimed','done','unresolved'])
    assert.equal(isCleanupOnly({cleanup_state}),true);
});

// Coordinator-only runtime gate: real PG16 locks/rows, no provider/network/listener.
test('F07 I4a durable hosted lifecycle on dedicated PostgreSQL16',async t=>{
  assert.match(process.versions.node,/^22\./,'Node22 required');
  if(!process.env.TEST_DATABASE_URL || process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f07_lifecycle_'+randomBytes(8).toString('hex'),appName=schema+'_worker';let pool,now;
  const config={runtime:'test',platformDailyLimit:200,accountDailyLimit:20};
  const jobs=(limits={})=>createJobs(pool,{...config,...limits},{trustedClock:()=>now});
  const authority=()=>createProviderSubmissions(pool,config,{trustedClock:()=>now});
  const row=async id=>(await pool.query('SELECT * FROM job WHERE id=$1',[id])).rows[0];
  const sub=async id=>(await pool.query('SELECT * FROM provider_submission WHERE job_id=$1',[id])).rows[0];
  const count=async(sql,params=[])=>(await pool.query(sql,params)).rows[0].n;
  const releases=id=>count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[id]);
  const advance=ms=>{now=new Date(+now+ms);};
  const binding=id=>({model:REPLICATE_MODEL,version:REPLICATE_VERSION,spend_budget_id:id,
    contract_sha:REPLICATE_CONTRACT_SHA,source_input_sha:'a'.repeat(64),transmitted_input_sha:'b'.repeat(64),request_sha:'c'.repeat(64),
    authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),license_acceptance_sha:'5'.repeat(64),
    safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),
    transform:{original_width:640,original_height:480,canvas_width:512,canvas_height:512,content_rect:{x:0,y:64,width:512,height:384}}});
  const identity=(prediction_id='prediction_1',status)=>({request_sha:'c'.repeat(64),prediction_id,version:REPLICATE_VERSION,...(status?{status}:{})});
  const finalCheck=s=>({submission_id:s.id,job_id:s.job_id,request_sha:s.request_sha,version:s.version,attempt_deadline:s.attempt_deadline});
  async function reset() {
    await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');now=new Date('2026-10-03T12:00:00Z');
  }
  async function owner() {
    const id=randomUUID(),upload=randomUUID();
    await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[id,id+'@example.test','synthetic-unused-hash']);
    await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,5,'purchase',$3)",[randomUUID(),id,randomUUID()]);
    await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,640,480,'image/webp')",[upload,id,'a'.repeat(64)]);
    return {id,upload};
  }
  async function start() {
    const o=await owner(),q=jobs(),r=await q.reserve(o.id,{upload_id:o.upload,style:'warm',idempotency_key:randomUUID()});
    const c=await q.claim();assert.equal(c.job_id,r.job_id);return c;
  }
  async function envelope() {
    const id=randomUUID(),b=binding(id);
    await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,authorization_sha,
      privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,
      window_start,window_end,ceiling_microusd,per_create_ceiling_microusd)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,12000000,300000)`,
      [id,randomUUID(),b.model,b.version,b.contract_sha,b.authorization_sha,b.privacy_acceptance_sha,b.license_acceptance_sha,
        b.safety_acceptance_sha,b.billing_acceptance_sha,new Date(+now-86400000),new Date(+now+86400000)]);return id;
  }
  async function submitted({known=true,status}={}) {
    const c=await start(),id=await envelope(),a=authority();
    assert.equal((await a.authorize(c,binding(id))).authorized,true);
    if(known)await a.bindPrediction(c.job_id,identity());
    if(status)await a.observe(c.job_id,identity('prediction_1',status));
    return {c,id,a};
  }
  async function immutableSnapshot(c) {
    const j=await row(c.job_id),s=await sub(c.job_id);
    return {job:{attempts:j.attempts,first_ticket_id:j.first_ticket_id,attempt_deadline:j.attempt_deadline,hard_deadline:j.hard_deadline},
      submission:{...Object.fromEntries(['id','job_id','attempt_number','attempt_ticket_id','submission_fence','attempt_deadline',
        'provider','model','version','contract_sha','request_sha','source_input_sha','transmitted_input_sha','transform',
        'spend_budget_id','spend_reserved_microusd','authorization_sha','privacy_acceptance_sha','license_acceptance_sha',
        'safety_acceptance_sha','billing_acceptance_sha','submitting_at'].map(k=>[k,s[k]]))},
      tickets:(await pool.query('SELECT * FROM attempt_ticket WHERE job_id=$1 ORDER BY id',[c.job_id])).rows,
      counters:(await pool.query('SELECT bucket,owner,day::text AS day,count FROM attempt_budget ORDER BY day,bucket,owner')).rows,
      spend:(await pool.query('SELECT id,reserved_microusd FROM provider_spend_budget ORDER BY id')).rows};
  }
  async function literalConservation(c,id,before) {
    assert.deepEqual(await immutableSnapshot(c),before);
    const j=await row(c.job_id),s=await sub(c.job_id);
    assert.equal(j.attempts,1);assert.equal(s.attempt_number,1);assert.equal(s.submission_fence,c.fence);
    assert.equal(j.first_ticket_id,s.attempt_ticket_id);
    assert.equal(j.attempt_deadline.getTime(),c.attempt_deadline.getTime());
    assert.equal(j.hard_deadline.getTime(),c.hard_deadline.getTime());
    assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE job_id=$1',[c.job_id]),1);
    assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
    assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='reserve' AND reference=$1",[c.job_id]),1);
    assert.equal((await pool.query('SELECT reserved_microusd FROM provider_spend_budget WHERE id=$1',[id])).rows[0].reserved_microusd,'300000');
  }
  async function barrier(sql,values,actions,beforeRelease=()=>{}) {
    const blocker=await pool.connect();let pending;
    try {
      await blocker.query('BEGIN');await blocker.query(sql,values);
      pending=Promise.allSettled(actions.map(action=>action()));
      const until=Date.now()+3500;let waiting=0;
      do {
        waiting=Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n);
        if(waiting>=actions.length)break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }while(Date.now()<until);
      assert.ok(waiting>=actions.length,'all real PG contenders reached a lock barrier');
      await beforeRelease(blocker);await blocker.query('COMMIT');return await pending;
    }finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
  }
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    db.searchParams.set('application_name',appName);pool=createPool(db.href);await migrate(pool);
    await t.test('two reclaimers have one winner, same consumed ticket/attempt/deadline and only new job fence',async()=>{
      await reset();const {c,id,a}=await submitted(),before=await immutableSnapshot(c);advance(30000);
      const results=await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id],[()=>jobs().claim(),()=>jobs().claim()]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
      const winners=results.map(r=>r.value).filter(Boolean);assert.equal(winners.length,1);const fresh=winners[0];
      assert.equal(fresh.provider_recovery,true);assert.equal(fresh.fence,c.fence+1);assert.equal(fresh.attempt,1);
      assert.equal(fresh.lease_until.getTime(),now.getTime()+30000);
      assert.ok(fresh.lease_until<=c.attempt_deadline);await literalConservation(c,id,before);assert.equal(await releases(c.job_id),0);
      const context=await a.workerContext(fresh);assert.equal(context.remaining_ms,150000);
      assert.equal(context.claim.fence,fresh.fence);assert.equal(context.submission.submission_fence,c.fence);
      assert.equal(context.input.id,c.upload_id);assert.equal(context.input.sha256,'a'.repeat(64));
      // Recovered work is GET-only; neither final send authorization nor I1 authorize can replay it.
      assert.equal(await a.finalAuthorize(fresh,finalCheck(context.submission)),false);
      await assert.rejects(a.authorize(fresh,binding(id)),e=>e.code==='submission_binding_mismatch');
      const owned=await row(c.job_id);
      assert.equal(await jobs().heartbeat(c.job_id,c.fence),false);
      assert.equal(await jobs().complete(c.job_id,c.fence,fixtureOutput()),false);
      assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),false);
      assert.deepEqual(await row(c.job_id),owned);assert.equal(await releases(c.job_id),0);
      assert.equal(await jobs().heartbeat(c.job_id,fresh.fence),true);
      const beforeDeadline=await row(c.job_id);advance(150000);
      assert.equal(await jobs().heartbeat(c.job_id,c.fence),false);
      assert.equal(await jobs().complete(c.job_id,c.fence,fixtureOutput()),false);
      assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),false);
      assert.deepEqual(await row(c.job_id),beforeDeadline);assert.equal(await releases(c.job_id),0);
      await jobs().maintenance();assert.equal(await releases(c.job_id),1);
    });
    await t.test('maintenance leaves known recovery in original attempt; succeeded also needs remaining private import time',async()=>{
      for(const status of ['processing','succeeded']) {
        await reset();const {c,id}=await submitted({status}),before=await immutableSnapshot(c);advance(30000);
        await jobs().maintenance();assert.equal((await row(c.job_id)).status,'running');
        const fresh=await jobs().claim();assert.equal(fresh.fence,c.fence+1);await literalConservation(c,id,before);
        assert.equal(await jobs().complete(c.job_id,fresh.fence,fixtureOutput()),false);
        assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
        assert.equal((await row(c.job_id)).status,'running');
      }
    });
    await t.test('late identity after lease loss stays cleanup-only before claim, with or without maintenance',async()=>{
      for(const maintenance of [false,true]) {
        await reset();const {c,id,a}=await submitted({known:false}),before=await immutableSnapshot(c);
        advance(30000);assert.equal(c.attempt_deadline.getTime()-now.getTime(),150000);
        const expired=await row(c.job_id),late=await a.bindPrediction(c.job_id,identity());
        assert.equal(late.recorded,true);assert.equal(late.cleanup_required,true);
        assert.equal(late.completion_authorized,false);
        const s=await sub(c.job_id);
        assert.equal(s.state,'known');assert.equal(s.cleanup_state,'needed');assert.equal(s.prediction_id,'prediction_1');
        assert.deepEqual(await row(c.job_id),expired);assert.equal(expired.status,'running');
        assert.equal(await releases(c.job_id),0);await literalConservation(c,id,before);
        // Specific cleanup denial precedes lease/terminal checks; context is read-only.
        await assert.rejects(a.workerContext(c),e=>e.code==='submission_binding_mismatch');
        assert.equal(await a.finalAuthorize(c,finalCheck(s)),false);
        assert.deepEqual(await row(c.job_id),expired);assert.deepEqual(await sub(c.job_id),s);
        if(maintenance)await jobs().maintenance();
        const actions=[()=>jobs().claim(),()=>jobs().claim()];
        const results=maintenance?await Promise.allSettled(actions.map(action=>action())):
          await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id],actions);
        assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value===null).length,2);
        const failed=await row(c.job_id);
        assert.equal(failed.status,'failed');assert.equal(failed.failure_reason,'submission_binding_mismatch');
        assert.equal(failed.fence,c.fence+1);assert.equal(failed.lease_until,null);assert.equal(failed.reserved,false);
        assert.deepEqual(await sub(c.job_id),s);assert.equal(await releases(c.job_id),1);
        await assert.rejects(a.workerContext(c),e=>e.code==='submission_fence_expired');
        await jobs().maintenance();await jobs().get(c.account_id,c.job_id);
        assert.equal(await jobs().claim(),null);assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),false);
        assert.deepEqual(await row(c.job_id),failed);assert.deepEqual(await sub(c.job_id),s);
        assert.equal(await releases(c.job_id),1);await literalConservation(c,id,before);
      }
      await reset();const {c,id,a}=await submitted(),before=await immutableSnapshot(c);
      assert.equal((await sub(c.job_id)).cleanup_state,'none');advance(30000);
      const fresh=await jobs().claim();assert.equal(fresh.provider_recovery,true);assert.equal(fresh.fence,c.fence+1);
      const context=await a.workerContext(fresh);
      assert.equal(context.remaining_ms,150000);assert.equal(context.submission.cleanup_state,'none');
      assert.equal(context.submission.submission_fence,c.fence);
      assert.equal(await releases(c.job_id),0);await literalConservation(c,id,before);
      // Rebinding against the immutable original fence can designate cleanup while
      // the recovered job lease is live. Context must deny without a terminal job.
      assert.equal((await a.bindPrediction(c.job_id,identity())).cleanup_required,true);
      const active=await row(c.job_id),cleanup=await sub(c.job_id);
      assert.equal(active.status,'running');assert.ok(now<active.lease_until);assert.equal(cleanup.cleanup_state,'needed');
      await assert.rejects(a.workerContext(fresh),e=>e.code==='submission_binding_mismatch');
      assert.deepEqual(await row(c.job_id),active);assert.deepEqual(await sub(c.job_id),cleanup);
      assert.equal(await jobs().claim(),null);
      assert.equal((await row(c.job_id)).fence,fresh.fence+1);assert.equal((await row(c.job_id)).status,'failed');
      assert.deepEqual(await sub(c.job_id),cleanup);assert.equal(await releases(c.job_id),1);
      await literalConservation(c,id,before);
    });
    await t.test('attempt deadline after expired lease terminalizes on maintenance/get/fail/claim and releases exactly once',async()=>{
      for(const path of ['maintenance','get','fail','claim']) {
        await reset();const {c,id}=await submitted(),before=await immutableSnapshot(c);advance(180000);
        if(path==='get')await jobs().get(c.account_id,c.job_id);
        else if(path==='fail')assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),true);
        else await jobs()[path]();
        let j=await row(c.job_id);assert.equal(j.status,'failed');assert.equal(j.failure_reason,'attempt_deadline');
        assert.equal(j.fence,c.fence+1);assert.equal(j.lease_until,null);assert.equal(j.reserved,false);
        assert.equal((await sub(c.job_id)).cleanup_state,'needed');assert.equal(await releases(c.job_id),1);
        await jobs().maintenance();await jobs().get(c.account_id,c.job_id);assert.equal(await jobs().claim(),null);
        assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),false);
        assert.equal(await releases(c.job_id),1);await literalConservation(c,id,before);
      }
    });
    await t.test('hard deadline is enforced after lease expiry without assigning a new 180s budget',async()=>{
      await reset();const {c,id}=await submitted();
      await pool.query('UPDATE job SET hard_deadline=$2 WHERE id=$1',[c.job_id,new Date(+now+40000)]);
      const before=await immutableSnapshot({...c,hard_deadline:new Date(+now+40000)});advance(40000);
      assert.equal(await jobs().claim(),null);assert.equal((await row(c.job_id)).failure_reason,'hard_deadline');
      assert.equal(await releases(c.job_id),1);assert.deepEqual(await immutableSnapshot(c),before);
      assert.equal((await sub(c.job_id)).cleanup_state,'needed');
      assert.equal((await pool.query('SELECT reserved_microusd FROM provider_spend_budget WHERE id=$1',[id])).rows[0].reserved_microusd,'300000');
    });
    await t.test('submitting without ID after crash and explicitly ambiguous work never retry or create ticket2',async()=>{
      for(const path of ['claim','maintenance','get','fail','ambiguous']) {
        await reset();const {c,id,a}=await submitted({known:false}),before=await immutableSnapshot(c);
        if(path==='ambiguous')await a.markAmbiguous(c.job_id,'c'.repeat(64));else advance(30000);
        if(path==='get'||path==='ambiguous')await jobs().get(c.account_id,c.job_id);
        else if(path==='fail')await jobs().fail(c.job_id,c.fence,{retryable:true});else await jobs()[path]();
        assert.equal((await row(c.job_id)).status,'failed');assert.equal((await sub(c.job_id)).state,'ambiguous');
        assert.equal((await sub(c.job_id)).cleanup_state,'unresolved');assert.equal(await releases(c.job_id),1);
        assert.equal(await jobs().claim(),null);assert.equal((await a.authorize(c,binding(id))).authorized,false);
        await literalConservation(c,id,before);
      }
    });
    await t.test('known provider failed/canceled/aborted and quarantine fail closed before lease expires',async()=>{
      for(const status of ['failed','canceled','aborted','quarantine'])for(const path of ['maintenance','claim','get']) {
        await reset();const {c,id,a}=await submitted(),before=await immutableSnapshot(c);
        if(status==='quarantine')await a.bindPrediction(c.job_id,identity('conflicting_id'));
        else await a.observe(c.job_id,identity('prediction_1',status));
        if(path==='get')await jobs().get(c.account_id,c.job_id);else await jobs()[path]();
        assert.equal((await row(c.job_id)).status,'failed');
        assert.equal((await sub(c.job_id)).cleanup_state,status==='quarantine'?'unresolved':'needed');
        assert.equal(await releases(c.job_id),1);assert.equal(await jobs().claim(),null);
        assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),false);
        assert.equal((await a.authorize(c,binding(id))).authorized,false);await literalConservation(c,id,before);
      }
    });
    await t.test('current worker failure after submitting always terminalizes even with retryable=true',async()=>{
      await reset();const {c,id}=await submitted(),before=await immutableSnapshot(c);
      assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),true);
      assert.equal((await row(c.job_id)).status,'failed');assert.equal(await jobs().claim(),null);
      assert.equal(await releases(c.job_id),1);assert.equal((await sub(c.job_id)).cleanup_state,'needed');
      await literalConservation(c,id,before);
    });
    await t.test('hold before CAS denies; hold after CAS preserves final check, heartbeat and private recovery',async()=>{
      await reset();const pre=await start(),budgetId=await envelope();
      await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[pre.account_id]);
      await assert.rejects(authority().authorize(pre,binding(budgetId)),e=>e.code==='submission_billing_hold');
      assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
      assert.equal((await pool.query('SELECT reserved_microusd FROM provider_spend_budget WHERE id=$1',[budgetId])).rows[0].reserved_microusd,'0');
      await reset();const {c,id,a}=await submitted({known:false}),before=await immutableSnapshot(c),s=await sub(c.job_id);
      await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[c.account_id]);
      assert.equal(await a.finalAuthorize(c,finalCheck(s)),true);
      assert.equal(await jobs().heartbeat(c.job_id,c.fence),true);
      await a.bindPrediction(c.job_id,identity());advance(30000);
      const recovered=await jobs().claim();assert.equal(recovered.attempt,1);assert.equal(recovered.fence,c.fence+1);
      assert.equal((await a.workerContext(recovered)).remaining_ms,150000);await literalConservation(c,id,before);
      assert.equal(await releases(c.job_id),0);
    });
    await t.test('delete tombstones input/job, returns owner404 and releases once; late ID persists cleanup without revival',async()=>{
      for(const known of [false,true]) {
        await reset();const {c,id,a}=await submitted({known}),before=await immutableSnapshot(c);
        await jobs().deleteUpload(c.account_id,c.upload_id);const deleted=await row(c.job_id);
        assert.ok(deleted.deleted_at);assert.equal(deleted.status,'failed');assert.ok(deleted.fence>c.fence);
        assert.ok((await pool.query('SELECT deleted_at FROM upload WHERE id=$1',[c.upload_id])).rows[0].deleted_at);
        await assert.rejects(jobs().get(c.account_id,c.job_id),e=>e.status===404);
        assert.equal(await releases(c.job_id),1);assert.equal((await sub(c.job_id)).cleanup_state,known?'needed':'unresolved');
        const late=await a.bindPrediction(c.job_id,identity());assert.equal(late.recorded,true);assert.equal(late.cleanup_required,true);
        assert.equal(late.completion_authorized,false);assert.equal((await sub(c.job_id)).prediction_id,'prediction_1');
        assert.equal((await sub(c.job_id)).cleanup_state,'needed');assert.deepEqual(await row(c.job_id),deleted);
        await assert.rejects(jobs().deleteUpload(c.account_id,c.upload_id),e=>e.status===404);
        assert.equal(await jobs().claim(),null);assert.equal(await releases(c.job_id),1);await literalConservation(c,id,before);
      }
    });
    await t.test('finalAuthorize samples clock after account/envelope waits and denies deadline or revoked authorization',async()=>{
      for(const lock of ['account','envelope'])for(const cause of ['deadline','revocation']) {
        await reset();const {c,id,a}=await submitted({known:false}),s=await sub(c.job_id),before=await immutableSnapshot(c);
        const sql=lock==='account'?'SELECT id FROM account WHERE id=$1 FOR UPDATE':'SELECT id FROM provider_spend_budget WHERE id=$1 FOR UPDATE';
        const results=await barrier(sql,[lock==='account'?c.account_id:id],
          [()=>a.finalAuthorize(c,finalCheck(s)),()=>authority().finalAuthorize(c,finalCheck(s))],async blocker=>{
            if(cause==='deadline')advance(180000);
            else await blocker.query('UPDATE provider_spend_budget SET revoked_at=$2 WHERE id=$1',[id,now]);
          });
        assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value===false).length,2);
        await literalConservation(c,id,before);assert.equal(await releases(c.job_id),0);
        if(cause==='deadline') {await jobs().maintenance();assert.equal(await releases(c.job_id),1);}
      }
    });
    await t.test('post-lock clock also fences a reclaim that waits past original deadline at UTC midnight',async()=>{
      await reset();now=new Date('2026-10-03T23:57:10Z');const {c,id}=await submitted(),before=await immutableSnapshot(c);advance(30000);
      const results=await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id],
        [()=>jobs().claim(),()=>jobs().claim()],()=>advance(150000));
      assert.equal(now.toISOString(),'2026-10-04T00:00:10.000Z');
      assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value===null).length,2);
      assert.equal((await row(c.job_id)).failure_reason,'attempt_deadline');assert.equal(await releases(c.job_id),1);
      await literalConservation(c,id,before);
      assert.equal(await count("SELECT count(*)::int AS n FROM attempt_budget WHERE day='2026-10-04'"),0);
    });
    await t.test('final send check rejects wrong identity/fence/deletion and unavailable authority with literal false',async()=>{
      await reset();const {c,a}=await submitted({known:false}),s=await sub(c.job_id),check=finalCheck(s);
      assert.equal(await a.finalAuthorize(c,check),true);
      for(const patch of [{submission_id:randomUUID()},{job_id:randomUUID()},{request_sha:'d'.repeat(64)},
        {version:'d'.repeat(64)},{attempt_deadline:new Date(+s.attempt_deadline+1)}])
        assert.equal(await a.finalAuthorize(c,{...check,...patch}),false);
      assert.equal(await a.finalAuthorize({...c,fence:c.fence+1},check),false);
      assert.equal(await a.finalAuthorize({...c,account_id:randomUUID()},check),false);
      assert.equal(await a.finalAuthorize({job_id:randomUUID()},check),false);
      await jobs().deleteUpload(c.account_id,c.upload_id);assert.equal(await a.finalAuthorize(c,check),false);
    });
    await t.test('submission row prevents fixture/controlnet evidence attachment regardless caller mode',async()=>{
      await reset();const {c}=await submitted({status:'succeeded'});
      for(const mode of ['fixture','controlnet']) {const output=fixtureOutput();output.mode=mode;
        assert.equal(await jobs().complete(c.job_id,c.fence,output),false);}
      assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
      assert.equal((await row(c.job_id)).output_key,null);
      // Existing DB mode can only be local until I5; a submitted local-mode job must fail closed.
      await pool.query("UPDATE job SET mode='controlnet' WHERE id=$1",[c.job_id]);
      assert.equal(await jobs().heartbeat(c.job_id,c.fence),false);
      assert.equal((await row(c.job_id)).failure_reason,'submission_binding_mismatch');assert.equal(await releases(c.job_id),1);
    });
    await t.test('no-submission fixture/controlnet local retry remains two tickets/two attempts and valid completion',async()=>{
      for(const mode of ['fixture','controlnet']) {
        await reset();const c=await start();assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),true);
        const fresh=await jobs().claim();assert.equal(fresh.attempt,2);assert.equal(fresh.fence,c.fence+2);
        assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket'),2);
        assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),4);
        const out=fixtureOutput();out.mode=mode;assert.equal(await jobs().complete(c.job_id,fresh.fence,out),true);
        assert.equal((await row(c.job_id)).status,'succeeded');assert.equal((await row(c.job_id)).mode,mode);
        assert.equal(await releases(c.job_id),0);assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
      }
    });
    await t.test('existing caller-owned terminal hold transaction uses same release and honors hosted recovery',async()=>{
      await reset();const {c}=await submitted();
      // Simulate an old generic queued transition for the same durable attempt.
      await pool.query("UPDATE job SET status='queued',lease_until=NULL WHERE id=$1",[c.job_id]);
      await transaction(pool,async client=>{
        await client.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id]);
        await client.query('UPDATE account SET billing_hold=true WHERE id=$1',[c.account_id]);
        await jobs().holdQueued(client,c.account_id);
      });
      const fresh=await jobs().claim();assert.equal(fresh.attempt,1);assert.equal(await releases(c.job_id),0);
    });
  }finally {
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
