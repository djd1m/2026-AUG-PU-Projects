import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createProviderSubmissions } from '../web/provider-submissions.js';
import { migrate } from '../scripts/migrate.js';
import { prepareReplicateInput,getPrivateReplicateInput } from '../web/replicate-media.js';
import { replicateSettings,replicateTransportConfig } from '../web/replicate-worker-config.js';
import { createReplicateTransport,createReplicateBudget,prepareReplicateRequest,
  hashReplicateRequest,REPLICATE_MODEL,REPLICATE_VERSION } from '../web/replicate.js';
import { sha } from '../web/generation.js';
import { privateFixture,mockBoundary } from './replicate-generation-fixtures.js';

sharp.concurrency(1);
const CAS_TAG='F07-CAS exactly one create POST';
function gate() {
  let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};
}
async function bounded(promise,label,ms=3000) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error('send_cas_gate_timeout_'+label)),ms);
  })]);}finally{clearTimeout(timer);}
}
const settled=promise=>promise.then(value=>({value}),error=>({error}));
const identity=s=>Object.fromEntries(['id','job_id','attempt_number','attempt_ticket_id','submission_fence',
  'attempt_deadline','submitting_at','model','version','contract_sha','request_sha','source_input_sha',
  'transmitted_input_sha','transform','spend_budget_id','spend_reserved_microusd'].map(k=>[k,s[k]]));

// Parent-only real PG16 authority/transport proof; only the HTTPS boundary is mocked.
// No direct submission insertion, trigger bypass, new ticket, or SQL authority double.
test('F07 I6a actual send CAS and ambiguous replay on owned PostgreSQL16',{timeout:90000},async t=>{
  assert.match(process.versions.node,/^22\./);
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership required');
  let db;
  try{db=new URL(process.env.TEST_DATABASE_URL);}catch{throw new Error('Invalid dedicated database URL');}
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000,
    statement_timeout:5000,query_timeout:6000});
  const schema='f07_send_cas_'+randomBytes(8).toString('hex');let pool;
  const submission=async id=>(await pool.query('SELECT * FROM provider_submission WHERE job_id=$1',[id])).rows[0];
  const conserved=async()=>({jobs:(await pool.query('SELECT * FROM job ORDER BY id')).rows,
    tickets:(await pool.query('SELECT * FROM attempt_ticket ORDER BY id')).rows,
    counters:(await pool.query('SELECT * FROM attempt_budget ORDER BY day,bucket,owner')).rows,
    credits:(await pool.query('SELECT * FROM credit_ledger ORDER BY id')).rows,
    spend:(await pool.query('SELECT * FROM provider_spend_budget ORDER BY id')).rows});
  async function setup(t) {
    await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');
    const f=await privateFixture(t),config=f.config;
    // The accepted private fixture starts as PNG; real upload constraints require
    // WebP and private_key=id, as in the existing PG worker setup.
    f.source=await sharp(f.source).webp().toBuffer();f.upload.id=f.upload.private_key;
    f.upload.mime='image/webp';f.upload.sha256=sha(f.source);
    await writeFile(join(f.dir,f.upload.private_key),f.source,{mode:0o600});
    // Sample PostgreSQL once; both real authorities use its identical millisecond
    // timestamp, including the mutant's no-op submitting_at assignment.
    const now=(await pool.query('SELECT clock_timestamp() AS now')).rows[0].now;
    const trustedClock=()=>now;
    const jobs=createJobs(pool,config,{trustedClock});
    const authority=createProviderSubmissions(pool,config,{trustedClock});
    await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',
      [f.upload.account_id,f.upload.account_id+'@example.test','synthetic-unused']);
    await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,5,'purchase',$3)",
      [randomUUID(),f.upload.account_id,randomUUID()]);
    await pool.query(`INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[f.upload.id,f.upload.account_id,f.upload.private_key,
      f.upload.sha256,f.upload.width,f.upload.height,f.upload.mime]);
    await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,
      authorization_sha,privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,
      window_start,window_end,ceiling_microusd,per_create_ceiling_microusd)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,12000000,300000)`,
      [config.replicate.spend_budget_id,randomUUID(),...['model','version','contract_sha','authorization_sha',
        'privacy_acceptance_sha','license_acceptance_sha','safety_acceptance_sha','billing_acceptance_sha']
        .map(k=>config.replicate[k]),new Date(+now-3600000),new Date(+now+3600000)]);
    const reserved=await jobs.reserve(f.upload.account_id,{upload_id:f.upload.id,style:'warm',idempotency_key:randomUUID()});
    const claim=await jobs.claim();assert.equal(claim.job_id,reserved.job_id);
    const context=await authority.workerContext(claim);
    const input=await prepareReplicateInput({storageDir:f.dir,upload:context.input,accountId:claim.account_id});
    const candidate={version:REPLICATE_VERSION,input:{...replicateSettings(config,context.style),
      image:getPrivateReplicateInput(input).image}};
    const binding={...config.replicate,source_input_sha:input.source_input_sha,
      transmitted_input_sha:input.transmitted_input_sha,transform:input.transform,request_sha:hashReplicateRequest(candidate)};
    const prepared=prepareReplicateRequest(candidate,binding);
    const budget=createReplicateBudget(claim.attempt_deadline,context.remaining_ms);
    const create=(transport,signal)=>transport.create({authority,claim,prepared,budget,signal,
      finalAuthorize:check=>authority.finalAuthorize(claim,check)});
    const before=await conserved();assert.equal(before.tickets.length,1);
    assert.equal(before.tickets[0].id,before.jobs[0].first_ticket_id);
    assert.equal(before.tickets[0].attempt_number,claim.attempt);
    assert.ok(before.tickets[0].consumed_at);assert.equal(claim.attempt,1);
    assert.equal(before.spend[0].reserved_microusd,'0');
    return {config,claim,create,before,binding};
  }
  async function accounting(h) {
    const after=await conserved();
    for(const k of ['jobs','tickets','counters','credits'])assert.deepEqual(after[k],h.before[k]);
    assert.deepEqual(after.spend,[{...h.before.spend[0],reserved_microusd:'300000'}]);
    const s=await submission(h.claim.job_id);
    assert.equal(s.attempt_ticket_id,h.before.tickets[0].id);
    assert.equal(s.attempt_number,h.claim.attempt);assert.equal(s.submission_fence,h.claim.fence);
    assert.equal(+s.attempt_deadline,+h.claim.attempt_deadline);
    assert.equal(s.request_sha,h.binding.request_sha);assert.equal(s.spend_reserved_microusd,'300000');
  }
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);
    db.searchParams.set('options',`-c search_path=${schema}`);pool=createPool(db.href);await migrate(pool);
    await t.test('same durable submitting identity allows exactly one actual POST',async t=>{
      const h=await setup(t),firstEntered=gate(),secondEntered=gate(),responses=gate();
      const bodyHashes=[],pending=[];const abort=new AbortController();
      const api=mockBoundary(async(options,body,index)=>{
        bodyHashes.push(sha(body));
        (index===1?firstEntered:secondEntered).release();
        await responses.promise;
        return {json:{id:'send_cas_prediction',model:REPLICATE_MODEL,version:REPLICATE_VERSION,status:'starting'}};
      });
      const transport=createReplicateTransport(replicateTransportConfig(h.config),{request:api.request});
      // Reuse the SAME handle/claim/deadline. Both transport.create calls invoke
      // real authorize and real finalAuthorize; responses cannot bind before oracle.
      try {
        const first=settled(h.create(transport,abort.signal));pending.push(first);
        await bounded(Promise.race([firstEntered.promise,first.then(()=>{throw new Error('first_create_settled_before_HTTP');})]),'first_POST');
        const original=await submission(h.claim.job_id);
        assert.equal(original.state,'submitting');assert.equal(original.prediction_id,null);
        await accounting(h);
        const second=settled(h.create(transport,abort.signal));pending.push(second);
        const event=await bounded(Promise.race([second.then(result=>({result})),
          secondEntered.promise.then(()=>({http:true}))]),'second_denied_or_POST');
        assert.equal(api.calls.filter(c=>c.method==='POST'&&c.path==='/v1/predictions').length,1,CAS_TAG);
        assert.equal(event.result?.error?.code,'submission_no_replay');
        assert.deepEqual(await submission(h.claim.job_id),original);
        await accounting(h);
        responses.release();const outcome=await bounded(first,'first_response');
        assert.equal(outcome.error,undefined);assert.equal(outcome.value.prediction_id,'send_cas_prediction');
        assert.deepEqual(identity(await submission(h.claim.job_id)),identity(original));
        await accounting(h);assert.equal(bodyHashes[0],h.binding.request_sha);
      }finally{
        // Release every held mock response even when the named oracle throws.
        responses.release();abort.abort();
        await bounded(Promise.all(pending),'pending_cleanup',10000);
      }
    });
    await t.test('failed first response is ambiguous and second create emits no POST',async t=>{
      const h=await setup(t),api=mockBoundary(async()=>({error:true}));
      const transport=createReplicateTransport(replicateTransportConfig(h.config),{request:api.request});
      await assert.rejects(h.create(transport),{code:'provider_create_ambiguous'});
      const original=await submission(h.claim.job_id);
      assert.equal(original.state,'ambiguous');assert.equal(original.prediction_id,null);
      await accounting(h);const before=await conserved();
      await assert.rejects(h.create(transport));
      assert.equal(api.calls.filter(c=>c.method==='POST').length,1,'F07 ambiguous replay adds zero POST');
      assert.deepEqual(await submission(h.claim.job_id),original);
      assert.deepEqual(await conserved(),before);await accounting(h);
    });
  }finally{
    await pool?.end();
    try{await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await admin.end();}
  }
});
