import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createProviderSubmissions } from '../web/provider-submissions.js';
import { canonical,sha } from '../web/generation.js';
import { migrate } from '../scripts/migrate.js';
import { fixtureOutput } from './job-fixtures.js';
import { hostedOutput,refreshConfig,transform,evidenceConfig } from './replicate-evidence-fixtures.js';
import { REPLICATE_MODEL,REPLICATE_VERSION,REPLICATE_CONTRACT_SHA } from '../web/replicate.js';

// Parent-only real-PG gate. No provider, HTTP, Docker, schema fake or skip path.
test('F07 I5a atomic hosted evidence on dedicated PostgreSQL16',async t=>{
  assert.match(process.versions.node,/^22\./,'Node22 required');
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f07_evidence_'+randomBytes(8).toString('hex'),appName=schema+'_completion';let pool,now;
  const jobs=(config={})=>createJobs(pool,{...evidenceConfig,...config},{trustedClock:()=>now});
  const authority=()=>createProviderSubmissions(pool,evidenceConfig,{trustedClock:()=>now});
  const row=async id=>(await pool.query('SELECT * FROM job WHERE id=$1',[id])).rows[0];
  const sub=async id=>(await pool.query('SELECT * FROM provider_submission WHERE job_id=$1',[id])).rows[0];
  const count=async(sql,args=[])=>(await pool.query(sql,args)).rows[0].n;
  const reset=async()=>{await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');now=new Date('2026-10-03T12:00:00Z');};
  const advance=ms=>{now=new Date(+now+ms);};
  const binding=id=>({model:REPLICATE_MODEL,version:REPLICATE_VERSION,contract_sha:REPLICATE_CONTRACT_SHA,
    spend_budget_id:id,source_input_sha:'a'.repeat(64),transmitted_input_sha:'b'.repeat(64),request_sha:'c'.repeat(64),
    authorization_sha:'3'.repeat(64),privacy_acceptance_sha:'4'.repeat(64),license_acceptance_sha:'5'.repeat(64),
    safety_acceptance_sha:'6'.repeat(64),billing_acceptance_sha:'7'.repeat(64),transform:structuredClone(transform)});
  const identity=(status)=>({request_sha:'c'.repeat(64),prediction_id:'prediction_1',version:REPLICATE_VERSION,...(status?{status}:{})});
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
  async function outputFor(c) {
    const j=await row(c.job_id),s=await sub(c.job_id),ticket=(await pool.query('SELECT * FROM attempt_ticket WHERE id=$1',[j.first_ticket_id])).rows[0];
    return hostedOutput({job_id:j.id,submission_id:s?.id,prediction_id:s?.prediction_id??'prediction_1',
      created_at:j.created_at,consumed_at:ticket.consumed_at,local_started_at:now,verified_at:now});
  }
  async function submitted({known=true,status='succeeded'}={}) {
    const c=await start(),id=await envelope(),a=authority();assert.equal((await a.authorize(c,binding(id))).authorized,true);
    if(known) {await a.bindPrediction(c.job_id,identity());if(status)await a.observe(c.job_id,identity(status));}
    advance(1000);return {c,id,a,output:await outputFor(c)};
  }
  async function conservation() {
    return {tickets:(await pool.query('SELECT * FROM attempt_ticket ORDER BY id')).rows,
      counters:(await pool.query('SELECT * FROM attempt_budget ORDER BY day,bucket,owner')).rows,
      credit:(await pool.query('SELECT * FROM credit_ledger ORDER BY id')).rows,
      spend:(await pool.query('SELECT * FROM provider_spend_budget ORDER BY id')).rows};
  }
  async function allState() {
    return {...await conservation(),jobs:(await pool.query('SELECT * FROM job ORDER BY id')).rows,
      uploads:(await pool.query('SELECT * FROM upload ORDER BY id')).rows,
      submissions:(await pool.query('SELECT * FROM provider_submission ORDER BY id')).rows,
      evidence:(await pool.query('SELECT * FROM generation_evidence ORDER BY job_id')).rows};
  }
  async function deny(c,output,config={}) {
    const before=await allState();assert.equal(await jobs(config).complete(c.job_id,c.fence,output),false);
    assert.deepEqual(await allState(),before,'denial must have zero DB effects');
  }
  async function terminalState(c,before,reason) {
    const after=await allState(),j=after.jobs.find(j=>j.id===c.job_id);
    // First oracle is the missing lifecycle effect, before reason or conservation.
    assert.equal(j.status,'failed','current-fence completion must terminalize');
    const original=before.jobs.find(j=>j.id===c.job_id);
    assert.equal(j.fence,original.fence+1);assert.equal(j.lease_until,null);
    assert.equal(j.failure_reason,reason);assert.equal(j.reserved,false);
    const releases=after.credit.filter(e=>e.kind==='release'&&e.reference===c.job_id);
    assert.equal(releases.length,1,'exactly one unique customer credit release');
    const release=releases[0];assert.match(release.id,/^[0-9a-f-]{36}$/);
    assert.deepEqual(release,{id:release.id,account_id:c.account_id,delta:1,kind:'release',
      reference:c.job_id,created_at:now});
    const expected=structuredClone(before),ej=expected.jobs.find(j=>j.id===c.job_id),
      es=expected.submissions.find(s=>s.job_id===c.job_id);
    Object.assign(ej,{status:'failed',failure_reason:reason,fence:ej.fence+1,lease_until:null,
      finished_at:now,reserved:false});
    if(es.cleanup_state==='none')es.cleanup_state='needed';
    expected.credit.push(release);expected.credit.sort((a,b)=>a.id.localeCompare(b.id));
    // Literal original ticket/attempt/counter/spend, output/evidence and cleanup identity.
    assert.deepEqual(after,expected,'only terminal fields, cleanup marker and customer release may change');
    assert.equal(await jobs().complete(c.job_id,c.fence,c.output),false);
    assert.equal(await jobs().complete(c.job_id,j.fence,c.output),false);
    assert.equal(await jobs().heartbeat(c.job_id,c.fence),false);
    assert.equal(await jobs().fail(c.job_id,j.fence),false);
    assert.deepEqual(await allState(),after,'repeated operations cannot release twice');
  }
  async function terminalDeny(c,output,reason) {
    const before=await allState();assert.equal(await jobs().complete(c.job_id,c.fence,output),false);
    await terminalState({...c,output},before,reason);
  }
  async function barrier(sql,args,actions,beforeRelease=()=>{}) {
    const blocker=await pool.connect();let pending;
    try {
      await blocker.query('BEGIN');await blocker.query(sql,args);pending=Promise.allSettled(actions.map(fn=>fn()));
      const until=Date.now()+3500;let waiting=0;
      do {
        waiting=Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n);
        if(waiting>=actions.length)break;await new Promise(resolve=>setTimeout(resolve,10));
      }while(Date.now()<until);
      assert.ok(waiting>=actions.length,'all actual PG contenders reached lock barrier');
      await beforeRelease(blocker);await blocker.query('COMMIT');return await pending;
    }finally {await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
  }
  async function insertEvidence(c,output) {
    const e=output.evidence,ce=canonical({...e,job_id:c.job_id,output_key:output.output_key,mode:output.mode});
    return pool.query(`INSERT INTO generation_evidence(job_id,input_sha,output_sha,depth_sha,config_sha,model_revisions,
      seed,mode,worker_source_revision,hardware,queue_ms,inference_ms,warm,created_at,canonical_evidence,evidence_sha)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [c.job_id,e.input_sha,e.output_sha,e.depth_sha,e.config_sha,e.model_revisions??null,e.seed,output.mode,
        e.worker_source_revision,e.hardware,e.queue_ms,e.inference_ms,e.warm,now,ce,sha(ce)]);
  }
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    db.searchParams.set('application_name',appName);pool=createPool(db.href);
    await pool.query('CREATE TABLE schema_migration(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for(const [i,file] of ['001-foundation.sql','002-generation.sql','003-quality.sql','004-payments.sql','005-attribution.sql','006-sharing.sql','007-replicate.sql'].entries()) {
      await transaction(pool,async c=>{await c.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
        await c.query('INSERT INTO schema_migration(version) VALUES($1)',[i+1]);});
    }
    await t.test('migration retains all historical fixture/controlnet values and hashes, idempotence and immutability',async()=>{
      now=new Date('2026-10-03T12:00:00Z');
      for(const mode of ['fixture','controlnet']) {
        const c=await start(),output=fixtureOutput();output.mode=mode;
        assert.equal(await jobs().complete(c.job_id,c.fence,output),true);
      }
      const old=(await pool.query('SELECT * FROM generation_evidence ORDER BY job_id')).rows;
      const oldJobs=(await pool.query('SELECT * FROM job ORDER BY id')).rows;
      await migrate(pool);await migrate(pool);
      assert.equal(await count('SELECT count(*)::int AS n FROM schema_migration'),8);
      assert.deepEqual((await pool.query('SELECT * FROM generation_evidence ORDER BY job_id')).rows,old);
      assert.deepEqual((await pool.query('SELECT * FROM job ORDER BY id')).rows,oldJobs);
      for(const e of old) {
        assert.equal(e.evidence_sha,sha(canonical(e.canonical_evidence)));
        await assert.rejects(pool.query('UPDATE generation_evidence SET hardware=NULL WHERE job_id=$1',[e.job_id]),/immutable/);
        await assert.rejects(pool.query('DELETE FROM generation_evidence WHERE job_id=$1',[e.job_id]),/immutable/);
      }
    });
    await t.test('hosted atomic winner binds null metrics; duplicate immutable evidence and hold-after-CAS preserve credit/spend',async()=>{
      await reset();const {c,output}=await submitted(),before=await conservation();
      await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[c.account_id]);
      assert.equal(await jobs().complete(c.job_id,c.fence,output),true);
      const j=await row(c.job_id),e=(await pool.query('SELECT * FROM generation_evidence WHERE job_id=$1',[c.job_id])).rows[0];
      assert.equal(j.status,'succeeded');assert.equal(j.mode,'replicate');assert.equal(j.quality,'unverified');assert.equal(j.reserved,true);
      assert.equal(j.output_key,output.output_key);assert.equal(j.finished_at.getTime(),now.getTime());assert.equal(j.lease_until,null);
      assert.equal(e.evidence_sha,sha(canonical(e.canonical_evidence)));assert.equal(e.config_sha,output.evidence.config_sha);
      assert.equal(e.canonical_evidence.submission_id,(await sub(c.job_id)).id);
      for(const k of ['model_revisions','hardware','warm','inference_ms'])assert.equal(e[k],null);
      assert.equal(e.canonical_evidence.billing_actual_microusd,null);assert.deepEqual(await conservation(),before);
      await deny(c,output);
      await assert.rejects(insertEvidence(c,output));
      await assert.rejects(pool.query('UPDATE generation_evidence SET seed=43 WHERE job_id=$1',[c.job_id]),/immutable/);
      await assert.rejects(pool.query('DELETE FROM generation_evidence WHERE job_id=$1',[c.job_id]),/immutable/);
    });
    await t.test('two genuine completion contenders commit exactly one result and no ticket/credit/spend changes',async()=>{
      await reset();const {c,output}=await submitted(),other=structuredClone(output),before=await conservation();
      other.output_key=randomUUID();other.evidence.artifact_key=other.output_key;
      const results=await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id],
        [()=>jobs().complete(c.job_id,c.fence,output),()=>jobs().complete(c.job_id,c.fence,other)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
      assert.deepEqual(results.map(r=>r.value).sort(),[false,true]);
      assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),1);
      assert.ok([output.output_key,other.output_key].includes((await row(c.job_id)).output_key));
      assert.deepEqual(await conservation(),before);
    });
    await t.test('clock after account/job/submission lock waits preserves lease-only denial and terminalizes original attempt/hard deadline',async()=>{
      for(const lock of ['account','job','submission'])for(const deadline of ['lease','attempt','hard']) {
        await reset();const {c,output}=await submitted();
        if(deadline==='hard')await pool.query('UPDATE job SET hard_deadline=$2 WHERE id=$1',[c.job_id,new Date(+now+1000)]);
        const before=await allState(),table=lock==='submission'?'provider_submission':lock,
          id=lock==='account'?c.account_id:lock==='job'?c.job_id:(await sub(c.job_id)).id;
        const results=await barrier(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`,[id],
          [()=>jobs().complete(c.job_id,c.fence,output)],()=>advance(deadline==='attempt'?179000:deadline==='lease'?29000:1000));
        assert.equal(results[0].status,'fulfilled');assert.equal(results[0].value,false);
        if(deadline==='lease')assert.deepEqual(await allState(),before);
        else await terminalState({...c,output},before,deadline+'_deadline');
      }
    });
    await t.test('reclaim current fence succeeds privately with original ticket/deadlines; stale old fence has no effect',async()=>{
      await reset();const {c}=await submitted(),before=await conservation();advance(29000);
      const fresh=await jobs().claim();assert.equal(fresh.fence,c.fence+1);assert.equal(fresh.provider_recovery,true);
      const output=await outputFor(fresh);await deny(c,output);
      assert.equal(await jobs().complete(fresh.job_id,fresh.fence,output),true);
      const j=await row(c.job_id);assert.equal(j.attempt_deadline.getTime(),c.attempt_deadline.getTime());
      assert.equal(j.hard_deadline.getTime(),c.hard_deadline.getTime());assert.equal(j.attempts,1);
      assert.deepEqual(await conservation(),before);
    });
    await t.test('stale fence after new owner cannot terminalize at original attempt/hard deadline',async()=>{
      for(const deadline of ['attempt','hard']) {
        await reset();const {c}=await submitted();advance(29000);
        const fresh=await jobs().claim();assert.equal(fresh.fence,c.fence+1);
        const output=await outputFor(fresh);
        if(deadline==='hard')await pool.query('UPDATE job SET hard_deadline=$2 WHERE id=$1',[c.job_id,now]);
        else now=new Date(c.attempt_deadline);
        await deny(c,output);
        await terminalDeny(fresh,output,deadline+'_deadline');
      }
    });
    await t.test('valid local output on expired submitted job restores lifecycle before mode denial',async()=>{
      for(const mode of ['fixture','controlnet'])for(const deadline of ['attempt','hard']) {
        await reset();const {c}=await submitted(),output=fixtureOutput();output.mode=mode;
        if(deadline==='hard')await pool.query('UPDATE job SET hard_deadline=$2 WHERE id=$1',[c.job_id,now]);
        else now=new Date(c.attempt_deadline);
        await terminalDeny(c,output,deadline+'_deadline');
      }
    });
    await t.test('deleted input/job and binding changes retain terminal causes; healthy geometry mismatch denies purely',async()=>{
      for(const kind of ['delete','input_deleted','hash','width','owner','mode','ticket','consumed','first_ticket','attempt','deadline','job_deleted']) {
        await reset();const {c,output}=await submitted();
        if(kind==='delete')await jobs().deleteUpload(c.account_id,c.upload_id);
        if(kind==='input_deleted')await pool.query('UPDATE upload SET deleted_at=$2 WHERE id=$1',[c.upload_id,now]);
        if(kind==='hash')await pool.query('UPDATE upload SET sha256=$2 WHERE id=$1',[c.upload_id,'8'.repeat(64)]);
        if(kind==='width')await pool.query('UPDATE upload SET width=641 WHERE id=$1',[c.upload_id]);
        if(kind==='owner')await pool.query('UPDATE upload SET account_id=$2 WHERE id=$1',[c.upload_id,(await owner()).id]);
        if(kind==='mode')await pool.query("UPDATE job SET mode='controlnet' WHERE id=$1",[c.job_id]);
        if(kind==='ticket')await pool.query('UPDATE attempt_ticket SET superseded=true WHERE job_id=$1',[c.job_id]);
        if(kind==='consumed')await pool.query('UPDATE attempt_ticket SET consumed_at=NULL WHERE job_id=$1',[c.job_id]);
        if(kind==='first_ticket')await pool.query('UPDATE job SET first_ticket_id=NULL WHERE id=$1',[c.job_id]);
        if(kind==='attempt')await pool.query('UPDATE job SET attempts=2 WHERE id=$1',[c.job_id]);
        if(kind==='deadline')await pool.query("UPDATE job SET attempt_deadline=attempt_deadline+interval '1 second' WHERE id=$1",[c.job_id]);
        if(kind==='job_deleted')await pool.query('UPDATE job SET deleted_at=$2 WHERE id=$1',[c.job_id,now]);
        if(['input_deleted','hash','owner'].includes(kind))await terminalDeny(c,output,'submission_input_revoked');
        else if(['mode','ticket','consumed','first_ticket','attempt','deadline'].includes(kind))
          await terminalDeny(c,output,'submission_binding_mismatch');
        else await deny(c,output);
      }
    });
    await t.test('every cleanup designation, quarantine and nonsucceeded/unknown provider status excludes completion',async()=>{
      for(const cleanup of ['needed','claimed','done','unresolved']) {
        await reset();const {c,output}=await submitted();
        await pool.query('UPDATE provider_submission SET cleanup_state=$2 WHERE job_id=$1',[c.job_id,cleanup]);
        await terminalDeny(c,output,'submission_binding_mismatch');
      }
      await reset();const conflict=await submitted();await conflict.a.bindPrediction(conflict.c.job_id,{...identity(),prediction_id:'conflicting'});
      await terminalDeny(conflict.c,conflict.output,'prediction_identity_conflict');
      for(const status of ['starting','processing','failed','canceled','aborted',null]) {
        await reset();const {c,output}=await submitted({status});
        if(['failed','canceled','aborted'].includes(status))await terminalDeny(c,output,'provider_failed');
        else await deny(c,output);
      }
      await reset();const missing=await submitted({known:false});await deny(missing.c,missing.output);
    });
    await t.test('identity/input/request/transform and separately verified worker settings fail closed',async()=>{
      for(const patch of [{job_id:randomUUID()},{submission_id:randomUUID()},{prediction_id:'wrong'},
        {request_sha:'8'.repeat(64)},{transmitted_input_sha:'8'.repeat(64)},
        {source_input_sha:'8'.repeat(64),input_sha:'8'.repeat(64)},{style:'minimal'},
        {job_created_at:'2026-10-03T11:59:59.000Z',queue_ms:1000},
        {attempt_started_at:'2026-10-03T12:00:00.500Z',queue_ms:500}]) {
        await reset();const {c,output}=await submitted();Object.assign(output.evidence,patch);refreshConfig(output);await deny(c,output);
      }
      await reset();const {c,output}=await submitted();await deny(c,output,{seed:43});await deny(c,output,{sourceRevision:'8'.repeat(40)});
      const changed=structuredClone(output);Object.assign(changed.evidence.transform,{original_width:480,original_height:640});
      changed.evidence.transform.content_rect={x:64,y:0,width:384,height:512};refreshConfig(changed);await deny(c,changed);
    });
    await t.test('hosted without submission/local with submission and SQL mixed/null-local evidence are denied',async()=>{
      await reset();const c=await start(),output=await outputFor(c);await deny(c,output);
      await assert.rejects(insertEvidence(c,output),/binding/);
      await reset();const hosted=await submitted();
      for(const mode of ['fixture','controlnet']) {const o=fixtureOutput();o.mode=mode;await deny(hosted.c,o);
        await assert.rejects(insertEvidence(hosted.c,o),/local evidence/);}
      for(const field of ['model_revisions','hardware','inference_ms','warm']) {
        await reset();const local=await start(),o=fixtureOutput();o.evidence[field]=null;
        await assert.rejects(insertEvidence(local,o),/generation_evidence_mode_fields/);
        assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
      }
    });
    await t.test('SQL hosted constraints reject unknown/sensitive keys, invented metrics and mixed local provenance',async()=>{
      for(const patch of [{hardware:'invented GPU'},{warm:false},{inference_ms:0},{billing_actual_microusd:0},
        {model_revisions:{sd:'fake',controlnet:'fake',depth:'fake'}},{raw_body:'private'},
        {url:'https://replicate.delivery/private'},{metric_sources:{queue_ms:'provider'}},{local_elapsed_ms:null}]) {
        await reset();const {c,output}=await submitted();Object.assign(output.evidence,patch);
        const before=await allState();await assert.rejects(insertEvidence(c,output),/generation_evidence_mode_fields/);
        assert.deepEqual(await allState(),before);
      }
    });
    await t.test('deletion or cleanup committed while completion waits cannot attach a late result',async()=>{
      for(const cause of ['delete','cleanup']) {
        await reset();const {c,output}=await submitted();let deniedState;const before=await allState();
        const results=await barrier('SELECT id FROM account WHERE id=$1 FOR UPDATE',[c.account_id],
          [()=>jobs().complete(c.job_id,c.fence,output)],async blocker=>{
            if(cause==='delete')await blocker.query('UPDATE job SET deleted_at=$2,fence=fence+1 WHERE id=$1',[c.job_id,now]);
            else await blocker.query("UPDATE provider_submission SET cleanup_state='needed' WHERE job_id=$1",[c.job_id]);
            deniedState={job:(await blocker.query('SELECT * FROM job WHERE id=$1',[c.job_id])).rows[0],
              submission:(await blocker.query('SELECT * FROM provider_submission WHERE job_id=$1',[c.job_id])).rows[0]};
          });
        assert.equal(results[0].status,'fulfilled');assert.equal(results[0].value,false);
        if(cause==='cleanup') {
          before.jobs=[deniedState.job];before.submissions=[deniedState.submission];
          await terminalState({...c,output},before,'submission_binding_mismatch');
        } else {
          assert.deepEqual(await row(c.job_id),deniedState.job);assert.deepEqual(await sub(c.job_id),deniedState.submission);
          assert.equal(await count('SELECT count(*)::int AS n FROM generation_evidence'),0);
          assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release'"),0);
        }
      }
    });
    await t.test('atomic rollback if final job update fails leaves no evidence, output or financial effects',async()=>{
      await reset();const {c,output}=await submitted(),before=await allState();
      await pool.query(`CREATE FUNCTION evidence_test_abort() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'test final update denied'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER evidence_test_abort BEFORE UPDATE ON job FOR EACH ROW EXECUTE FUNCTION evidence_test_abort()`);
      try {await assert.rejects(jobs().complete(c.job_id,c.fence,output),/test final update denied/);
        assert.deepEqual(await allState(),before);}
      finally {await pool.query('DROP TRIGGER evidence_test_abort ON job; DROP FUNCTION evidence_test_abort()');}
    });
    await t.test('local fixture/controlnet retry and completion preserve their original evidence contract',async()=>{
      for(const mode of ['fixture','controlnet']) {
        await reset();const c=await start();assert.equal(await jobs().fail(c.job_id,c.fence,{retryable:true}),true);
        const fresh=await jobs().claim(),out=fixtureOutput();out.mode=mode;
        assert.equal(fresh.attempt,2);assert.equal(await jobs().complete(c.job_id,fresh.fence,out),true);
        assert.equal((await row(c.job_id)).mode,mode);assert.equal(await count('SELECT count(*)::int AS n FROM attempt_ticket'),2);
        assert.equal(await count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release'"),0);
      }
    });
  }finally {
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
  }
});
