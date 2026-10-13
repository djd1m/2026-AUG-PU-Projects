import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RuntimeStore} from '../src/runtime/store.js';
import {runRuntime} from '../src/runtime/loop.js';
import {runtimeFixture} from './f10-runtime-fixture.js';
const mark=(phase:string,counts?:unknown)=>console.log('A34_AWAIT '+JSON.stringify({phase,pid:process.pid,utc:new Date().toISOString(),counts}));
const count=async(pool:any)=>Number((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count);
test('A34 direct cancellation releases its never-started reservation',async()=>{
 const {pool}=await runtimeFixture(5);const store=new RuntimeStore(pool,async()=>{});let claim:any;
 try{await store.maintenance();mark('claim_begin');claim=await store.claim('poll');mark('claim_end',await count(pool));assert.ok(claim);mark('cancel_begin');await store.cancel(claim);mark('cancel_end',await count(pool));assert.equal(await count(pool),0,'direct cancel must release never-started physical reservation');}
 finally{mark('exact_unused_cleanup_begin');if(claim)await store.disposeUnusedAdmission(claim);mark('exact_unused_cleanup_end',await count(pool));mark('pool_end_begin');await pool.end();mark('pool_end_end');}
});
test('A34 abort after committed native claim releases slots before any operation',async()=>{
 const {pool}=await runtimeFixture(5);const store=new RuntimeStore(pool,async()=>{}),abort=new AbortController(),seen:any[]=[];let operations=0;const original=store.claim.bind(store);
 store.claim=async kind=>{mark('abort_claim_begin');const claim=await original(kind);if(claim){seen.push(claim);abort.abort();}mark('abort_claim_end',{claimed:Boolean(claim),reserved:Boolean(claim&&store.pollAdmission(claim)?.slot)});return claim;};const operation=async()=>{operations++;return {};};
 try{mark('runtime_begin');await runRuntime(store,{poll:operation,pool:operation,dispatch:operation},abort.signal,true);mark('runtime_joined',{operations,claimed:seen.length,slots:await count(pool)});assert.equal(operations,0,'abort invokes zero operation callbacks');assert.equal(await count(pool),0,'aborted committed native claims release never-started physical reservations');}
 finally{mark('abort_exact_unused_cleanup_begin');for(const claim of seen)await store.disposeUnusedAdmission(claim);mark('abort_exact_unused_cleanup_end',await count(pool));mark('abort_pool_end_begin');await pool.end();mark('abort_pool_end_end');}
});
