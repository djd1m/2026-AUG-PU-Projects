// SOFTWARE TEST ONLY: these synthetic reports do not establish real measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { canonical, sha } from '../web/generation.js';
import { createQuality, qualityEligible, validateEvidence, requireRealQuality } from '../web/quality.js';
import { validateHostedCorpus, validateHostedConfig, hostedConfig } from '../web/replicate-quality.js';
import { compose } from '../web/composite.js';
import { replicateQualityFixture } from './replicate-quality-fixtures.js';
sharp.concurrency(1);
// Mock proves validation/order only; parent PG suite proves actual SQL authority.
function database(f) {
  const commands=[],reviews=[];let releases=0,hold=false,finalMutation;
  const pool={commands,reviews,get releases(){return releases;},set hold(v){hold=v;},set finalMutation(v){finalMutation=v;},
    async connect(){return {...pool,release(){}};},async query(sql,args=[]) {
      commands.push(sql);
      if(sql.includes('SELECT private_key'))return {rows:[{private_key:f.uploadId}]};
      if(sql.includes('SELECT billing_hold'))return {rows:[{billing_hold:hold}]};
      if(sql.includes('SELECT clock_timestamp'))return {rows:[{now:new Date()}]};
      if(sql.includes('SELECT e.*')) {
        if(sql.includes("j.quality='accepted'")&&(hold||f.row.quality!=='accepted'||!reviews.some(r=>r[3]==='accepted')))return {rows:[]};
        finalMutation?.(f.row);return {rows:[structuredClone(f.row)]};
      }
      if(sql.includes('SELECT * FROM job'))return {rows:[{...f.row,id:f.row.job_id}]};
      if(sql.includes('INSERT INTO quality_review'))reviews.push(args);
      if(sql.includes('UPDATE job SET quality'))f.row.quality=args[1];
      if(sql.includes('INSERT INTO credit_ledger'))releases++;
      if(sql.includes('UPDATE job SET reserved'))f.row.reserved=false;
      return {rows:[],rowCount:1};
    }};return pool;
}
const config=dir=>({storageDir:dir,runtime:'test',platformDailyLimit:200,accountDailyLimit:20});
test('I5b labelled hosted software branch: strict row/config/corpus and actual bytes',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'n8-i5b-software-'));
  try {
    await t.test('valid software shape with 12 inputs x 3 styles, distinct per-pair config/request',async()=>{
      const f=await replicateQualityFixture(dir),e=validateEvidence(f.row);
      assert.equal(e.inference_ms,null);assert.equal(f.row.model_revisions,null);
      assert.equal(new Set(f.report.pairs.map(p=>p.input_sha)).size,12);
      assert.equal(new Set(f.report.pairs.map(p=>p.config_sha)).size,36);
      validateHostedCorpus(f.report,e,f.reportSha,f.reportBytes,e.style);validateHostedConfig(hostedConfig(e),e);
      requireRealQuality('replicate');assert.throws(()=>requireRealQuality('fixture'),/fixture/);
    });
    await t.test('guard oracle: synthetic hosted corpus cannot be accepted',async()=>{
      const f=await replicateQualityFixture(dir),r=structuredClone(f.report);r.synthetic=true;
      const bytes=Buffer.from(canonical(r));
      assert.throws(()=>validateHostedCorpus(r,f.row.canonical_evidence,sha(bytes),bytes,'warm'),/real_corpus_required/);
    });
    await t.test('closed canonical row, all shared columns, style and SQL null metrics',async()=>{
      const f=await replicateQualityFixture(dir);
      for(const k of ['input_sha','output_sha','depth_sha','config_sha','seed','mode','worker_source_revision','hardware','queue_ms','inference_ms','warm','model_revisions','style','job_mode','job_id','output_key','evidence_sha']) {
        const r=structuredClone(f.row);r[k]=k==='inference_ms'?0:'wrong';assert.throws(()=>validateEvidence(r),k);
      }
      for(const patch of [{model_revisions:{}},{hardware:'GPU'},{inference_ms:0},{warm:false},{billing_actual_microusd:0},
        {version:'0'.repeat(64)},{contract_sha:'0'.repeat(64)},{style:'playful'},{unknown:true},{output_key:undefined}]) {
        const r=structuredClone(f.row);Object.assign(r.canonical_evidence,patch);r.evidence_sha=sha(canonical(r.canonical_evidence));assert.throws(()=>validateEvidence(r));
      }
      const noJobMode=structuredClone(f.row);delete noJobMode.job_mode;assert.throws(()=>validateEvidence(noJobMode));
      for(const k of ['seed','queue_ms']) {const r=structuredClone(f.row);r[k]=null;assert.throws(()=>validateEvidence(r));}
      for(const k of ['model_revisions','seed','style','worker_source_revision','url']) {
        const g=hostedConfig(f.row.canonical_evidence);g[k]='unexpected';assert.throws(()=>validateHostedConfig(g,f.row.canonical_evidence));
      }
    });
    await t.test('corpus refuses source/attestation, mixed pins, aliases, substitution and geometry',async()=>{
      const f=await replicateQualityFixture(dir),e=f.row.canonical_evidence;
      const mutations=[r=>{delete r.attestation;},r=>{delete r.measurement_source_sha;},r=>{r.measurement_claim='advertised';},
        r=>{r.kind='measured-gpu-corpus-v1';},r=>{r.attestation.reviewer=r.reviewer;},r=>{r.attestation.source_sha=null;},
        r=>{r.pairs.pop();},r=>{r.pairs=Array(1001).fill(r.pairs[0]);},r=>{r.pairs[0].mode='controlnet';},r=>{r.pairs[0].version='0'.repeat(64);},
        r=>{r.pairs[0].contract_sha='0'.repeat(64);},r=>{r.pairs[0].worker_source_revision='0'.repeat(40);},
        r=>{r.pairs[0].added_openings=1;},r=>{r.pairs[0].removed_openings=1;},
        r=>{r.pairs[0].anchor_displacements=[0.02001];},r=>{r.pairs[0].anchor_displacements=[-0.01];},r=>{r.pairs[0].anchor_displacements=[null];},
        r=>{r.pairs[0].style='playful';},r=>{r.pairs[0].depth_sha='0'.repeat(64);},r=>{r.pairs[0].output_sha='0'.repeat(64);},
        r=>{r.pairs[0].config_sha='0'.repeat(64);},r=>{r.pairs[0].request_sha='0'.repeat(64);},r=>{r.pairs[0].evidence_sha='0'.repeat(64);},
        r=>{r.pairs[0].license_sha=null;},r=>{r.pairs[0].anchor_displacements=[];},r=>{r.pairs[0].config.url='private';},r=>{delete r.pairs[0].annotations_sha;},r=>{r.pairs.push(structuredClone(r.pairs[0]));},
        r=>{r.extra='unknown';},r=>{r.pairs[0].extra='unknown';}];
      for(const mutate of mutations) {const r=structuredClone(f.report);mutate(r);const bytes=Buffer.from(canonical(r));assert.throws(()=>validateHostedCorpus(r,e,sha(bytes),bytes,'warm'));}
      assert.throws(()=>validateHostedCorpus(f.report,e,'0'.repeat(64),f.reportBytes,'warm'),/hash_mismatch/);
      const alias=structuredClone(f.report),p=structuredClone(alias.pairs[0]);p.room_id='SOFTWARE_TEST_ONLY_alias';alias.pairs.push(p);
      const bytes=Buffer.from(canonical(alias));assert.throws(()=>validateHostedCorpus(alias,e,sha(bytes),bytes,'warm'),/input_alias/);
      const incomplete=structuredClone(f.report);
      const last=incomplete.pairs.at(-1);last.style='playful';last.evidence.style='playful';
      last.request_sha=last.evidence.request_sha=sha('SOFTWARE TEST ONLY different style request');
      last.config=hostedConfig(last.evidence);last.config_sha=last.evidence.config_sha=sha(canonical(last.config));
      last.evidence_sha=sha(canonical(last.evidence));const incompleteBytes=Buffer.from(canonical(incomplete));
      assert.throws(()=>validateHostedCorpus(incomplete,e,sha(incompleteBytes),incompleteBytes,'warm'),/coverage_or_output/);
      for(const v of [NaN,Infinity]) {const r=structuredClone(f.report);r.pairs[0].anchor_displacements=[v];assert.throws(()=>validateHostedCorpus(r,e,sha(f.reportBytes),f.reportBytes,'warm'));}
    });
    await t.test('server-only review software acceptance, eligibility and once-only rejection',async()=>{
      const f=await replicateQualityFixture(dir),db=database(f),q=createQuality(db,config(dir),{operatorIdentity:'SOFTWARE_TEST_ONLY_operator'});
      assert.throws(()=>createQuality(db,config(dir)),/QUALITY_OPERATOR_ID/);assert.equal(await qualityEligible(db,f.row.job_id,dir),false);
      assert.equal((await q.review(f.args)).quality,'accepted');assert.equal(db.reviews.length,1);assert.equal(await qualityEligible(db,f.row.job_id,dir),true);
      const locks=db.commands.filter(s=>s.includes('FOR UPDATE'));assert.match(locks[0],/FROM account/);assert.match(locks[1],/FROM job/);
      db.hold=true;assert.equal(await qualityEligible(db,f.row.job_id,dir),false);db.hold=false;
      await q.review({...f.args,decision:'rejected'});assert.equal(db.releases,1);assert.equal(await qualityEligible(db,f.row.job_id,dir),false);
      await assert.rejects(q.review(f.args),/transition/);await assert.rejects(q.review({...f.args,decision:'rejected'}),/transition/);assert.equal(db.releases,1);
    });
    await t.test('missing/changed input, output, depth and config deny review and eligibility',async()=>{
      for(const folder of ['', 'outputs','depths','configs'])for(const missing of [false,true]) {
        const f=await replicateQualityFixture(dir),db=database(f),q=createQuality(db,config(dir),{operatorIdentity:'SOFTWARE_TEST_ONLY_operator'});
        const path=join(dir,folder,folder?f.row.output_key:f.uploadId),original=await readFile(path);
        if(missing)await rm(path);else await writeFile(path,'changed SOFTWARE TEST ONLY bytes');
        await assert.rejects(q.review(f.args));assert.equal(db.reviews.length,0);
        f.row.quality='accepted';db.reviews.push([null,null,null,'accepted']);assert.equal(await qualityEligible(db,f.row.job_id,dir),false);await writeFile(path,original);
      }
    });
    await t.test('final eligibility rechecks deleted/quality/evidence authority after byte reads',async()=>{
      for(const patch of [{deleted_at:new Date()},{quality:'rejected'},{upload_sha:'0'.repeat(64)},{style:'minimal'},{evidence_sha:'0'.repeat(64)}]) {
        const f=await replicateQualityFixture(dir),db=database(f);await createQuality(db,config(dir),{operatorIdentity:'SOFTWARE_TEST_ONLY_operator'}).review(f.args);
        let reads=0;db.finalMutation=r=>{if(++reads===2)Object.assign(r,patch);};assert.equal(await qualityEligible(db,f.row.job_id,dir),false);
      }
    });
    await t.test('private hosted unverified composite has existing UNVERIFIED pixels',async()=>{
      const f=await replicateQualityFixture(dir),image=await compose(f.input,f.image,{mode:'replicate',quality:'unverified'});
      const area=await sharp(image.data).extract({left:1048,top:824,width:180,height:21}).raw().toBuffer();assert.ok([...area].filter(v=>v<100).length>300);
    });
  }finally{await rm(dir,{recursive:true,force:true});}
});

// Reuse unchanged sharing SQL double, replacing only synthetic private fixture
// data. This is software authorization coverage, never a PostgreSQL pass.
test('I5b hosted sharing mode alone grants no public authority; private and final cache guards',async()=>{
  const { sharingFixture,publication }=await import('./sharing-fixtures.js');
  const { createSharing }=await import('../web/sharing.js');
  const { randomUUID }=await import('node:crypto');
  const local=await sharingFixture();
  try {
    const f=await replicateQualityFixture(local.dir),row={...f.row,id:f.row.job_id,reviewed:false};
    local.state.row=row;const service=createSharing(local.db,local.config),key=randomUUID();
    const denied=p=>assert.rejects(p,e=>e.status===404);
    const action=await service.attempt(f.account,row.id,{event_key:key,mode:'download'});
    assert.equal(action.quality,'unverified');assert.equal(action.demo,false);
    await service.ownerComposite(f.account,row.id,'download',key);
    await denied(service.publish(f.account,row.id,publication()));
    row.quality='accepted';await denied(service.publish(f.account,row.id,publication()));
    row.reviewed=true;const v=await service.publish(f.account,row.id,publication());
    assert.ok((await service.publicRead(v.token)).image.data.length);assert.equal((await service.list()).items.length,1);
    for(const folder of ['depths','configs']) {
      const path=join(local.dir,folder,row.output_key),bytes=await readFile(path);await writeFile(path,'changed SOFTWARE TEST ONLY');
      await denied(service.publicRead(v.token));assert.equal((await service.list()).items.length,0);await writeFile(path,bytes);
    }
    local.state.account.badge_free_entitlement=true;
    await service.ownerComposite(f.account,row.id,'download',key);
    const racing=createSharing(local.db,local.config,{afterPrepare:()=>{local.state.account.billing_hold=true;}});
    await denied(racing.ownerComposite(f.account,row.id,'download',key));await denied(service.publicRead(v.token));
    assert.equal((await service.list()).items.length,0);local.state.account.billing_hold=false;
    await service.revoke(f.account,row.id);await denied(service.publicRead(v.token));
  }finally{await local.cleanup();}
});
