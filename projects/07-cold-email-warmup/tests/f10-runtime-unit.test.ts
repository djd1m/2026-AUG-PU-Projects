import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runRuntime } from '../src/runtime/loop.js';
import type { RuntimeClaim,RuntimeStore } from '../src/runtime/store.js';
test('finite runtime lanes join owned operations on abort before returning',async()=>{
 const abort=new AbortController();let started=0,joined=0,claims=0,peak=0,active=0,settled=0;
 const store={async maintenance(){return 0;},async claim(kind:string){claims++;return {kind,owner_id:String(claims)} as RuntimeClaim;},async finish(){return 1;},async cancel(){assert.ok(joined>settled);settled++;return 1;}} as unknown as RuntimeStore;
 const operation=async(_claim:RuntimeClaim,signal:AbortSignal)=>{
  started++;active++;peak=Math.max(peak,active);
  await new Promise<void>(resolve=>signal.addEventListener('abort',()=>{setTimeout(resolve,20);},{once:true}));
  joined++;active--;return {satisfied:true};
 };
 const pending=runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal);
 await new Promise(r=>setTimeout(r,10));assert.equal(started,7);abort.abort();await pending;
 assert.equal(joined,7);assert.equal(peak,7);assert.equal(active,0);assert.equal(claims,7);assert.equal(settled,7);
});
test('database faults stop admission and abort the internal signal before joining sibling lanes',async()=>{
 const external=new AbortController();let claimed=0,joined=0,siblings=0,failed=false;
 const store={async maintenance(){return 0;},async claim(kind:string){claimed++;return {kind,owner_id:String(claimed)} as RuntimeClaim;},async finish(){assert.fail('fatal DB shutdown must not finish or admit again');},async cancel(){return 1;}} as unknown as RuntimeStore;
 const operation=async(c:RuntimeClaim,signal:AbortSignal)=>{
  if(c.kind==='pool'){await new Promise(r=>setTimeout(r,10));failed=true;throw Object.assign(new Error('connection terminated'),{code:'08006'});}
  siblings++;await new Promise<void>(resolve=>{signal.addEventListener('abort',()=>{setTimeout(()=>{joined++;resolve();},10);},{once:true});});return {};
 };
 await assert.rejects(runRuntime(store,{poll:operation,pool:operation,dispatch:operation},external.signal),/connection terminated/);
 assert.equal(external.signal.aborted,false,'sibling cancellation uses runtime internal signal');assert.equal(failed,true);assert.equal(siblings,6);assert.equal(joined,6);assert.equal(claimed,7);
});

test('settled runtime operations yield to the event loop before another fair claim',async()=>{const abort=new AbortController();let claims=0,yielded=false;const store={takeCaptureAdmission(){return null;},async disposeCaptureAdmission(){},async maintenance(){return 0;},async claim(kind:string){claims++;if(claims>7){assert.equal(yielded,true);abort.abort();}return {kind,owner_id:String(claims)} as RuntimeClaim;},async finish(){setImmediate(()=>{yielded=true;});return 1;},async cancel(){return 1;}} as unknown as RuntimeStore;const operation=async()=>({satisfied:true});await runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal);assert.equal(yielded,true);assert.ok(claims>=8);});

test('maintenance reconciles after five seconds without an immediate duplicate sweep',async()=>{const abort=new AbortController();let sweeps=0;const store={async maintenance(){sweeps++;return 0;},async claim(){return null;}} as unknown as RuntimeStore;const operation=async()=>({});const pending=runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal);await new Promise(r=>setTimeout(r,1200));assert.equal(sweeps,1);await new Promise(r=>setTimeout(r,4100));assert.equal(sweeps,2);abort.abort();await pending;});

test('abort after committed claim settles ownership without starting an operation',async()=>{
 const abort=new AbortController();let claims=0,cancelled=0,operations=0;
 const store={async maintenance(){return 0;},async claim(kind:string){claims++;abort.abort();return {kind,owner_id:String(claims)} as RuntimeClaim;},async cancel(){cancelled++;return 1;}} as unknown as RuntimeStore;
 const operation=async()=>{operations++;return {};};
 await runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal);
 assert.equal(operations,0);assert.ok(claims>0);assert.equal(cancelled,claims);
});


test('preadmitted slots are one-use and unused cleanup refuses a child-bound owner',async()=>{
 const {acquireTransportSlotInTransaction,consumePreadmittedSlot,releaseUnusedTransportSlot,bindTransportChild}=await import('../src/mailboxes/transport-slots.js');
 const {ChildProcess}=await import('node:child_process');let released=0;
 const client={async query(sql:string){if(sql.startsWith('SELECT slot'))return {rows:[{slot:1}],rowCount:1};if(sql.includes('SET operation=NULL'))released++;return {rows:[],rowCount:sql.startsWith('SELECT')?0:1};},release(){}};
 const pool={async connect(){return client;}} as unknown as import('pg').Pool;
 const slot=await acquireTransportSlotInTransaction(client as unknown as import('pg').PoolClient,'imap','tenant','mailbox');
 assert.throws(()=>consumePreadmittedSlot({...slot},'tenant','mailbox'));
 assert.throws(()=>consumePreadmittedSlot(slot,'other','mailbox'));
 consumePreadmittedSlot(slot,'tenant','mailbox');assert.throws(()=>consumePreadmittedSlot(slot,'tenant','mailbox'));
 assert.equal(await releaseUnusedTransportSlot(pool,slot),true);assert.equal(released,1);
 const bound=await acquireTransportSlotInTransaction(client as unknown as import('pg').PoolClient,'imap','tenant','mailbox');bindTransportChild(bound,new ChildProcess());assert.equal(await releaseUnusedTransportSlot(pool,bound),false);assert.equal(released,1);
});

test('unused reservation cleanup retains exact proof after a database release failure',async()=>{
 const {acquireTransportSlotInTransaction,releaseUnusedTransportSlot}=await import('../src/mailboxes/transport-slots.js');let failed=false,attempts=0;
 const client={async query(sql:string){if(sql.startsWith('SELECT slot'))return {rows:[{slot:1}],rowCount:1};if(sql.includes('SET operation=NULL')){attempts++;if(!failed){failed=true;throw new Error('database fault');}}return {rows:[],rowCount:sql.startsWith('SELECT')?0:1};},release(){}};
 const slot=await acquireTransportSlotInTransaction(client as unknown as import('pg').PoolClient,'imap','tenant','mailbox');const pool={async connect(){return client;}} as unknown as import('pg').Pool;
 await assert.rejects(releaseUnusedTransportSlot(pool,slot),/database fault/);assert.equal(await releaseUnusedTransportSlot(pool,slot),true);assert.equal(attempts,2);
});
