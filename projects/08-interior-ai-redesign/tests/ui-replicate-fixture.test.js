import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {assertOwnedPool} from '../scripts/ui/fixture-driver.js';
import {assertHostedFixture,createHostedFixture,hostedBoundary,responseGate} from '../scripts/ui/replicate-fixture.js';
import {workerConfig} from '../scripts/worker.js';
import {workerEnv} from './replicate-generation-fixtures.js';
const config={runtime:'test',providerMode:'fixture',origin:'https://n8-ui.test',storageDir:'/tmp/n8-ui-'+'a'.repeat(24),
  platformDailyLimit:200,accountDailyLimit:20};
const bytes={depth:Buffer.from('synthetic depth'),generated:Buffer.from('synthetic output')};
async function call(request,method,path) {
  return new Promise((resolve,reject)=>{
    const req=request({method,path},res=>{
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);
    });req.on('error',reject);req.end();
  });
}
test('hosted fixture requires exact test runtime/origin/storage/caps and owned pool before SQL',async()=>{
  assertHostedFixture(config);
  for(const patch of [{runtime:'production'},{providerMode:'disabled'},{origin:'http://localhost'},
    {storageDir:'/tmp/other'},{platformDailyLimit:201},{accountDailyLimit:21}])
    assert.throws(()=>assertHostedFixture({...config,...patch}),/owned_hosted_test_fixture_required/);
  let queries=0;const pool={query(){queries++;throw new Error('must not query');}};
  assert.throws(()=>assertOwnedPool(pool),/dedicated_owned_fixture_required/);
  await assert.rejects(createHostedFixture(pool,config),/dedicated_owned_fixture_required/);assert.equal(queries,0);
});
test('mock boundaries always supply API and delivery transports, unique identities, safe counts only',async()=>{
  const a=hostedBoundary(bytes),b=hostedBoundary(bytes);
  const first=JSON.parse(await call(a.options.transportOptions.request,'POST','/synthetic'));
  const second=JSON.parse(await call(a.options.transportOptions.request,'GET','/synthetic'));
  const other=JSON.parse(await call(b.options.transportOptions.request,'POST','/synthetic'));
  assert.equal(first.status,'starting');assert.equal(second.status,'succeeded');assert.equal(first.id,second.id);assert.notEqual(first.id,other.id);
  assert.deepEqual(await call(a.options.mediaOptions.request,'GET','/depth'),bytes.depth);
  assert.deepEqual(await call(a.options.mediaOptions.request,'GET','/output'),bytes.generated);
  assert.deepEqual(a.counts(),{api:2,post:1,get:1,delivery:2});
  assert.equal(/https|synthetic|token|prediction/.test(JSON.stringify(a.counts())),false);
});
test('response gate proves send observation before release, and rejects a bounded expiry',async()=>{
  const gate=responseGate(),b=hostedBoundary(bytes,{gate});let completed=false;
  const pending=call(b.options.transportOptions.request,'POST','/synthetic').then(()=>{completed=true;});
  try {await gate.entered;assert.equal(completed,false);assert.equal(b.counts().post,1);gate.release();await pending;assert.equal(completed,true);}
  finally {gate.release();}
  const expired=responseGate(5);await assert.rejects(expired.wait(),/fixture_response_gate_expired/);expired.release();
  for(const n of [0,15001,NaN])assert.throws(()=>responseGate(n),/fixture_gate_bound_required/);
});
test('actual worker config missing/disabled rejects before every mock HTTP and delivery call',async()=>{
  for(const patch of [{REPLICATE_API_TOKEN:undefined},{WORKER_MODE:'disabled'},{REPLICATE_AUTHORIZATION_SHA:undefined}]) {
    const boundary=hostedBoundary(bytes);
    await assert.rejects(workerConfig(workerEnv(config.storageDir,randomUUID(),patch)),/replicate_config_denied|worker_mode_denied/);
    assert.deepEqual(boundary.counts(),{api:0,post:0,get:0,delivery:0});
  }
});

test('mock API failure is propagated with no delivery calls or alternative transport',async()=>{
  const b=hostedBoundary(bytes,{afterSend:async()=>{throw new Error('synthetic failure');}});
  await assert.rejects(call(b.options.transportOptions.request,'POST','/synthetic'),/synthetic failure/);
  assert.deepEqual(b.counts(),{api:1,post:1,get:0,delivery:0});
});
