import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntent,createScope,nativeOutcome,safeConfirmation} from '../web/public/ui-state.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('uncertain response survives reload with same body/key; selection and account isolate',()=>{
  const store=storage();let n=0;const uuid=()=>String(++n);
  const a=createIntent(store,'accountA',uuid),body={upload_id:'room1',style:'warm'},first=a.select(body);
  const reloaded=createIntent(store,'accountA',uuid);assert.deepEqual(reloaded.select(body),first);
  assert.notEqual(reloaded.select({...body,style:'minimal'}).idempotency_key,first.idempotency_key);
  assert.notEqual(reloaded.select(body).idempotency_key,first.idempotency_key);
  assert.equal(createIntent(store,'accountB',uuid).get(),null);
  reloaded.resolved('job1');assert.equal(createIntent(store,'accountA').get().id,'job1');reloaded.clear();assert.equal(reloaded.get(),null);
});
test('account switch aborts and rejects late former-owner image even if transport ignores abort',async()=>{
  const scope=createScope();let complete,signal;
  const old=scope.run(s=>{signal=s;return new Promise(resolve=>{complete=resolve;});});
  scope.reset();assert.equal(signal.aborted,true);complete('former-owner-image');await assert.rejects(old,/stale_account/);
  assert.equal(await scope.run(async()=> 'new-owner-image'),'new-owner-image');
});
test('native outcomes depend on promise; invocation starts immediately in user gesture',async()=>{
  const file={name:'roomkind.webp'};let invoked=false;
  const pending=nativeOutcome(file,{canShare:()=>true,share:()=>{invoked=true;return Promise.resolve();}});
  assert.equal(invoked,true);assert.equal(await pending,'resolved');
  for(const [name,outcome] of [['AbortError','abort'],['TypeError','error']])assert.equal(await nativeOutcome(file,{canShare:()=>true,share:()=>Promise.reject(Object.assign(new Error(),{name}))}),outcome);
  assert.equal(await nativeOutcome(file,{}),'unavailable');
  assert.equal(await nativeOutcome(file,{share(){throw new Error('must not run');},canShare:()=>false}),'unavailable');
});
test('checkout rejects executable/insecure/credential URLs; fixture stays local',()=>{
  for(const url of ['javascript:alert(1)','https://user:secret@example.test','http://example.test'])assert.equal(safeConfirmation(url,'live','http://localhost'),null);
  assert.equal(safeConfirmation('http://localhost/','fixture','http://localhost'),'http://localhost/');
  assert.equal(safeConfirmation('http://foreign.test/','fixture','http://localhost'),null);
  assert.equal(safeConfirmation('https://yoomoney.ru/checkout','live','http://localhost'),'https://yoomoney.ru/checkout');
});
