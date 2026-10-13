import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { writeFile,readFile,readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createProviderSubmissions } from '../web/provider-submissions.js';
import { migrate } from '../scripts/migrate.js';
import { workerConfig } from '../scripts/worker.js';
import { runReplicateClaim } from '../web/replicate-generation.js';
import { prepareReplicateInput,getPrivateReplicateInput } from '../web/replicate-media.js';
import { replicateSettings } from '../web/replicate-worker-config.js';
import { hashReplicateRequest,REPLICATE_VERSION } from '../web/replicate.js';
import { sha } from '../web/generation.js';
import { privateFixture,workerEnv,boundaries,mockBoundary } from './replicate-generation-fixtures.js';

// Parent-only actual PG16 proof. Mock only HTTP/download; never direct evidence
// insertion, trigger bypass, mock completion authority, public endpoint or skip.
test('F07 I4b worker on owned internal PostgreSQL16',async t=>{
  assert.match(process.versions.node,/^22\./);
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f07_worker_'+randomBytes(8).toString('hex');let pool;
  const row=async(id,table='job')=>(await pool.query(`SELECT * FROM ${table} WHERE ${table==='provider_submission'?'job_id':'id'}=$1`,[id])).rows[0];
  const conservation=async()=>({tickets:(await pool.query('SELECT * FROM attempt_ticket ORDER BY id')).rows,
    counters:(await pool.query('SELECT * FROM attempt_budget ORDER BY day,bucket,owner')).rows,
    spend:(await pool.query('SELECT * FROM provider_spend_budget ORDER BY id')).rows});
  async function setup(t,{ceiling=12000000,missing=false}={}) {
    await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');
    const f=await privateFixture(t),budget=randomUUID(),config=await workerConfig(workerEnv(f.dir,budget));
    f.source=await sharp(f.source).webp().toBuffer();f.upload.id=f.upload.private_key;
    f.upload.mime='image/webp';f.upload.sha256=sha(f.source);
    await writeFile(join(f.dir,f.upload.private_key),f.source,{mode:0o600});
    const jobs=createJobs(pool,config),a=createProviderSubmissions(pool,config);
    await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',
      [f.upload.account_id,f.upload.account_id+'@example.test','synthetic-unused']);
    await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,5,'purchase',$3)",
      [randomUUID(),f.upload.account_id,randomUUID()]);
    await pool.query(`INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[f.upload.id,f.upload.account_id,f.upload.private_key,f.upload.sha256,128,64,'image/webp']);
    if(!missing)await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,
      authorization_sha,privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,
      window_start,window_end,ceiling_microusd,per_create_ceiling_microusd)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',$11,300000)`,
      [budget,randomUUID(),...['model','version','contract_sha','authorization_sha','privacy_acceptance_sha',
        'license_acceptance_sha','safety_acceptance_sha','billing_acceptance_sha'].map(k=>config.replicate[k]),ceiling]);
    const reserved=await jobs.reserve(f.upload.account_id,{upload_id:f.upload.id,style:'warm',idempotency_key:randomUUID()});
    const claim=await jobs.claim();assert.equal(claim.job_id,reserved.job_id);
    const b=boundaries(f),run=(options={},q=jobs,c=config,dbPool=pool)=>runReplicateClaim(dbPool,q,c,claim,{...b.options,...options});
    async function known({identity=true,bindingPatch={}}={}) {
      const ctx=await a.workerContext(claim),input=await prepareReplicateInput({storageDir:f.dir,upload:ctx.input,accountId:claim.account_id});
      const settings=replicateSettings(config,ctx.style),binding={...config.replicate,source_input_sha:input.source_input_sha,
        transmitted_input_sha:input.transmitted_input_sha,transform:input.transform,
        request_sha:hashReplicateRequest({version:REPLICATE_VERSION,input:{...settings,image:getPrivateReplicateInput(input).image}}),...bindingPatch};
      assert.equal((await a.authorize(claim,binding)).authorized,true);
      if(identity)assert.equal((await a.bindPrediction(claim.job_id,{request_sha:binding.request_sha,prediction_id:'prediction_1',version:REPLICATE_VERSION})).recorded,true);
      return binding;
    }
    return {...f,config,jobs,a,claim,b,run,known,budget};
  }
  async function released(h) {
    const releases=(await pool.query("SELECT * FROM credit_ledger WHERE kind='release' AND reference=$1",[h.claim.job_id])).rows;
    assert.equal(releases.length,1);assert.equal((await row(h.claim.job_id)).status,'failed');
    assert.equal(await h.jobs.fail(h.claim.job_id,h.claim.fence,{retryable:false}),false);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[h.claim.job_id])).rows[0].n,1);
  }
  async function assertCompletion(h,before) {
    const j=await row(h.claim.job_id),s=await row(h.claim.job_id,'provider_submission');
    const es=(await pool.query('SELECT * FROM generation_evidence WHERE job_id=$1',[j.id])).rows;assert.equal(es.length,1);
    const e=es[0].canonical_evidence,ticket=(await pool.query('SELECT * FROM attempt_ticket WHERE id=$1',[s.attempt_ticket_id])).rows[0];
    assert.equal(j.status,'succeeded');assert.equal(j.mode,'replicate');assert.equal(j.quality,'unverified');
    assert.equal(e.seed,42);assert.equal(e.worker_source_revision,h.config.sourceRevision);
    assert.equal(e.submission_id,s.id);assert.equal(e.prediction_id,'prediction_1');assert.equal(e.request_sha,s.request_sha);
    assert.equal(e.queue_ms,+ticket.consumed_at-+j.created_at);assert.equal(e.job_created_at,j.created_at.toISOString());
    assert.equal(e.attempt_started_at,ticket.consumed_at.toISOString());assert.ok(Date.parse(e.local_started_at)>=+s.submitting_at);
    assert.ok(Date.parse(e.artifacts_verified_at)>=+s.observed_at);assert.ok(e.local_elapsed_ms>=0);
    for(const k of ['hardware','warm','inference_ms','billing_actual_microusd'])assert.equal(e[k],null);
    for(const [folder,k] of [['outputs','output_sha'],['depths','depth_sha'],['configs','config_sha']])
      assert.equal(sha(await readFile(join(h.dir,folder,j.output_key))),e[k]);
    assert.equal(sha(await readFile(join(h.dir,h.upload.private_key))),e.input_sha);
    const after=await conservation();assert.deepEqual(after.tickets,before.tickets);assert.deepEqual(after.counters,before.counters);
    assert.equal(after.spend[0].reserved_microusd,'300000');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release'")).rows[0].n,0);
    return {j,s,e,after};
  }
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);pool=createPool(db.href);await migrate(pool);
    await t.test('real I1 create poll I3 bytes and I5a atomic private completion',async t=>{
      const h=await setup(t),before=await conservation();assert.equal(await h.run(),true);
      assert.deepEqual(h.b.api.calls.map(c=>c.method),['POST','GET','GET']);await assertCompletion(h,before);
    });
    await t.test('known-ID recovery GET only preserves original ticket deadline attempt and spend',async t=>{
      const h=await setup(t);await h.known();const original=await row(h.claim.job_id,'provider_submission'),before=await conservation();
      await pool.query("UPDATE job SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[h.claim.job_id]);
      const contenders=await Promise.all([h.jobs.claim(),h.jobs.claim()]);assert.equal(contenders.filter(Boolean).length,1);
      const fresh=contenders.find(Boolean);assert.equal(fresh.fence,h.claim.fence+1);assert.equal(fresh.attempt,h.claim.attempt);
      assert.equal(+fresh.attempt_deadline,+h.claim.attempt_deadline);const b=boundaries(h);
      assert.equal(await runReplicateClaim(pool,h.jobs,h.config,fresh,b.options),true);assert.ok(b.api.calls.every(c=>c.method==='GET'));
      const after=await assertCompletion(h,before);assert.deepEqual(after.after,before);assert.equal(after.s.id,original.id);
    });
    await t.test('changed seed settings request transform and bytes deny before ANY GET',async t=>{
      for(const change of ['seed','style','request','transform','bytes'])await t.test(change,async t=>{
        const h=await setup(t);let bindingPatch={};
        if(change==='request')bindingPatch={request_sha:'8'.repeat(64)};
        if(change==='transform')bindingPatch={transform:{original_width:128,original_height:64,canvas_width:512,canvas_height:512,content_rect:{x:0,y:127,width:512,height:256}}};
        await h.known({bindingPatch});let config=h.config;
        if(change==='seed')config=await workerConfig(workerEnv(h.dir,h.budget,{WORKER_SEED:'43'}));
        if(change==='style')await pool.query("UPDATE job SET style='minimal' WHERE id=$1",[h.claim.job_id]);
        if(change==='bytes')await writeFile(join(h.dir,h.upload.private_key),Buffer.from('changed'));
        const before=await conservation();await assert.rejects(h.run({},h.jobs,config));assert.equal(h.b.api.calls.length,0);
        assert.deepEqual(await conservation(),before);await released(h);
      });
    });
    await t.test('submitting without identity and ambiguity never authorize or replay',async t=>{
      for(const ambiguous of [false,true]) {
        const h=await setup(t);const binding=await h.known({identity:false});
        if(ambiguous)await h.a.markAmbiguous(h.claim.job_id,binding.request_sha);
        const before=await conservation();await assert.rejects(h.run());assert.equal(h.b.api.calls.length,0);
        assert.deepEqual(await conservation(),before);await released(h);
      }
    });
    await t.test('hold before CAS denies, hold after CAS allows already authorized private work',async t=>{
      const held=await setup(t);await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[held.claim.account_id]);
      await assert.rejects(held.run());assert.equal(held.b.api.calls.length,0);await released(held);
      const h=await setup(t),before=await conservation(),b=boundaries(h,async options=>{
        if(options.method==='POST')await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[h.claim.account_id]);
      });assert.equal(await h.run(b.options),true);await assertCompletion(h,before);
    });
    await t.test('deletion during actual send observation prevents private attachment and releases once',async t=>{
      const h=await setup(t),b=boundaries(h,async()=>{await h.jobs.deleteUpload(h.claim.account_id,h.upload.id);},['succeeded']);
      await assert.rejects(h.run(b.options));assert.equal(b.api.calls.length,1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM generation_evidence')).rows[0].n,0);await released(h);
      assert.deepEqual(await readdir(join(h.dir,'outputs')),[]);
    });
    await t.test('stale claim and lost real heartbeat cannot attach',async t=>{
      const stale=await setup(t);await stale.known();await pool.query("UPDATE job SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",[stale.claim.job_id]);
      const fresh=await stale.jobs.claim();await assert.rejects(stale.run());assert.equal(stale.b.api.calls.length,0);
      assert.equal((await row(fresh.job_id)).fence,fresh.fence);
      const h=await setup(t);let sent;
      const api=mockBoundary(async()=>{sent=true;assert.equal(await h.jobs.fail(h.claim.job_id,h.claim.fence,{retryable:false}),true);return {hang:true};});
      await assert.rejects(h.run({transportOptions:{request:api.request,sleep:async()=>{}},heartbeatMs:5}),/lease_lost/);
      assert.ok(sent);assert.equal((await pool.query('SELECT count(*)::int AS n FROM generation_evidence')).rows[0].n,0);await released(h);
    });
    await t.test('unknown missing and zero spend envelope never creates',async t=>{
      for(const opts of [{missing:true},{ceiling:0}]) {const h=await setup(t,opts);await assert.rejects(h.run());assert.equal(h.b.api.calls.length,0);await released(h);}
    });
    await t.test('uncertain actual committed winner survives false/throw completion responses',async t=>{
      for(const outcome of ['false','throw'])await t.test(outcome,async t=>{
        const h=await setup(t),before=await conservation();let failed=0;
        const jobs={...h.jobs,async complete(...args){assert.equal(await h.jobs.complete(...args),true);
          if(outcome==='throw')throw new Error('test lost commit response');return false;},async fail(){failed++;throw new Error('must never fail winner');}};
        assert.equal(await h.run({},jobs),false);assert.equal(failed,0);await assertCompletion(h,before);
      });
    });
    await t.test('unavailable reference lookup preserves actual winner files and no fail',async t=>{
      const h=await setup(t),before=await conservation();let failed=0;
      const jobs={...h.jobs,async complete(...args){assert.equal(await h.jobs.complete(...args),true);throw new Error('uncertain response');},
        async fail(){failed++;throw new Error('winner must survive');}};
      const unavailable={connect:()=>pool.connect(),query:(sql,...args)=>{
        if(sql.includes('SELECT j.status,j.output_key,'))throw new Error('test unavailable reference lookup');return pool.query(sql,...args);}};
      await assert.rejects(h.run({},jobs,h.config,unavailable),/replicate_completion_uncertain/);
      assert.equal(failed,0);await assertCompletion(h,before);
    });
    await t.test('R1 real stale-fence false completion cleans unreferenced artifacts and releases once',async t=>{
      const h=await setup(t);await h.known();const before=await conservation();let output,failed=0;
      const jobs={...h.jobs,async complete(id,fence,value){output=value;
        assert.equal(id,h.claim.job_id);assert.equal(fence,h.claim.fence);
        const attached=await h.jobs.complete(id,fence+1,value);assert.equal(attached,false);return attached;},async fail(id,fence,options){failed++;
        assert.equal(id,h.claim.job_id);assert.equal(fence,h.claim.fence);
        assert.deepEqual(options,{retryable:false});return h.jobs.fail(id,fence,options);}};
      await assert.rejects(h.run({},jobs),/replicate_completion_denied/);assert.ok(output);assert.equal(failed,1);
      for(const folder of ['outputs','depths','configs'])assert.deepEqual(await readdir(join(h.dir,folder)),[]);
      assert.equal(sha(await readFile(join(h.dir,h.upload.private_key))),h.upload.sha256);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM generation_evidence')).rows[0].n,0);
      assert.equal((await row(h.claim.job_id)).output_key,null);
      assert.deepEqual(await conservation(),before);await released(h);assert.deepEqual(await conservation(),before);
    });
    await t.test('R1 global and evidence-only references protect actual completion-generated bytes',async t=>{
      for(const guard of ['global','evidence-only'])await t.test(guard,async t=>{
        const h=await setup(t);await h.known();
        const other=await h.jobs.reserve(h.claim.account_id,{upload_id:h.upload.id,style:'minimal',idempotency_key:randomUUID()});
        const before=await conservation();let failed=0,lookups=0,output;
        const jobs={...h.jobs,async complete(...args){output=args[2];assert.equal(await h.jobs.complete(...args),true);return false;},
          async fail(){failed++;throw new Error('referenced bytes must survive');}};
        // Keep the production query verbatim and execute it on real PG. A read-only
        // CTE projects the unrelated queued job as the lookup scope, eliminating
        // the owned-winner shortcut. For evidence-only it also projects job keys
        // as NULL; immutable evidence and all persisted job rows remain untouched.
        const scoped={connect:()=>pool.connect(),async query(sql,...args){
          if(!sql.includes('SELECT j.status,j.output_key,'))return pool.query(sql,...args);
          lookups++;assert.equal(args[0][2],output.output_key);
          const prefix=guard==='evidence-only'?'WITH job AS (SELECT id,account_id,status,NULL::uuid AS output_key FROM job) ':'';
          const result=await pool.query(prefix+sql,[other.job_id,h.claim.account_id,output.output_key]);
          const r=result.rows[0];assert.equal(r.status,'queued');assert.equal(r.output_key,null);
          assert.equal(r.has_evidence,false);assert.equal(r.referenced,true);return result;
        }};
        assert.equal(await h.run({},jobs,h.config,scoped),false);assert.equal(lookups,1);assert.equal(failed,0);
        await assertCompletion(h,before);assert.deepEqual(await conservation(),before);
        const evidence=(await pool.query('SELECT canonical_evidence FROM generation_evidence WHERE job_id=$1',[h.claim.job_id])).rows[0].canonical_evidence;
        assert.equal(evidence.output_key,output.output_key);assert.equal(evidence.artifact_key,output.output_key);
        assert.equal((await row(other.job_id)).status,'queued');assert.equal((await row(other.job_id)).output_key,null);
      });
    });
  }finally {await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
});
