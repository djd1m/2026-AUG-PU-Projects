import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mutateSource, mutationDetected, runTest, verifyMutation } from '../scripts/mutation.js';

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
