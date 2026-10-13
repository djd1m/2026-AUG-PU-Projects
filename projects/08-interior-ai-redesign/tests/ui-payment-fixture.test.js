import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {driveFixturePayment} from '../scripts/ui/payment-ready.js';
import {ownedPool,fixtureConfig} from '../scripts/ui/fixture-driver.js';

const config={runtime:'test',providerMode:'fixture',origin:'https://n8-ui.test',platformDailyLimit:200,accountDailyLimit:20};
// Local helper simulation only: no browser, PostgreSQL or payment acceptance.
function fixture(patch={}) {
  const target={id:randomUUID(),status:'created',provider_id:null,provider_mode:'fixture',...patch};
  const reads=[],signals=[],delays=[];let clock=0,passes=0,row=target;
  const pool={async query(sql,values) {
    assert.equal(sql,'SELECT id,status,provider_id,provider_mode FROM payment_intent WHERE id=$1');
    assert.deepEqual(values,[target.id]);reads.push(values[0]);return {rows:row?[{...row}]:[]};
  }};
  const options={now:()=>clock,sleep:async ms=>{delays.push(ms);clock+=ms;},
    runOne:async()=>{passes++;return false;},
    signal:async(p,c,id,action)=>{
      assert.equal(target.status,'pending','Success requires target readiness, not another intent');
      assert.ok(target.provider_id,'Success requires the target provider binding');
      assert.equal(p,pool);assert.equal(c,config);signals.push({id,action});}};
  return {target,pool,options,reads,signals,delays,get passes(){return passes;},
    missing(){row=null;},advance(ms){clock+=ms;},run:()=>driveFixturePayment(pool,config,target.id,options)};
}

test('preceding intent readiness cannot settle target; temporary target lease waits for its own provider',async()=>{
  const f=fixture(),older={id:randomUUID(),status:'created',provider_id:null};let calls=0,leased=true;
  f.options.runOne=async()=>{
    calls++;
    if(calls===1){older.status='pending';older.provider_id=randomUUID();return true;}
    assert.equal(leased,true);return false;
  };
  const sleep=f.options.sleep;
  f.options.sleep=async ms=>{
    assert.deepEqual(f.signals,[],'No signal before the target becomes ready');
    await sleep(ms);
    if(calls===3){leased=false;f.target.status='pending';f.target.provider_id=randomUUID();}
  };
  assert.deepEqual(await f.run(),{software_fixture:true});
  assert.equal(calls,3,'Must survive older progress and two leased/no-progress passes');
  assert.equal(older.status,'pending','The preceding intent must not be settled');
  assert.deepEqual(f.signals,[{id:f.target.id,action:'success'}]);
  assert.ok(f.reads.every(id=>id===f.target.id));
  assert.deepEqual(f.delays,[50,50,50]);
});

test('unleased target becomes ready after preceding queue item, with no unnecessary sleep',async()=>{
  const f=fixture();let passes=0;
  f.options.runOne=async()=>{
    if(++passes===2){f.target.status='pending';f.target.provider_id=randomUUID();}return true;
  };
  await f.run();assert.equal(passes,2);assert.deepEqual(f.delays,[50]);
  assert.deepEqual(f.signals,[{id:f.target.id,action:'success'}]);
});

test('already-ready target is signaled without running an unrelated queue candidate',async()=>{
  const f=fixture({status:'pending',provider_id:randomUUID()});await f.run();
  assert.equal(f.passes,0);assert.equal(f.signals.length,1);assert.deepEqual(f.delays,[]);
});

test('missing, terminal and wrong fixture binding fail before queue or settlement',async()=>{
  const missing=fixture();missing.missing();await assert.rejects(missing.run(),/fixture_payment_missing/);
  for(const status of ['succeeded','canceled','review']) {
    const f=fixture({status,provider_id:randomUUID()});await assert.rejects(f.run(),new RegExp('fixture_payment_terminal:'+status));
    assert.equal(f.passes,0);assert.deepEqual(f.signals,[]);
  }
  const wrong=fixture({provider_mode:'live'});await assert.rejects(wrong.run(),/fixture_payment_binding_invalid/);
  assert.equal(missing.passes,0);assert.deepEqual(missing.signals,[]);assert.equal(wrong.passes,0);
});

test('terminal transition during worker pass fails without a success signal',async()=>{
  const f=fixture();f.options.runOne=async()=>{f.target.status='review';return true;};
  await assert.rejects(f.run(),/fixture_payment_terminal:review/);assert.deepEqual(f.signals,[]);
});

test('not-ready target exhausts finite tries even when injected clock never advances',async()=>{
  for(const status of ['created','pending']) {
    const f=fixture({status});f.options.sleep=async ms=>f.delays.push(ms);
    await assert.rejects(f.run(),/fixture_payment_readiness_exhausted/);
    assert.equal(f.passes,100);assert.equal(f.delays.length,99);assert.deepEqual(f.signals,[]);
  }
});

test('deadline stops retries and prevents signaling readiness attached too late',async()=>{
  const f=fixture();f.options.runOne=async()=>{
    f.advance(10001);f.target.status='pending';f.target.provider_id=randomUUID();return true;
  };
  await assert.rejects(f.run(),/fixture_payment_readiness_exhausted/);
  assert.deepEqual(f.signals,[]);assert.deepEqual(f.delays,[]);
});

test('deadline reached during a readiness read prevents a late success signal',async()=>{
  const f=fixture({status:'pending',provider_id:randomUUID()}),query=f.pool.query;
  f.pool.query=async(...args)=>{f.advance(10000);return query(...args);};
  await assert.rejects(f.run(),/fixture_payment_readiness_exhausted/);
  assert.equal(f.passes,0);assert.deepEqual(f.signals,[]);
});

test('runtime/mode/UUID and existing dedicated ownership guards remain strict',async()=>{
  const f=fixture();
  for(const bad of [{runtime:'production',providerMode:'fixture'},{runtime:'test',providerMode:'live'}])
    await assert.rejects(driveFixturePayment(f.pool,bad,f.target.id,f.options),/Explicit nonproduction fixture required/);
  await assert.rejects(driveFixturePayment(f.pool,config,'bad',f.options));assert.deepEqual(f.reads,[]);
  await assert.rejects(ownedPool({DATABASE_URL:'postgres://localhost/foreign',UI_SCHEMA:'foreign'}),/dedicated_owned_fixture_required/);
  assert.throws(()=>fixtureConfig({STORAGE_DIR:'/tmp/foreign'}),/owned_private_storage_required/);
});

test('query and worker failures propagate instead of reporting fixture success',async()=>{
  const f=fixture();f.options.runOne=async()=>{throw new Error('worker_failure');};
  await assert.rejects(f.run(),/worker_failure/);assert.deepEqual(f.signals,[]);
  f.pool.query=async()=>{throw new Error('read_failure');};
  await assert.rejects(f.run(),/read_failure/);assert.deepEqual(f.signals,[]);
});
