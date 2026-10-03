import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mutateSource, mutationDetected, runTest, verifyMutation } from '../scripts/mutation.js';

test('F04 mutation oracles refuse unrelated assertion, spawn failure and timeout',async()=>{
  const source=await readFile(new URL('../web/sharing.js',import.meta.url),'utf8');
  const dir=await mkdtemp(join(tmpdir(),'n8-f04-oracle-'));
  try {
    const probe=join(dir,'probe.cjs');
    for(const [kind,actual,expected,tag] of [['share-owner',200,404,'SHARE-03 cross-owner composite must return 404'],
      ['share-hold',false,true,'PAY-05 final hold must reject cached paid composite']]) {
      assert.notEqual(mutateSource(source,kind),source);
      assert.throws(()=>mutateSource(mutateSource(source,kind),kind),/mutation_guard_mismatch/);
      await writeFile(probe,`const test=require('node:test');const assert=require('node:assert/strict');test('target',()=>assert.equal(${actual},${expected},${JSON.stringify(tag)}));`);
      const r=runTest(dir,probe,'probe.log');assert.equal(mutationDetected(kind,r),true);
      for(const bad of [{...r,status:0},{...r,signal:'SIGTERM'},{...r,error:new Error('spawn failed')},{...r,output:r.output.replace(tag,'unrelated error')}])assert.equal(mutationDetected(kind,bad),false);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});

// Harness-only synthetic assertion probes. They are not PostgreSQL evidence.
test('SEC-03 mutation oracle accepts only exact tagged owner assertion and rejects unrelated failures',async () => {
  const dir=await mkdtemp(join(tmpdir(),'n8-f01-oracle-'));
  try {
    const probe=join(dir,'probe.cjs');
    async function failure(actual,expected,message) {
      await writeFile(probe,`const test=require('node:test'); const assert=require('node:assert/strict');
        test('synthetic assertion probe',()=>assert.equal(${actual},${expected},${JSON.stringify(message)}));`);
      return runTest(dir,probe,'probe.log');
    }
    const target=await failure(200,404,'SEC-03 cross-owner GET must return 404');
    assert.equal(target.status,1); assert.equal(mutationDetected('owner',target),true);
    const unrelated=await failure(404,200,'legitimate owner read failed before cross-owner assertion');
    assert.equal(unrelated.status,1); assert.equal(mutationDetected('owner',unrelated),false);
    assert.equal(mutationDetected('owner',await failure(500,404,'SEC-03 cross-owner GET must return 404')),false);
    assert.equal(mutationDetected('owner',await failure(200,404,'unrelated 404')),false);
    for(const result of [{...target,status:0},{...target,error:new Error('spawn failed')},
      {...target,error:Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})},{...target,signal:'SIGTERM'}]) {
      assert.equal(mutationDetected('owner',result),false);
    }
    await writeFile(probe,'setInterval(()=>{},1000);');
    const timeout=runTest(dir,probe,'timeout.log',{timeout:100});
    assert.equal(timeout.error?.code,'ETIMEDOUT'); assert.equal(mutationDetected('owner',timeout),false);
    const spawnError=runTest(dir,probe,'spawn-error.log',{executable:join(dir,'absent-node')});
    assert.equal(spawnError.error?.code,'ENOENT'); assert.equal(mutationDetected('owner',spawnError),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('SEC-03 baseline must pass before source changes; no-op and unexpected guards fail closed',async () => {
  const source=await readFile(new URL('../web/media.js',import.meta.url),'utf8');
  const mutated=mutateSource(source,'owner'); assert.notEqual(mutated,source);
  assert.equal(mutated.includes('AND account_id=$2'),false);
  assert.throws(()=>mutateSource(mutated,'owner'),/mutation_guard_mismatch/);
  assert.throws(()=>mutateSource('no guard','owner'),/mutation_guard_mismatch/);
  assert.throws(()=>mutateSource(source.replace('AND account_id=$2','unexpected guard'),'owner'),/mutation_guard_mismatch/);
  const dir=await mkdtemp(join(tmpdir(),'n8-f01-baseline-'));
  try {
    await mkdir(join(dir,'web')); await mkdir(join(dir,'tests'));
    await writeFile(join(dir,'web/media.js'),source);
    await writeFile(join(dir,'tests/integration.test.js'),`const test=require('node:test'); const assert=require('node:assert/strict');
      test('synthetic unrelated baseline failure',()=>assert.equal(404,200));`);
    await assert.rejects(verifyMutation(dir,'owner'),/mutation_baseline_failed/);
    assert.equal(await readFile(join(dir,'web/media.js'),'utf8'),source);
    await writeFile(join(dir,'tests/integration.test.js'),'// Empty baseline cannot prove a guard.');
    await assert.rejects(verifyMutation(dir,'owner'),/mutation_baseline_failed/);
    assert.equal(await readFile(join(dir,'web/media.js'),'utf8'),source);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('SEC-03 budget oracle requires exact assertion: expected one admission, actual two',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'n8-f02a-budget-oracle-'));
  try {
    const source=await readFile(new URL('../web/jobs.js',import.meta.url),'utf8');
    assert.notEqual(mutateSource(source,'budget'),source);
    assert.throws(()=>mutateSource(mutateSource(source,'budget'),'budget'),/mutation_guard_mismatch/);
    const probe=join(dir,'probe.cjs');
    for(const [actual,expected,message,detected] of [[2,1,'SEC-03 budget last slot admits exactly one',true],
      [3,1,'SEC-03 budget last slot admits exactly one',false],[2,1,'unrelated failure',false]]) {
      await writeFile(probe,`const test=require('node:test');const assert=require('node:assert/strict');
        test('synthetic budget oracle probe',()=>assert.equal(${actual},${expected},${JSON.stringify(message)}));`);
      const result=runTest(dir,probe,'probe.log');assert.equal(mutationDetected('budget',result),detected);
      if(detected) for(const bad of [{...result,status:0},{...result,signal:'SIGTERM'},{...result,error:new Error('spawn failed')}]) assert.equal(mutationDetected('budget',bad),false);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});


test('PAY-02 payment mutation oracle targets only the exact merchant-binding assertion',async()=>{
  const source=await readFile(new URL('../web/provider.js',import.meta.url),'utf8');
  const mutated=mutateSource(source,'payment');assert.notEqual(mutated,source);
  assert.throws(()=>mutateSource(mutated,'payment'),/mutation_guard_mismatch/);
  const dir=await mkdtemp(join(tmpdir(),'n8-payment-oracle-'));
  try {
    const probe=join(dir,'probe.cjs');
    await writeFile(probe,`const test=require('node:test'); const assert=require('node:assert/strict');
      test('target',()=>assert.equal(false,true,'PAY-02 wrong merchant must be rejected'));`);
    const result=runTest(dir,probe,'probe.log');assert.equal(mutationDetected('payment',result),true);
    for(const bad of [{...result,status:0},{...result,signal:'SIGTERM'},{...result,error:new Error('timeout')},
      {...result,output:result.output.replace('PAY-02 wrong merchant must be rejected','unrelated assertion')}])assert.equal(mutationDetected('payment',bad),false);
  }finally {await rm(dir,{recursive:true,force:true});}
});

// Runner-only probes below are synthetic; none is real PG send-CAS evidence.
test('F07 send CAS mutation changes only two exact guards and refuses source drift',async()=>{
  const source=await readFile(new URL('../web/provider-submissions.js',import.meta.url),'utf8');
  const early="if(s.state!=='preflight')return {authorized:false,code:'submission_no_replay',submission:s};";
  const cas="WHERE id=$1 AND state='preflight' RETURNING *";
  const mutated=mutateSource(source,'replicate-send-cas');
  assert.equal(mutated,source.replace(early,'/* send no-replay precondition removed */').replace(cas,'WHERE id=$1 RETURNING *'));
  for(const guard of [early,cas]) {
    assert.throws(()=>mutateSource(source.replace(guard,''),'replicate-send-cas'),/mutation_guard_mismatch/);
    assert.throws(()=>mutateSource(source+'\n'+guard,'replicate-send-cas'),/mutation_guard_mismatch/);
  }
  assert.throws(()=>mutateSource(mutated,'replicate-send-cas'),/mutation_guard_mismatch/);
});

test('F07 send CAS recognizer accepts only named 1 versus 2 assertion, including nested TAP',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'n8-send-cas-oracle-'));
  try {
    const probe=join(dir,'probe.cjs'),tag='F07-CAS exactly one create POST';
    await writeFile(probe,`const test=require('node:test');const assert=require('node:assert/strict');
      test('parent',async t=>{await t.test('target',()=>assert.equal(2,1,${JSON.stringify(tag)}));
        await t.test('normal regression',()=>assert.ok(true));});`);
    const target=runTest(dir,probe,'target.log',{concurrency:1});
    assert.equal(target.status,1);assert.equal(mutationDetected('replicate-send-cas',target),true);
    for(const bad of [{...target,status:0},{...target,status:2},{...target,signal:'SIGTERM'},
      {...target,error:new Error('ETIMEDOUT')},{...target,output:target.output.replace(tag,'unrelated')},
      {...target,output:target.output.replace('actual: 2','actual: 3')},
      {...target,output:target.output.replace('expected: 1','expected: 2')},
      {...target,output:target.output.replace("code: 'ERR_ASSERTION'","code: 'ECONNREFUSED'")}])
      assert.equal(mutationDetected('replicate-send-cas',bad),false);
    for(const error of ['SyntaxError','Error']) {
      await writeFile(probe,`const test=require('node:test');const assert=require('node:assert/strict');
        test('parent',async t=>{await t.test('target',()=>assert.equal(2,1,${JSON.stringify(tag)}));
          await t.test('infrastructure',()=>{throw new ${error}('database_or_syntax_failure');});});`);
      assert.equal(mutationDetected('replicate-send-cas',runTest(dir,probe,'mixed.log',{concurrency:1})),false);
    }
    await writeFile(probe,'setInterval(()=>{},1000);');
    assert.equal(mutationDetected('replicate-send-cas',runTest(dir,probe,'timeout.log',{timeout:100,concurrency:1})),false);
    assert.equal(mutationDetected('replicate-send-cas',runTest(dir,probe,'spawn.log',{executable:join(dir,'absent')})),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('F07 send CAS inconclusive runner restores bytes and preserves three raw logs and hashes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'n8-send-cas-restore-'));
  const evidence=join(dir,'evidence'),source=await readFile(new URL('../web/provider-submissions.js',import.meta.url));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  try {
    for(const p of ['web','scripts','tests'])await mkdir(join(dir,p));
    await writeFile(join(dir,'web/provider-submissions.js'),source);
    const runner=await readFile(new URL('../scripts/mutation.js',import.meta.url));
    await writeFile(join(dir,'scripts/mutation.js'),runner);
    // Intentionally insensitive unit probe: the runner must refuse a green mutant.
    const testSource="const test=require('node:test');test('insensitive runner probe',()=>{});\n";
    const testPath=join(dir,'tests/replicate-send-cas.integration.test.js');await writeFile(testPath,testSource);
    await assert.rejects(verifyMutation(dir,'replicate-send-cas'),/mutation_evidence_directory_required/);
    await assert.rejects(verifyMutation(dir,'replicate-send-cas',{evidenceDir:evidence}),/mutation_inconclusive/);
    assert.deepEqual(await readFile(join(dir,'web/provider-submissions.js')),source);
    assert.equal(await readFile(testPath,'utf8'),testSource);
    const receipt=JSON.parse(await readFile(join(evidence,'receipt.json'),'utf8'));
    assert.equal(receipt.verdict,'inconclusive');assert.equal(receipt.targeted_red,false);
    assert.equal(receipt.identical,true);assert.equal(receipt.restored_green,true);
    assert.equal(receipt.source_sha256,hash(source));assert.equal(receipt.runner_sha256,hash(runner));
    assert.equal(receipt.test_sha256,hash(testSource));
    for(const name of ['baseline','mutant','restored']) {
      const log=await readFile(join(evidence,name+'.log'));assert.ok(log.length);
      assert.equal(receipt.runs[name].status,0);assert.equal(receipt.runs[name].log_sha256,hash(log));
    }
    await assert.rejects(verifyMutation(dir,'replicate-send-cas',{evidenceDir:evidence}),{code:'EEXIST'});
  }finally{await rm(dir,{recursive:true,force:true});}
});
