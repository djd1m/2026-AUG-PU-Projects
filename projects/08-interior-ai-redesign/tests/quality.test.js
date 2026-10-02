import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, sha } from '../web/generation.js';
import { createQuality, validateCorpus, validateEvidence } from '../web/quality.js';
import { qualityFixture } from './quality-fixtures.js';

const config=dir=>({storageDir:dir,platformDailyLimit:200,accountDailyLimit:20,runtime:'test'});
// SQL mock ONLY for validation/locking order unit tests. Real PostgreSQL checks
// live in quality.integration.test.js and remain pending until coordinator runs.
function dbFor(fixture) {
  const commands=[];const reviews=[];let releases=0;let inTransaction=false;
  const pool={commands,reviews,get releases(){return releases;},async connect(){return {...pool,release(){}};},
    async query(sql,args=[]) {
      commands.push(sql);
      if(sql==='BEGIN'){inTransaction=true;return {rows:[]};}
      if(sql==='COMMIT'||sql==='ROLLBACK'){inTransaction=false;return {rows:[]};}
      if(sql.includes('SELECT private_key'))return {rows:[{private_key:fixture.uploadId}]};
      if(sql.includes('SELECT billing_hold'))return {rows:[{billing_hold:false}]};
      if(sql.includes('SELECT clock_timestamp'))return {rows:[{now:new Date()}]};
      if(sql.includes('SELECT e.*'))return {rows:[{...fixture.row}]};
      if(sql.includes('SELECT * FROM job'))return {rows:[{...fixture.row,id:fixture.row.job_id}]};
      if(sql.includes('INSERT INTO quality_review')){assert.ok(inTransaction);reviews.push(args);return {rows:[]};}
      if(sql.includes('UPDATE job SET quality'))fixture.row.quality=args[1];
      if(sql.includes('INSERT INTO credit_ledger'))releases++;
      if(sql.includes('UPDATE job SET reserved'))fixture.row.reserved=false;
      return {rows:[],rowCount:1};
    }};return pool;
}
test('F02b operator quality software validation, synthetic real-branch data',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'n8-f02b-quality-'));
  try {
    await t.test('otherwise valid synthetic real branch accepts, evidence is canonical, final locks are account then job',async()=>{
      const f=await qualityFixture(dir);assert.deepEqual(validateEvidence(f.row),f.row.canonical_evidence);
      const db=dbFor(f);const q=createQuality(db,config(dir),{operatorIdentity:'test-operator'});
      assert.equal((await q.review({jobId:f.row.job_id,decision:'accepted',reason:'SYNTHETIC SOFTWARE TEST',reportPath:f.reportPath,reportSha:f.reportSha})).quality,'accepted');
      assert.equal(db.reviews.length,1);assert.equal(db.releases,0);
      const account=db.commands.findIndex(s=>s.includes('FROM account')&&s.includes('FOR UPDATE'));
      const job=db.commands.findIndex(s=>s.includes('FROM job')&&s.includes('FOR UPDATE'));assert.ok(account>=0&&job>account);
      await q.review({jobId:f.row.job_id,decision:'rejected',reason:'synthetic rejection'});assert.equal(db.releases,1);
      await assert.rejects(q.review({jobId:f.row.job_id,decision:'accepted',reason:'no reaccept',reportPath:f.reportPath,reportSha:f.reportSha}),/transition/);
      await assert.rejects(q.review({jobId:f.row.job_id,decision:'rejected',reason:'repeat'}),/transition/);assert.equal(db.releases,1);
    });
    await t.test('GEOM-03 fixture-quality exclusion targeted assertion, otherwise-valid byte/report provenance',async()=>{
      const f=await qualityFixture(dir,'fixture');const q=createQuality(dbFor(f),config(dir),{operatorIdentity:'test-operator'});
      let forbidden=false;
      try{await q.review({jobId:f.row.job_id,decision:'accepted',reason:'SYNTHETIC SOFTWARE TEST',reportPath:f.reportPath,reportSha:f.reportSha});}
      catch(e){if(e.message!=='fixture_quality_forbidden')throw e;forbidden=true;}
      assert.equal(forbidden,true,'GEOM-03 fixture quality must be rejected with otherwise valid provenance');
    });
    await t.test('ordinary actor, absent report, mismatched report, changed bytes and modified immutable evidence refuse',async()=>{
      const f=await qualityFixture(dir),db=dbFor(f);
      assert.throws(()=>createQuality(db,config(dir)),/QUALITY_OPERATOR_ID/);
      const q=createQuality(db,config(dir),{operatorIdentity:'test-operator'});
      const args={jobId:f.row.job_id,decision:'accepted',reason:'SYNTHETIC SOFTWARE TEST',reportPath:f.reportPath,reportSha:f.reportSha};
      await assert.rejects(q.review({...args,reportPath:undefined}));
      await assert.rejects(q.review({...args,reportSha:'0'.repeat(64)}),/hash_mismatch/);
      await writeFile(join(dir,'outputs',f.row.output_key),Buffer.from('changed'));await assert.rejects(q.review(args),/actual_bytes_mismatch/);
      const changed={...f.row,canonical_evidence:{...f.row.canonical_evidence,seed:22}};assert.throws(()=>validateEvidence(changed),/binding/);
      assert.equal(db.reviews.length,0);
    });
    await t.test('measured corpus thresholds, coverage, source, config, report hashes and synthetic flag',async()=>{
      const f=await qualityFixture(dir);const e=f.row.canonical_evidence;
      validateCorpus(f.report,e,f.reportSha,f.reportBytes);
      for(const mutate of [r=>{r.synthetic=true;},r=>{r.pairs.pop();},r=>{r.pairs[0].added_openings=1;},r=>{r.pairs[0].anchor_displacements=[0.021];},r=>{r.pairs[0].config_sha='0'.repeat(64);},r=>{r.pairs[0].worker_source_revision='0'.repeat(40);}]) {
        const r=structuredClone(f.report);mutate(r);const bytes=Buffer.from(canonical(r));assert.throws(()=>validateCorpus(r,e,sha(bytes),bytes));
      }
    });
  }finally{await rm(dir,{recursive:true,force:true});}
});
