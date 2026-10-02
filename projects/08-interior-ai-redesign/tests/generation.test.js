import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { Engine, artifactRead, canonical, createResults, prepareArtifacts, runClaim, sha } from '../web/generation.js';

// Real OS subprocess and real bounded files. Engine is a labelled stdlib test
// double, never a successful real inference/geometry evidence claim.
test('F02b real subprocess bounds, cancellation, lease and cleanup',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'n8-f02b-generation-'));
  const png=await sharp({create:{width:8,height:8,channels:3,background:'#abc'}}).png().toBuffer();
  const inputKey=randomUUID();await writeFile(join(dir,inputKey),png);await prepareArtifacts(dir);
  const script=fileURLToPath(new URL('./engine-double.py',import.meta.url));
  const engines=[];
  function engine(caseName='success') {const e=new Engine('python3',[script],{...process.env,STORAGE_DIR:dir,TEST_PNG:png.toString('base64'),TEST_ENGINE_CASE:caseName});engines.push(e);return e;}
  const config={storageDir:dir,workerMode:'fixture',seed:1,manifestSha:sha('synthetic'),modelRevisions:{sd:'synthetic',controlnet:'synthetic',depth:'synthetic'},sourceRevision:'1'.repeat(40)};
  const claim=()=>({job_id:randomUUID(),account_id:randomUUID(),upload_id:randomUUID(),style:'warm',fence:1,attempt_deadline:new Date(Date.now()+5000),hard_deadline:new Date(Date.now()+10000)});
  const pool={async query(sql){return {rows:[sql.includes('FROM upload')?{private_key:inputKey,sha256:sha(png)}:{created_at:new Date(Date.now()-100)}]};}};
  let completed=[],failed=[];
  const jobs={async heartbeat(){return true;},async complete(id,fence,output){completed.push(output);return true;},async fail(id,fence){failed.push([id,fence]);return true;}};
  try {
    await t.test('one persistent subprocess survives two requests; fixture has actual independent hashes',async()=>{
      const e=engine();assert.equal(await runClaim(pool,jobs,e,config,claim()),true);const pid=e.child.pid;
      assert.equal(await runClaim(pool,jobs,e,config,claim()),true);assert.equal(e.child.pid,pid);
      assert.equal(completed[0].evidence.output_sha,sha(png));assert.equal(completed[0].mode,'fixture');
      await e.stop();
    });
    await t.test('actual bytes/hash mismatch refuses completion and removes all orphan artifacts',async()=>{
      completed=[];const e=engine('mismatch');await assert.rejects(runClaim(pool,jobs,e,config,claim()),/artifact_hash_mismatch/);assert.equal(completed.length,0);
      assert.equal((await readdir(join(dir,'outputs'))).length,2);assert.equal(e.child,null);
    });
    await t.test('deadline kills actual subprocess; partial artifacts removed',async()=>{
      const c=claim();c.attempt_deadline=new Date(Date.now()+120);
      await assert.rejects(runClaim(pool,jobs,engine('hang'),config,c),/engine_cancelled/);
      assert.equal((await readdir(join(dir,'outputs'))).length,2);
    });
    await t.test('lost heartbeat cancels child and fences attach',async()=>{
      let attached=0;const q={...jobs,async heartbeat(){return false;},async complete(){attached++;return true;}};
      await assert.rejects(runClaim(pool,q,engine('hang'),config,claim(),{heartbeatMs:20}),/engine_cancelled/);assert.equal(attached,0);
    });
    await t.test('external cancellation kills subprocess',async()=>{
      const abort=new AbortController();const e=engine('hang');const pending=e.request({},{signal:abort.signal});setTimeout(()=>abort.abort(),30);
      await assert.rejects(pending,/engine_cancelled/);await e.stop();assert.equal(e.child,null);
    });
    await t.test('invalid and oversized stdout fail bounded protocol',async()=>{
      for(const name of ['invalid','flood'])await assert.rejects(engine(name).request({}),/engine_protocol_or_exit/);
    });
    await t.test('stale fence cleans otherwise valid result',async()=>{
      await assert.rejects(runClaim(pool,{...jobs,async complete(){return false;}},engine(),config,claim()),/stale_fence/);
      assert.equal((await readdir(join(dir,'outputs'))).length,2);
    });
    await t.test('symlinks and unbounded artifact bytes denied',async()=>{
      const key=randomUUID();await symlink(join(dir,inputKey),join(dir,key));await assert.rejects(artifactRead(dir,key),/symlink/);
      await assert.rejects(artifactRead(dir,inputKey,1),/size/);
    });
    await t.test('private reads enforce owner/rejection twice and exact immutable bytes',async()=>{
      const key=completed[0]?.output_key??(await readdir(join(dir,'outputs')))[0];
      const owner=randomUUID(),id=randomUUID();let denied=false;
      const db={async query(sql,params){assert.match(sql,/j.account_id=\$2/);assert.match(sql,/j.quality<>'rejected'/);return {rows:params[1]===owner&&!denied?[{output_key:key,output_sha:sha(png)}]:[]};}};
      const results=createResults(db,dir);assert.deepEqual((await results.read(owner,id)).data,png);
      await assert.rejects(results.read(randomUUID(),id),e=>e.status===404);denied=true;await assert.rejects(results.read(owner,id),e=>e.status===404);
      denied=false;await writeFile(join(dir,'outputs',key),Buffer.from('changed'));await assert.rejects(results.read(owner,id),e=>e.status===404);
    });
    assert.ok(failed.length>=4);
    assert.equal(canonical({b:1,a:2}),'{'+'"a":2,"b":1}');
  }finally{await Promise.all(engines.map(e=>e.stop()));await rm(dir,{recursive:true,force:true});}
});
