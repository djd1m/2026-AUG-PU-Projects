// Parent executes on internal Node22/PG16 only. SOFTWARE TEST ONLY synthetic 8px
// artifacts, corpus declarations and authorization receipts confer no real quality.
// Real I1 CAS/identity/observation and I5a completion; no trigger bypass or SQL evidence insert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,rm,writeFile,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
import { createPool } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createProviderSubmissions } from '../web/provider-submissions.js';
import { createQuality,qualityEligible,validateEvidence } from '../web/quality.js';
import { createSharing } from '../web/sharing.js';
import { canonical,sha } from '../web/generation.js';
import { migrate } from '../scripts/migrate.js';
import { evidenceConfig } from './replicate-evidence-fixtures.js';
import { replicateQualityFixture,persistHostedFixture } from './replicate-quality-fixtures.js';
import { qualityFixture } from './quality-fixtures.js';
import { publication } from './sharing-fixtures.js';
sharp.concurrency(1);
const deny=p=>assert.rejects(p,e=>e.status===404);
test('I5b hosted operator quality and publication on actual dedicated PostgreSQL16',async t=>{
  assert.match(process.versions.node,/^22\./,'Node22 required');
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f07-replicate')
    throw new Error('Dedicated F07 PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f07_quality_'+randomBytes(8).toString('hex'),appName=schema+'_quality';let pool,dir,now;
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    db.searchParams.set('application_name',appName);pool=createPool(db.href);await migrate(pool);await migrate(pool);
    dir=await mkdtemp(join(tmpdir(),'n8-i5b-pg-'));
    const config={...evidenceConfig,storageDir:dir};
    const jobs=createJobs(pool,config,{trustedClock:()=>now}),authority=createProviderSubmissions(pool,config,{trustedClock:()=>now});
    const quality=createQuality(pool,config,{operatorIdentity:'SOFTWARE_TEST_ONLY_operator'}),sharing=createSharing(pool,config);
    const count=async(sql,args=[])=>(await pool.query(sql,args)).rows[0].n;
    const releases=id=>count("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[id]);
    async function owner(f) {
      await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[f.account,f.account+'@example.test','SOFTWARE_TEST_ONLY_unused']);
      await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,5,'purchase',$3)",[randomUUID(),f.account,randomUUID()]);
      await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,8,8,'image/webp')",[f.uploadId,f.account,f.row.input_sha]);
      const r=await jobs.reserve(f.account,{upload_id:f.uploadId,style:'warm',idempotency_key:randomUUID()});
      const claim=await jobs.claim();assert.equal(claim.job_id,r.job_id);return claim;
    }
    async function provision({accept=false}={}) {
      const f=await replicateQualityFixture(dir),claim=await owner(f),e=f.output.evidence,id=randomUUID();
      const b={...Object.fromEntries(['model','version','contract_sha','source_input_sha','transmitted_input_sha','request_sha','transform'].map(k=>[k,e[k]])),
        spend_budget_id:id,authorization_sha:sha('SOFTWARE TEST ONLY authorization'),privacy_acceptance_sha:sha('SOFTWARE TEST ONLY privacy'),
        license_acceptance_sha:sha('SOFTWARE TEST ONLY license'),safety_acceptance_sha:sha('SOFTWARE TEST ONLY safety'),billing_acceptance_sha:sha('SOFTWARE TEST ONLY billing')};
      await pool.query(`INSERT INTO provider_spend_budget(id,authorization_id,model,version,contract_sha,authorization_sha,
        privacy_acceptance_sha,license_acceptance_sha,safety_acceptance_sha,billing_acceptance_sha,window_start,window_end,
        ceiling_microusd,per_create_ceiling_microusd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,12000000,300000)`,
        [id,randomUUID(),b.model,b.version,b.contract_sha,b.authorization_sha,b.privacy_acceptance_sha,b.license_acceptance_sha,
          b.safety_acceptance_sha,b.billing_acceptance_sha,new Date(+now-86400000),new Date(+now+86400000)]);
      const authorized=await authority.authorize(claim,b);assert.equal(authorized.authorized,true);
      const identity={request_sha:b.request_sha,prediction_id:'SOFTWARE_TEST_ONLY_'+randomBytes(10).toString('hex'),version:b.version};
      assert.equal((await authority.bindPrediction(claim.job_id,identity)).recorded,true);
      assert.equal((await authority.observe(claim.job_id,{...identity,status:'succeeded'})).status,'succeeded');
      const j=(await pool.query('SELECT * FROM job WHERE id=$1',[claim.job_id])).rows[0];
      const ticket=(await pool.query('SELECT * FROM attempt_ticket WHERE id=$1',[j.first_ticket_id])).rows[0];
      const started=now;now=new Date(+now+1000);
      Object.assign(e,{job_id:j.id,submission_id:authorized.submission.id,prediction_id:identity.prediction_id,
        job_created_at:j.created_at.toISOString(),attempt_started_at:ticket.consumed_at.toISOString(),
        local_started_at:started.toISOString(),artifacts_verified_at:now.toISOString(),queue_ms:+ticket.consumed_at-+j.created_at});
      await persistHostedFixture(dir,f);assert.equal(await jobs.complete(j.id,claim.fence,f.output),true);
      f.id=j.id;f.claim=claim;
      const stored=(await pool.query('SELECT * FROM generation_evidence WHERE job_id=$1',[f.id])).rows[0];
      assert.deepEqual(stored.canonical_evidence,f.row.canonical_evidence);assert.equal(stored.model_revisions,null);
      if(accept)await quality.review(f.args);return f;
    }
    async function local(mode) {
      const f=await qualityFixture(dir,mode);f.account=f.row.account_id;const c=await owner(f);
      const e={...f.row.canonical_evidence,job_id:c.job_id};
      assert.equal(await jobs.complete(c.job_id,c.fence,{output_key:f.row.output_key,mode,evidence:e}),true);
      f.id=c.job_id;f.report.pairs[0].evidence_sha=sha(canonical(e));const bytes=Buffer.from(canonical(f.report));await writeFile(f.reportPath,bytes);
      f.args={jobId:f.id,decision:'accepted',reason:'SOFTWARE TEST ONLY local corpus',reportPath:f.reportPath,reportSha:sha(bytes)};return f;
    }
    async function scenario(name,fn) {
      await t.test(name,async()=>{await pool.query('TRUNCATE account,attempt_budget,provider_spend_budget CASCADE');
        now=new Date('2026-10-03T12:00:00.000Z');await fn();});
    }
    // Wait for actual lock contention, not an assumed delay or mock transaction.
    async function accountBarrier(f,actions,change) {
      const blocker=await pool.connect();let pending;
      try {
        await blocker.query('BEGIN');await blocker.query('SELECT id FROM account WHERE id=$1 FOR UPDATE',[f.account]);
        pending=Promise.allSettled(actions.map(fn=>fn()));const until=Date.now()+3500;let waiting=0;
        do {
          waiting=Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",[appName])).rows[0].n);
          if(waiting>=actions.length)break;await new Promise(resolve=>setTimeout(resolve,10));
        }while(Date.now()<until);
        assert.ok(waiting>=actions.length,'real PG contenders reached account lock');
        await change?.(blocker);await blocker.query('COMMIT');return await pending;
      }finally{await blocker.query('ROLLBACK');blocker.release();if(pending)await pending;}
    }
    await scenario('I1 authority and I5a completion -> privileged review -> private export -> explicit public/list/read',async()=>{
      const f=await provision();assert.equal(await qualityEligible(pool,f.id,dir),false);
      const action=await sharing.attempt(f.account,f.id,{event_key:randomUUID(),mode:'download'});
      assert.equal(action.quality,'unverified');assert.equal(action.demo,false);
      const privateImage=await sharing.ownerComposite(f.account,f.id,'download',action.event_key);assert.ok(privateImage.data.length);
      await deny(sharing.publish(f.account,f.id,publication()));await deny(sharing.attempt(randomUUID(),f.id,{event_key:randomUUID(),mode:'native'}));
      await quality.review(f.args);assert.equal(await qualityEligible(pool,f.id,dir),true);
      const reviewed=(await pool.query('SELECT * FROM quality_review WHERE job_id=$1',[f.id])).rows[0];
      assert.equal(reviewed.actor,'SOFTWARE_TEST_ONLY_operator');assert.equal(reviewed.corpus_sha,f.reportSha);
      for(const sql of ['DELETE FROM quality_review WHERE job_id=$1',"UPDATE quality_review SET reason='tamper' WHERE job_id=$1",
        'DELETE FROM generation_evidence WHERE job_id=$1'])await assert.rejects(pool.query(sql,[f.id]),/immutable/);
      const v=await sharing.publish(f.account,f.id,publication());assert.ok((await sharing.publicRead(v.token)).image.data.length);
      assert.deepEqual((await sharing.list()).items.map(i=>i.token),[v.token]);
      await sharing.revoke(f.account,f.id);await deny(sharing.publicRead(v.token));assert.equal((await sharing.list()).items.length,0);
      const fresh=await sharing.publish(f.account,f.id,publication());assert.notEqual(fresh.token,v.token);await deny(sharing.publicRead(v.token));
      await quality.review({...f.args,decision:'rejected'});assert.equal(await releases(f.id),1);assert.equal(await qualityEligible(pool,f.id,dir),false);
      await deny(sharing.publicRead(fresh.token));await deny(sharing.ownerComposite(f.account,f.id,'download',action.event_key));
      await assert.rejects(quality.review(f.args),/transition/);await assert.rejects(quality.review({...f.args,decision:'rejected'}),/transition/);
      await jobs.delete(f.account,f.id);assert.equal(await releases(f.id),1);
    });
    await scenario('changed actual input/output/depth/config and missing report have zero review effects',async()=>{
      const f=await provision();await assert.rejects(quality.review({...f.args,reportPath:undefined}));
      await assert.rejects(quality.review({...f.args,reportSha:'0'.repeat(64)}),/hash_mismatch/);
      for(const folder of ['', 'outputs','depths','configs']) {
        const path=join(dir,folder,folder?f.row.output_key:f.uploadId),original=await readFile(path);
        await writeFile(path,'changed SOFTWARE TEST ONLY bytes');await assert.rejects(quality.review(f.args),/actual_bytes_mismatch/);
        assert.equal(await count('SELECT count(*)::int AS n FROM quality_review WHERE job_id=$1',[f.id]),0);await writeFile(path,original);
      }
      await quality.review(f.args);const v=await sharing.publish(f.account,f.id,publication());
      for(const folder of ['depths','configs']) {
        const path=join(dir,folder,f.row.output_key),original=await readFile(path);await writeFile(path,'changed SOFTWARE TEST ONLY bytes');
        assert.equal(await qualityEligible(pool,f.id,dir),false);await deny(sharing.publicRead(v.token));await deny(sharing.publish(f.account,f.id,publication()));
        assert.equal((await sharing.list()).items.length,0);await writeFile(path,original);
      }
      assert.equal(await releases(f.id),0);
    });
    await scenario('fixture excluded and controlnet report path remains separate',async()=>{
      const demo=await local('fixture');await assert.rejects(quality.review(demo.args),/fixture_quality_forbidden/);
      await deny(sharing.publish(demo.account,demo.id,publication()));
      const old=await local('controlnet'),hosted=await provision();
      await assert.rejects(quality.review({...old.args,reportPath:hosted.reportPath,reportSha:hosted.reportSha}),/real_corpus_required/);
      await assert.rejects(quality.review({...hosted.args,reportPath:old.reportPath,reportSha:old.args.reportSha}));
      await quality.review(old.args);assert.equal(await qualityEligible(pool,old.id,dir),true);
      assert.ok((await sharing.publish(old.account,old.id,publication())).token);
    });
    await scenario('concurrent accept/reject and accept/accept preserve once-only release and no reaccept',async()=>{
      for(const decisions of [['accepted','rejected'],['accepted','accepted'],['rejected','rejected']]) {
        const f=await provision(),results=await accountBarrier(f,decisions.map(decision=>()=>quality.review({...f.args,decision})));
        assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
        const live=(await pool.query('SELECT quality FROM job WHERE id=$1',[f.id])).rows[0].quality;
        if(live!=='rejected')await quality.review({...f.args,decision:'rejected'});
        assert.equal(await releases(f.id),1);await assert.rejects(quality.review(f.args),/transition/);
        await assert.rejects(quality.review({...f.args,decision:'rejected'}),/transition/);assert.equal(await releases(f.id),1);
      }
    });
    await scenario('operator final account/job reread denies hold/delete/style changes after actual byte verification',async()=>{
      for(const cause of ['hold','delete','style']) {
        const f=await provision(),change=c=>cause==='hold'?c.query('UPDATE account SET billing_hold=true WHERE id=$1',[f.account]):
          cause==='delete'?c.query('UPDATE job SET deleted_at=clock_timestamp() WHERE id=$1',[f.id]):
            c.query("UPDATE job SET style='minimal' WHERE id=$1",[f.id]);
        const results=await accountBarrier(f,[()=>quality.review(f.args)],change);
        assert.equal(results[0].status,'rejected');assert.equal(await count('SELECT count(*)::int AS n FROM quality_review WHERE job_id=$1',[f.id]),0);
      }
    });
    await scenario('actual afterPrepare barriers deny stale public/cache/list on hold/delete/revoke/reject/version/owner',async()=>{
      for(const cause of ['hold','delete','revoke','reject','version','owner']) {
        const f=await provision({accept:true});await pool.query('UPDATE account SET badge_free_entitlement=true WHERE id=$1',[f.account]);
        let hook;const service=createSharing(pool,config,{afterPrepare:()=>hook?.()});
        const key=randomUUID();await service.attempt(f.account,f.id,{event_key:key,mode:'download'});
        await service.ownerComposite(f.account,f.id,'download',key);const v=await service.publish(f.account,f.id,publication());
        await service.publicRead(v.token); // populate exactly the public cache key
        let ready,release;const prepared=new Promise(r=>{ready=r;}),gate=new Promise(r=>{release=r;});
        hook=async()=>{ready();await gate;};const pending=service.publicRead(v.token),denial=deny(pending);await prepared;
        if(cause==='hold')await pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[f.account]);
        if(cause==='delete')await jobs.delete(f.account,f.id);
        if(cause==='revoke')await sharing.revoke(f.account,f.id);
        if(cause==='reject')await quality.review({...f.args,decision:'rejected'});
        if(cause==='version')await pool.query('UPDATE share SET version=version+1 WHERE token=$1',[v.token]);
        if(cause==='owner') {const other=await provision();await pool.query('UPDATE job SET account_id=$2 WHERE id=$1',[f.id,other.account]);}
        release();await denial;hook=undefined;
        if(cause==='version')await sharing.revoke(f.account,f.id);
        assert.equal((await service.list()).items.length,0);
      }
      // Cache and list have their own final barriers, beyond publicRead coverage.
      for(const operation of ['ownerComposite','list','publish']) {
        const f=await provision({accept:true});await pool.query('UPDATE account SET badge_free_entitlement=true WHERE id=$1',[f.account]);
        let hook;const service=createSharing(pool,config,{afterPrepare:()=>hook?.()});
        const key=randomUUID();await service.attempt(f.account,f.id,{event_key:key,mode:'download'});
        await service.ownerComposite(f.account,f.id,'download',key);await service.publish(f.account,f.id,publication());
        await service.list();hook=()=>pool.query('UPDATE account SET billing_hold=true WHERE id=$1',[f.account]);
        if(operation==='list')assert.equal((await service.list()).items.length,0);
        else if(operation==='publish')await deny(service.publish(f.account,f.id,publication()));
        else await deny(service.ownerComposite(f.account,f.id,'download',key));
      }
    });
  }finally {
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});
  }
});
