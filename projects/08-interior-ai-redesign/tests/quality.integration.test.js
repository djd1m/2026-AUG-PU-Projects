import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createPool,transaction } from '../web/db.js';
import { createJobs } from '../web/jobs.js';
import { createApp } from '../web/app.js';
import { tokenHash } from '../web/auth.js';
import { createResults,canonical,sha } from '../web/generation.js';
import { createQuality,qualityEligible } from '../web/quality.js';
import { migrate } from '../scripts/migrate.js';
import { qualityFixture } from './quality-fixtures.js';

// Actual PostgreSQL only, local/internal dedicated database and explicit marker.
// All controlnet-labelled images/reports below are SYNTHETIC SOFTWARE TESTS,
// never GPU/geometry/operator acceptance evidence.
test('F02b real PostgreSQL append-only quality and private result boundaries',async t=>{
  if(!process.env.TEST_DATABASE_URL||process.env.N8_TEST_DB_OWNERSHIP!=='n8-f02b')throw new Error('Dedicated F02b PostgreSQL URL and ownership assertion required');
  const db=new URL(process.env.TEST_DATABASE_URL);
  if(!['localhost','127.0.0.1','[::1]','db'].includes(db.hostname))throw new Error('Dedicated local/internal database required');
  const admin=new pg.Pool({connectionString:db.href,max:2,connectionTimeoutMillis:2000});
  const schema='f02b_'+randomBytes(8).toString('hex');let pool,dir,server;
  try {
    assert.match((await admin.query('SHOW server_version')).rows[0].server_version,/^16\./);
    await admin.query(`CREATE SCHEMA ${schema}`);db.searchParams.set('options',`-c search_path=${schema}`);
    pool=createPool(db.href);await migrate(pool);await migrate(pool);dir=await mkdtemp(join(tmpdir(),'n8-f02b-pg-'));
    const config={storageDir:dir,platformDailyLimit:200,accountDailyLimit:20,runtime:'test',secret:randomBytes(32).toString('hex'),origin:'http://127.0.0.1',secureCookie:false};
    const jobs=createJobs(pool,config);const quality=createQuality(pool,config,{operatorIdentity:'synthetic-test-operator'});
    async function provision(mode='controlnet') {
      const f=await qualityFixture(dir,mode);const account=f.row.account_id;
      await pool.query('INSERT INTO account(id,email,password_hash) VALUES($1,$2,$3)',[account,account+'@example.test','synthetic-unused-hash']);
      await pool.query("INSERT INTO credit_ledger(id,account_id,delta,kind,reference) VALUES($1,$2,1,'purchase',$3)",[randomUUID(),account,randomUUID()]);
      await pool.query("INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime) VALUES($1,$2,$1,$3,8,8,'image/png')",[f.uploadId,account,f.row.input_sha]);
      const {job_id:id}=await jobs.reserve(account,{upload_id:f.uploadId,style:'warm',idempotency_key:randomUUID()});
      const claim=await jobs.claim();assert.equal(claim.job_id,id);
      const evidence={...f.row.canonical_evidence,job_id:id};
      assert.equal(await jobs.complete(id,claim.fence,{output_key:f.row.output_key,mode,evidence}),true);
      f.row.job_id=id;f.row.canonical_evidence=evidence;f.row.evidence_sha=sha(canonical(evidence));
      f.report.pairs[0].evidence_sha=f.row.evidence_sha;const bytes=Buffer.from(canonical(f.report));
      await writeFile(f.reportPath,bytes);f.reportSha=sha(bytes);
      return {...f,id,account,args:{jobId:id,decision:'accepted',reason:'SYNTHETIC SOFTWARE TEST ONLY',reportPath:f.reportPath,reportSha:f.reportSha}};
    }
    const releases=async id=>(await pool.query("SELECT count(*)::int AS n FROM credit_ledger WHERE kind='release' AND reference=$1",[id])).rows[0].n;
    await t.test('otherwise-valid synthetic real branch accepts; accepted review/evidence cannot update/delete; reject revokes and unique-releases',async()=>{
      const f=await provision();await quality.review(f.args);
      assert.equal(await qualityEligible(pool,f.id,dir),true);
      const review=(await pool.query('SELECT * FROM quality_review WHERE job_id=$1',[f.id])).rows[0];
      assert.equal(review.actor,'synthetic-test-operator');assert.equal(review.corpus_sha,f.reportSha);
      for(const sql of ['UPDATE quality_review SET reason=\'tampered\' WHERE job_id=$1','DELETE FROM quality_review WHERE job_id=$1',
        'UPDATE generation_evidence SET seed=9 WHERE job_id=$1','DELETE FROM generation_evidence WHERE job_id=$1'])await assert.rejects(pool.query(sql,[f.id]),/immutable/);
      const results=createResults(pool,dir);assert.deepEqual((await results.read(f.account,f.id)).data,f.image);
      await quality.review({...f.args,decision:'rejected',reason:'synthetic rejected'});
      assert.equal(await qualityEligible(pool,f.id,dir),false);await assert.rejects(results.read(f.account,f.id),e=>e.status===404);
      assert.equal(await releases(f.id),1);
      await assert.rejects(quality.review(f.args),/transition/);
      await assert.rejects(quality.review({...f.args,decision:'rejected'}),/transition/);
      await jobs.delete(f.account,f.id);assert.equal(await releases(f.id),1);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM quality_review WHERE job_id=$1',[f.id])).rows[0].n,2);
    });
    await t.test('GEOM-03 fixture with otherwise valid provenance/report cannot accept',async()=>{
      const f=await provision('fixture');await assert.rejects(quality.review(f.args),/fixture_quality_forbidden/);
      assert.equal((await pool.query('SELECT quality FROM job WHERE id=$1',[f.id])).rows[0].quality,'unverified');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM quality_review WHERE job_id=$1',[f.id])).rows[0].n,0);
    });
    await t.test('missing/mismatched report and changed output refuse with zero effects',async()=>{
      const f=await provision();await assert.rejects(quality.review({...f.args,reportPath:undefined}));
      await assert.rejects(quality.review({...f.args,reportSha:'0'.repeat(64)}),/hash_mismatch/);
      await writeFile(join(dir,'outputs',f.row.output_key),'changed');await assert.rejects(quality.review(f.args),/actual_bytes_mismatch/);
      assert.equal(await releases(f.id),0);assert.equal(await qualityEligible(pool,f.id,dir),false);
    });
    await t.test('concurrent accept/reject serializes; rejected never reaccepted and release is one',async()=>{
      const f=await provision();await Promise.allSettled([quality.review(f.args),quality.review({...f.args,decision:'rejected'})]);
      const current=(await pool.query('SELECT quality FROM job WHERE id=$1',[f.id])).rows[0].quality;
      if(current==='accepted')await quality.review({...f.args,decision:'rejected'});
      assert.equal(await releases(f.id),1);await assert.rejects(quality.review(f.args),/transition/);
    });
    await t.test('rejection without a reserve does not invent a release',async()=>{
      const f=await provision();await pool.query("DELETE FROM credit_ledger WHERE kind='reserve' AND reference=$1",[f.id]);
      await quality.review({...f.args,decision:'rejected'});assert.equal(await releases(f.id),0);
    });
    await t.test('actual HTTP result bytes private/no-store/noindex, cross-owner404, no user quality setter and deletion denial',async()=>{
      const f=await provision(),other=await provision();
      const a=randomBytes(32).toString('base64url'),b=randomBytes(32).toString('base64url');
      for(const [token,account] of [[a,f.account],[b,other.account]])await pool.query("INSERT INTO session(token_hash,account_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token,config.secret),account]);
      server=createApp(pool,config);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      const origin='http://127.0.0.1:'+server.address().port;const url=origin+'/api/jobs/'+f.id+'/result';
      const response=await fetch(url,{headers:{cookie:'roomkind_session='+a}});assert.equal(response.status,200);
      assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-robots-tag'),/noindex/);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.image);
      assert.equal((await fetch(url,{headers:{cookie:'roomkind_session='+b}})).status,404);
      assert.equal((await fetch(origin+'/api/jobs/'+f.id+'/quality',{method:'POST',headers:{cookie:'roomkind_session='+a,origin:config.origin,'content-type':'application/json'},body:'{}'})).status,404);
      await jobs.delete(f.account,f.id);assert.equal((await fetch(url,{headers:{cookie:'roomkind_session='+a}})).status,404);
      await new Promise(resolve=>server.close(resolve));server=null;
    });
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();if(dir)await rm(dir,{recursive:true,force:true});
  }
});
