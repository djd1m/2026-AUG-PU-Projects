import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { migrate } from '../scripts/migrate.js';
import { createProviderSubmissions } from '../web/provider-submissions.js';
import { fixtureOutput } from './job-fixtures.js';

// Real PG only. No network transport, HTTP listener, DB fake or paid prediction.
test('F07 I1 real PostgreSQL immutable one-shot submission and spend authority',async t=>{
  assert.match(process.versions.node,/^22\./,'Node22 runtime required');
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f07_'+randomBytes(8).toString('hex'),appName=schema+'_authority';let pool;
  const config={runtime:'test',platformDailyLimit:200,accountDailyLimit:20};let now;
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);
    db.searchParams.set('options',`-c search_path=${schema}`);db.searchParams.set('application_name',appName);
    pool=createPool(db.href);
    // Representative pre-007 fixture/controlnet evidence, then actual upgrade.
    await pool.query('CREATE TABLE schema_migration(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const [index,file] of ['001-foundation.sql','002-generation.sql','003-quality.sql','004-payments.sql','005-attribution.sql','006-sharing.sql'].entries()) {
      await transaction(pool,async c=>{await c.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
        await c.query('INSERT INTO schema_migration(version) VALUES($1)',[index+1]);});
    }
    now=new Date('2026-10-03T12:00:00Z');
    const jobs=()=>createJobs(pool,config,{trustedClock:()=>now});
    const api=(limits={})=>createProviderSubmissions(pool,{...config,...limits},{trustedClock:()=>now});
    const count=async(sql,values=[])=>(await pool.query(sql,values)).rows[0].n;
    const job=async id=>(await pool.query('SELECT * FROM job WHERE id=$1',[id])).rows[0];
    const submission=async id=>(await pool.query('SELECT * FROM provider_submission WHERE job_id=$1',[id])).rows[0];
    const reserved=async id=>(await pool.query('SELECT reserved_microusd FROM provider_spend_budget WHERE id=$1',[id])).rows[0].reserved_microusd;
    async function owner() {
      const id=randomUUID(),upload=randomUUID();
      await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[id,id+'@example.test','synthetic-unused-hash']);
      await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,5,'purchase',$3)",[randomUUID(),id,randomUUID()]);
      await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,640,480,'image/webp')",[upload,id,'a'.repeat(64)]);
      return {id,upload};
    }
    async function start(o=undefined) {
      o??=await owner();const q=jobs();const r=await q.reserve(o.id,{upload_id:o.upload,style:'warm',idempotency_key:randomUUID()});
      const claim=await q.claim();assert.equal(claim.job_id,r.job_id);return claim;
    }
    for(const mode of ['fixture','controlnet']) {
      const c=await start(),out=fixtureOutput();out.mode=mode;
      if(mode==='controlnet')out.evidence.model_revisions={sd:'1'.repeat(40),controlnet:'2'.repeat(40),depth:'3'.repeat(40)};
      assert.equal(await jobs().complete(c.job_id,c.fence,out),true);
    }
    const legacy=(await pool.query('SELECT * FROM generation_evidence ORDER BY job_id')).rows;
    await migrate(pool);await migrate(pool);
    assert.deepEqual((await pool.query('SELECT * FROM generation_evidence ORDER BY job_id')).rows,legacy);
    assert.equal(await count('SELECT count(*)::int AS n FROM schema_migration'),7);
    assert.equal(await count('SELECT count(*)::int AS n FROM provider_spend_budget'),0);
    for(const row of legacy)await assert.rejects(pool.query('UPDATE generation_evidence SET seed=2 WHERE job_id=$1',[row.job_id]),/immutable/);
    async function reset() {
      await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');now=new Date('2026-10-03T12:00:00Z');
    }
    async function envelope(ceiling=12000000,{windowStart,windowEnd}={}) {
      const id=randomUUID();
      await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,authorization_sha,
        privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,
        window_start,window_end,ceiling_microusd,per_create_ceiling_microusd)
        VALUES($1,$2,'jagilley/controlnet-depth2img',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,300000)`,
        [id,randomUUID(),'1'.repeat(64),'2'.repeat(64),'3'.repeat(64),'4'.repeat(64),'5'.repeat(64),'6'.repeat(64),'7'.repeat(64),
          windowStart??new Date(now.getTime()-86400000),windowEnd??new Date(now.getTime()+86400000),ceiling]);return id;
    }
    const binding=id=>({model:'jagilley/controlnet-depth2img',version:'1'.repeat(64),spend_budget_id:id,
      contract_sha:'2'.repeat(64),source_input_sha:'a'.repeat(64),transmitted_input_sha:'b'.repeat(64),request_sha:'c'.repeat(64),
      authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),license_acceptance_sha:'5'.repeat(64),
      safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),
      transform:{original_width:640,original_height:480,canvas_width:512,canvas_height:512,content_rect:{x:0,y:64,width:512,height:384}}});
    const prediction=(id='prediction_1',status)=>({request_sha:'c'.repeat(64),prediction_id:id,version:'1'.repeat(64),...(status?{status}:{})});
    const expectCode=code=>error=>error.code===code&&error.message===code;
    async function blockedRace(sql,values,actions,beforeRelease=()=>{}) {
      const blocker=await pool.connect();let pending;
      try {
        await blocker.query('BEGIN');await blocker.query(sql,values);
        pending=Promise.allSettled(actions.map(action=>action()));
        const until=Date.now()+3500;let waiting=0;
        do {
          waiting=Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n);
          if(waiting>=2)break;
          await new Promise(resolve=>setTimeout(resolve,10));
        }while(Date.now()<until);
        assert.ok(waiting>=2,'both real PG contenders reached a lock barrier');
        await beforeRelease();
        await blocker.query('COMMIT');return await pending;
      }finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
    }
    await t.test('two CAS contenders produce literal one authorization and one spend reservation',async()=>{
      await reset();const c=await start(),id=await envelope(),b=binding(id),a=api();
      const results=await blockedRace('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id],
        [()=>a.authorize(c,b),()=>api().authorize(c,b)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
      assert.equal(results.filter(r=>r.value.authorized).length,1);
      assert.equal(results.filter(r=>r.value.code==='submission_no_replay').length,1);
      assert.equal(await reserved(id),'300000');assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),1);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
      assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='reserve'"),1);
      assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release'"),0);
    });
    await t.test('last envelope reservation races across accounts; loser has zero authorization',async()=>{
      await reset();const a=await start(),b=await start(),id=await envelope(300000);
      const results=await blockedRace('SELECT id FROM provider_spend_budget WHERE id=$1 FOR UPDATE',[id],
        [()=>api().authorize(a,binding(id)),()=>api().authorize(b,binding(id))]);
      assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.authorized).length,1);
      assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='provider_spend_exhausted').length,1);
      assert.equal(await reserved(id),'300000');assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),1);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),4);
    });
    await t.test('missing zero revoked expired and mismatched authorizations fail closed atomically',async()=>{
      for(const kind of ['missing','zero','revoked','expired','future','model','privacy','contract','exhausted']) {
        await reset();const c=await start(),id=kind==='missing'?randomUUID():await envelope(kind==='zero'?0:kind==='exhausted'?299999:12000000,
          kind==='expired'?{windowEnd:now}:kind==='future'?{windowStart:new Date(now.getTime()+1000)}:{}),b=binding(id);
        if(kind==='revoked')await pool.query('UPDATE provider_spend_budget SET revoked_at=$2 WHERE id=$1',[id,now]);
        if(kind==='model')b.model='other/model';if(kind==='privacy')b.privacy_acceptance_sha='8'.repeat(64);if(kind==='contract')b.contract_sha='8'.repeat(64);
        await assert.rejects(api().authorize(c,b),expectCode(['model','privacy','contract'].includes(kind)?'provider_authorization_mismatch':kind==='exhausted'?'provider_spend_exhausted':'provider_spend_unauthorized'));
        assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
        if(kind!=='missing')assert.equal(await reserved(id),'0');
      }
    });
    await t.test('expired revoked deleted held wrong input and missing consumed ticket deny before authorization',async()=>{
      for(const kind of ['lease','attempt','hard','fence','job_deleted','upload_deleted','held','input','ticket','deadline','owner']) {
        await reset();const c=await start(),id=await envelope(),b=binding(id);
        if(kind==='lease')now=new Date(now.getTime()+30000);
        if(kind==='attempt')now=new Date(now.getTime()+180000);
        if(kind==='hard')now=new Date(now.getTime()+360000);
        if(kind==='fence')await pool.query('UPDATE job SET fence=fence+1 WHERE id=$1',[c.job_id]);
        if(kind==='job_deleted')await pool.query('UPDATE job SET deleted_at=$2 WHERE id=$1',[c.job_id,now]);
        if(kind==='upload_deleted')await pool.query('UPDATE upload SET deleted_at=$2 WHERE id=$1',[c.upload_id,now]);
        if(kind==='held')await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[c.account_id]);
        if(kind==='input')b.source_input_sha='8'.repeat(64);
        if(kind==='ticket')await pool.query('UPDATE attempt_ticket SET consumed_at=NULL WHERE job_id=$1',[c.job_id]);
        if(kind==='deadline')c.attempt_deadline=new Date(c.attempt_deadline.getTime()+1);
        if(kind==='owner')c.account_id=(await owner()).id;
        const code=kind==='held'?'submission_billing_hold':['upload_deleted','input'].includes(kind)?'submission_input_revoked':kind==='ticket'?'submission_ticket_mismatch':kind==='owner'?'submission_not_found':'submission_fence_expired';
        await assert.rejects(api().authorize(c,b),expectCode(code));
        assert.equal(await reserved(id),'0');assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
      }
    });
    await t.test('hold commits at account barrier and blocks both contenders with zero reservations',async()=>{
      await reset();const c=await start(),id=await envelope();
      const results=await blockedRace('UPDATE account SET billing_hold=true WHERE id=$1',[c.account_id],
        [()=>api().authorize(c,binding(id)),()=>api().authorize(c,binding(id))]);
      assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='submission_billing_hold').length,2);
      assert.equal(await reserved(id),'0');assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
    });
    await t.test('lease expiry while waiting on envelope denies both contenders before CAS',async()=>{
      await reset();const c=await start(),id=await envelope();
      const results=await blockedRace('SELECT id FROM provider_spend_budget WHERE id=$1 FOR UPDATE',[id],
        [()=>api().authorize(c,binding(id)),()=>api().authorize(c,binding(id))],()=>{now=new Date(now.getTime()+30000);});
      assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='submission_fence_expired').length,2);
      assert.equal(await reserved(id),'0');assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
    });
    await t.test('CAS-stage SQL failure rolls back reservation identity and midnight ticket changes',async()=>{
      await reset();now=new Date('2026-10-03T23:59:50Z');const c=await start(),id=await envelope();now=new Date(now.getTime()+20000);
      await pool.query(`CREATE FUNCTION reject_f07_cas() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.state='submitting' THEN RAISE EXCEPTION 'injected CAS failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_f07_cas BEFORE UPDATE ON provider_submission FOR EACH ROW EXECUTE FUNCTION reject_f07_cas()`);
      try {await assert.rejects(api().authorize(c,binding(id)),/injected CAS failure/);}
      finally {await pool.query('DROP TRIGGER reject_f07_cas ON provider_submission; DROP FUNCTION reject_f07_cas()');}
      assert.equal(await reserved(id),'0');assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
      assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket'),1);
      assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE superseded'),0);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
      assert.equal((await api().authorize(c,binding(id))).authorized,true);
      assert.equal(await reserved(id),'300000');assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),4);
    });
    await t.test('midnight submission replaces consumed ticket once without moving attempt or deadline',async()=>{
      await reset();now=new Date('2026-10-03T23:59:50Z');const c=await start(),id=await envelope(),before=await job(c.job_id);
      now=new Date(now.getTime()+20000);const result=await api().authorize(c,binding(id));
      assert.equal(result.authorized,true);assert.notEqual(result.submission.attempt_ticket_id,before.first_ticket_id);
      assert.equal((await job(c.job_id)).attempts,1);assert.equal((await job(c.job_id)).attempt_deadline.getTime(),before.attempt_deadline.getTime());
      assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket'),2);
      assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE superseded'),1);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),4);
      assert.equal((await api().authorize(c,binding(id))).authorized,false);
      assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),4);
    });
    await t.test('midnight ticket exhaustion and failed envelope admission leave original ticket intact',async()=>{
      for(const exhausted of [true,false]) {
        await reset();now=new Date('2026-10-03T23:59:50Z');const c=await start(),before=await job(c.job_id);
        const id=exhausted?await envelope():randomUUID();now=new Date(now.getTime()+20000);
        if(exhausted)await pool.query("INSERT INTO attempt_budget(bucket,owner,day,count) VALUES('platform','platform','2026-10-04',200)");
        await assert.rejects(api().authorize(c,binding(id)),expectCode(exhausted?'submission_ticket_exhausted':'provider_spend_unauthorized'));
        assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
        assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket'),1);
        assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket WHERE superseded'),0);
        assert.equal((await job(c.job_id)).first_ticket_id,before.first_ticket_id);
        assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),exhausted?202:2);
      }
    });
    await t.test('immutable binding mismatch and direct SQL changes reject; spend never refunds',async()=>{
      await reset();const c=await start(),id=await envelope(),b=binding(id);await api().authorize(c,b);
      for(const key of ['version','contract_sha','source_input_sha','transmitted_input_sha','request_sha','privacy_acceptance_sha'])
        await assert.rejects(api().authorize(c,{...b,[key]:'8'.repeat(64)}),expectCode('submission_binding_mismatch'));
      for(const [key,value] of [['model','other/model'],['version','8'.repeat(64)],['request_sha','8'.repeat(64)],
        ['source_input_sha','8'.repeat(64)],['transmitted_input_sha','8'.repeat(64)],['contract_sha','8'.repeat(64)],
        ['attempt_number',2],['submission_fence',2],['attempt_ticket_id',randomUUID()],['spend_budget_id',randomUUID()],
        ['privacy_acceptance_sha','8'.repeat(64)],['authorization_sha','8'.repeat(64)],['license_acceptance_sha','8'.repeat(64)],
        ['safety_acceptance_sha','8'.repeat(64)],['billing_acceptance_sha','8'.repeat(64)],['spend_reserved_microusd',1],
        ['attempt_deadline',new Date(c.attempt_deadline.getTime()+1)],['transform',JSON.stringify({...b.transform,original_width:641})]])
        await assert.rejects(pool.query(`UPDATE provider_submission SET ${key}=$2 WHERE job_id=$1`,[c.job_id,value]),/immutable/);
      await assert.rejects(pool.query("UPDATE provider_submission SET state='preflight' WHERE job_id=$1",[c.job_id]),/regression/);
      await assert.rejects(pool.query('DELETE FROM provider_submission WHERE job_id=$1',[c.job_id]),/immutable/);
      const s=await submission(c.job_id),copy={...s,id:randomUUID(),state:'preflight',submitting_at:null};
      await assert.rejects(pool.query('INSERT INTO provider_submission SELECT * FROM jsonb_populate_record(NULL::provider_submission,$1::jsonb)',
        [JSON.stringify(copy)]),e=>e.code==='23505');
      const other=await start();copy.job_id=other.job_id;
      await assert.rejects(pool.query('INSERT INTO provider_submission SELECT * FROM jsonb_populate_record(NULL::provider_submission,$1::jsonb)',
        [JSON.stringify(copy)]),/binding mismatch/);
      assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),1);
      for(const [key,value] of [['reserved_microusd',0],['ceiling_microusd',24000000],['privacy_acceptance_sha','8'.repeat(64)],
        ['authorization_id',randomUUID()],['per_create_ceiling_microusd',1],['window_end',new Date(now.getTime()+172800000)]])
        await assert.rejects(pool.query(`UPDATE provider_spend_budget SET ${key}=$2 WHERE id=$1`,[id,value]),/immutable/);
      await pool.query('UPDATE provider_spend_budget SET revoked_at=$2 WHERE id=$1',[id,now]);
      await assert.rejects(pool.query('UPDATE provider_spend_budget SET revoked_at=NULL WHERE id=$1',[id]),/immutable/);
      await assert.rejects(pool.query('DELETE FROM provider_spend_budget WHERE id=$1',[id]),/immutable/);
      assert.equal(await reserved(id),'300000');
    });
    await t.test('prediction unique conflict is quarantined and known ID cannot be overwritten',async()=>{
      await reset();const a=await start(),b=await start(),id=await envelope();
      await api().authorize(a,binding(id));await api().authorize(b,binding(id));
      assert.equal((await api().bindPrediction(a.job_id,prediction())).recorded,true);
      const conflict=await api().bindPrediction(b.job_id,prediction());
      assert.equal(conflict.recorded,false);assert.equal(conflict.code,'prediction_identity_conflict');
      assert.equal((await submission(b.job_id)).prediction_id,null);assert.equal((await submission(b.job_id)).cleanup_state,'unresolved');
      assert.ok((await submission(b.job_id)).identity_conflict_at);
      assert.equal((await api().bindPrediction(a.job_id,prediction('different'))).recorded,false);
      assert.equal((await submission(a.job_id)).prediction_id,'prediction_1');
      const quarantinedAt=(await submission(a.job_id)).identity_conflict_at;
      await api().bindPrediction(a.job_id,prediction());
      assert.equal((await submission(a.job_id)).identity_conflict_at.getTime(),quarantinedAt.getTime());
      await assert.rejects(pool.query('UPDATE provider_submission SET identity_conflict_at=NULL WHERE job_id=$1',[a.job_id]),/immutable/);
      await assert.rejects(pool.query("UPDATE provider_submission SET prediction_id='different' WHERE job_id=$1",[a.job_id]),/immutable/);
      assert.equal(await reserved(id),'600000');
    });
    await t.test('late known ID records cleanup identity after expiry deletion or failure without job revival',async()=>{
      for(const kind of ['expiry','deleted','failed']) {
        await reset();const c=await start(),id=await envelope();await api().authorize(c,binding(id));
        if(kind==='expiry')now=new Date(now.getTime()+30000);
        if(kind==='deleted')await jobs().deleteUpload(c.account_id,c.upload_id);
        if(kind==='failed')assert.equal(await jobs().fail(c.job_id,c.fence),true);
        const before=await job(c.job_id);const result=await api().bindPrediction(c.job_id,prediction());
        assert.equal(result.recorded,true);assert.equal(result.cleanup_required,true);assert.equal(result.completion_authorized,false);
        assert.deepEqual(await job(c.job_id),before);assert.equal((await submission(c.job_id)).cleanup_state,'needed');
        assert.equal(await reserved(id),'300000');
      }
    });
    await t.test('ambiguous observation is nonreplayable; known statuses are monotonic and never revive job',async()=>{
      await reset();const c=await start(),id=await envelope(),a=api();await a.authorize(c,binding(id));
      assert.deepEqual(await a.markAmbiguous(c.job_id,'c'.repeat(64)),{changed:true,state:'ambiguous'});
      assert.deepEqual(await a.markAmbiguous(c.job_id,'c'.repeat(64)),{changed:false,state:'ambiguous'});
      assert.equal((await a.authorize(c,binding(id))).authorized,false);
      await a.bindPrediction(c.job_id,prediction());
      assert.deepEqual(await a.observe(c.job_id,prediction('prediction_1','processing')),{changed:true,status:'processing'});
      assert.deepEqual(await a.observe(c.job_id,prediction('prediction_1','starting')),{changed:false,status:'processing'});
      await assert.rejects(pool.query("UPDATE provider_submission SET provider_status='starting' WHERE job_id=$1",[c.job_id]),/regression/);
      assert.equal((await a.observe(c.job_id,prediction('prediction_1','succeeded'))).changed,true);
      assert.equal((await a.observe(c.job_id,prediction('prediction_1','succeeded'))).changed,false);
      assert.equal((await a.observe(c.job_id,prediction('prediction_1','failed'))).status,'succeeded');
      await assert.rejects(a.observe(c.job_id,prediction('different','succeeded')),expectCode('prediction_identity_conflict'));
      await assert.rejects(a.observe(c.job_id,prediction('prediction_1','unknown')),expectCode('invalid_prediction_status'));
      await assert.rejects(pool.query("UPDATE provider_submission SET provider_status='processing' WHERE job_id=$1",[c.job_id]),/regression/);
      assert.equal((await a.authorize(c,binding(id))).authorized,false);
      assert.equal((await job(c.job_id)).status,'running');assert.equal((await job(c.job_id)).output_key,null);
      assert.equal(await reserved(id),'300000');assert.equal(await count('SELECT sum(count)::int AS n FROM attempt_budget'),2);
    });
    await t.test('strictly local preflight failure can retry without a false immutable binding',async()=>{
      await reset();const c=await start(),id=await envelope(),bad=binding(id);bad.privacy_acceptance_sha='8'.repeat(64);
      await assert.rejects(api().authorize(c,bad),expectCode('provider_authorization_mismatch'));
      assert.equal(await count('SELECT count(*)::int AS n FROM provider_submission'),0);
      assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),true);
      const retry=await jobs().claim();assert.equal(retry.attempt,2);
      assert.equal((await api().authorize(retry,binding(id))).authorized,true);
      assert.equal((await submission(c.job_id)).attempt_number,2);assert.equal(await reserved(id),'300000');
    });
  }finally {
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(()=>{});await admin.end();
  }
});
