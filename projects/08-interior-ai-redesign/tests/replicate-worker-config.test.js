import test from 'node:test';
import assert from 'node:assert/strict';
import { workerConfig } from '../scripts/worker.js';
import { readConfig } from '../web/config.js';
import { replicateSettings,replicateTransportConfig,REPLICATE_ACCEPTANCES } from '../web/replicate-worker-config.js';
import { workerEnv } from './replicate-generation-fixtures.js';
test('hosted config exact pins, fixed styles and nonenumerable private token',async()=>{
  const env=workerEnv('/tmp/owned-private-test'),c=await workerConfig(env),transport=replicateTransportConfig(c);
  assert.equal(c.seed,42);assert.ok(!JSON.stringify(c).includes(env.REPLICATE_API_TOKEN));
  assert.equal(transport.token,env.REPLICATE_API_TOKEN);assert.ok(!JSON.stringify(transport).includes(env.REPLICATE_API_TOKEN));
  assert.equal(Object.getOwnPropertyDescriptor(transport,'token').enumerable,false);
  const prompts=[];for(const style of ['warm','minimal','afrohemian','playful']) {
    const s=replicateSettings(c,style);prompts.push(s.prompt);assert.match(s.prompt,/doors, windows and openings/);
    assert.deepEqual([s.num_samples,s.image_resolution,s.detect_resolution,s.ddim_steps,s.scale,s.eta,s.seed],['1','512',512,30,7.5,0,42]);
    assert.ok(Object.isFrozen(s));
  }
  assert.equal(new Set(prompts).size,4);assert.throws(()=>replicateSettings(c,'caller prompt'));
  assert.throws(()=>replicateTransportConfig({...c}));assert.throws(()=>readConfig(env));
});
test('missing/invalid pins, token, accepts, envelope, seed or source deny',async()=>{
  const env=workerEnv('/tmp/owned-private-test');
  for(const field of ['REPLICATE_MODEL','REPLICATE_VERSION','REPLICATE_CONTRACT_SHA','REPLICATE_API_TOKEN',
    'REPLICATE_SPEND_BUDGET_ID','WORKER_SOURCE_REVISION','WORKER_SEED',...REPLICATE_ACCEPTANCES.map(k=>'REPLICATE_'+k.toUpperCase())]) {
    await assert.rejects(workerConfig({...env,[field]:undefined}));await assert.rejects(workerConfig({...env,[field]:'bad\n'}));
  }
  for(const seed of ['2147483648','4294967295','-1','01'])await assert.rejects(workerConfig({...env,WORKER_SEED:seed}));
  assert.equal((await workerConfig({...env,WORKER_SEED:'2147483647'})).seed,2147483647);
  for(const token of ['','a'.repeat(513),'with space','line\n'])await assert.rejects(workerConfig({...env,REPLICATE_API_TOKEN:token}));
});
test('fixture retains wider seed and existing common validation',async()=>{
  const env=workerEnv('/tmp/owned-private-test'),c=await workerConfig({...env,WORKER_MODE:'fixture',WORKER_SEED:'4294967295'});
  assert.equal(c.seed,4294967295);assert.equal(c.modelRevisions.sd,'synthetic-fixture');
  await assert.rejects(workerConfig({...env,WORKER_MODE:'fixture',NODE_ENV:'production'}));
  await assert.rejects(workerConfig({...env,PLATFORM_DAILY_LIMIT:'201'}));
});
