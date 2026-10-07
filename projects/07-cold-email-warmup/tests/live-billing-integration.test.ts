import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPool,migrate } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { LiveBillingService } from '../src/billing/live.js';
import { currentEntitlement } from '../src/billing/plans.js';
import type { CanonicalProvider,LiveBinding,VerifiedPayment,VerifiedRefund } from '../src/billing/provider.js';
class Double implements CanonicalProvider {
 payments=new Map<string,VerifiedPayment>();keys=new Map<string,string>();refunds=new Map<string,VerifiedRefund>();
 failCreate=false;failGet=false;calls:string[]=[];
 async create(b:LiveBinding) {
  this.calls.push(b.intent);let id=this.keys.get(b.intent);
  if(!id){id=randomUUID();this.keys.set(b.intent,id);this.payments.set(id,{...b,id,status:'pending',paid:false,paidAt:null});}
  if(this.failCreate){this.failCreate=false;throw new Error('unknown after create');}return {...this.payments.get(id)!};
 }
 async fetch(id:string){if(this.failGet) throw new Error('outage');return {...this.payments.get(id)!};}
 async fetchRefund(id:string){return {...this.refunds.get(id)!};}
 success(id:string){Object.assign(this.payments.get(id)!,{status:'succeeded',paid:true,paidAt:new Date(Date.now()-1000).toISOString()});}
 refund(id:string,amountMinor=1){const p=this.payments.get(id)!;const r:VerifiedRefund={id:randomUUID(),paymentId:id,provider:p.provider,merchant:p.merchant,mode:'live',status:'succeeded',amountMinor,currency:p.currency};this.refunds.set(r.id,r);return r.id;}
}
test('offline live ledger canonical identity, recovery, concurrency and sticky reversals',async t=>{
 const pool=createPool(loadConfig().databaseUrl);
 try {
  // Before migrations/reset/fixtures, fail closed on the explicitly owned database.
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7billing_20261007_a1');
  await migrate(pool);await migrate(pool);
  const tenant=randomUUID(),other=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1),($2)',[tenant,other]);
  const provider=new Double(),price={provider:'double',merchant:'shop',plan:'team' as const,amountMinor:25000,currency:'RUB',durationDays:17};
  const service=new LiveBillingService(pool,provider,price);
  const checkout=()=>service.checkout(tenant,randomUUID());
  const grants=async(id:string)=>Number((await pool.query('SELECT count(*) FROM live_billing_entitlement WHERE intent_id=$1',[id])).rows[0].count);
  await t.test('unknown create and crash before binding recover same immutable operation',async()=>{
   provider.failCreate=true;const key=randomUUID();await assert.rejects(service.checkout(tenant,key),/unknown/);
   const before=(await pool.query('SELECT * FROM live_billing_intent WHERE tenant_id=$1 AND client_key=$2',[tenant,key])).rows[0];assert.equal(before.payment_id,null);assert.equal(await grants(before.id),0);
   const recovered=await service.checkout(tenant,key);assert.equal(recovered.id,before.id);assert.equal(provider.keys.size,1);assert.deepEqual(provider.calls,[before.id,before.id]);
   await assert.rejects(new LiveBillingService(pool,provider,{...price,amountMinor:26000}).checkout(tenant,key),/idempotency_conflict/);
  });
  await t.test('concurrent checkout and reconcile one payment/grant, fixed expiry and tenant isolation',async()=>{
   const key=randomUUID(),results=await Promise.all(Array.from({length:8},()=>service.checkout(tenant,key)));
   assert.equal(new Set(results.map(x=>x.id)).size,1);assert.equal(new Set(results.map(x=>x.payment_id)).size,1);const i=results[0]!;
   await assert.rejects(service.status(other,i.id),/not_found/);await assert.rejects(service.reconcile(other,i.id),/not_found/);
   assert.equal(await grants(i.id),0);provider.success(i.payment_id!);
   await Promise.all(Array.from({length:8},()=>service.reconcile(tenant,i.id)));
   assert.equal(await grants(i.id),1);const e=(await pool.query('SELECT * FROM live_billing_entitlement WHERE intent_id=$1',[i.id])).rows[0];
   assert.equal(e.expires_at.getTime()-e.paid_at.getTime(),17*86400000);
   provider.success(i.payment_id!);await service.reconcile(tenant,i.id);assert.deepEqual((await pool.query('SELECT expires_at FROM live_billing_entitlement WHERE intent_id=$1',[i.id])).rows[0].expires_at,e.expires_at);
   assert.equal((await currentEntitlement(pool,tenant)).label,'LIVE');
   Object.assign(provider.payments.get(i.payment_id!)!,{status:'pending',paid:false,paidAt:null});assert.equal((await service.reconcile(tenant,i.id)).state,'succeeded');
   await assert.rejects(pool.query('UPDATE live_billing_intent SET amount_minor=1 WHERE id=$1',[i.id]),/immutable/);
  });
  await t.test('all mismatches, TEST success, unpaid/invalid time and outage grant zero',async()=>{
   const patches:Record<string,unknown>[]=[{tenant:other},{intent:randomUUID()},{id:'wrong'},{provider:'wrong'},{merchant:'wrong'},{mode:'local_test'},{plan:'free'},{durationDays:30},{amountMinor:100},{currency:'USD'},{paid:false},{paidAt:null},{paidAt:'invalid'},{paidAt:new Date(Date.now()+86400000).toISOString()}];
   for(const patch of patches){const i=await checkout();provider.success(i.payment_id!);Object.assign(provider.payments.get(i.payment_id!)!,patch);await assert.rejects(service.reconcile(tenant,i.id));assert.equal(await grants(i.id),0,JSON.stringify(patch));}
   const i=await checkout();provider.failGet=true;await assert.rejects(service.reconcile(tenant,i.id),/outage/);provider.failGet=false;assert.equal(await grants(i.id),0);assert.equal((await service.status(tenant,i.id)).state,'pending');
   await service.reconcile(tenant,i.id);assert.equal(await grants(i.id),0);
  });
  await t.test('declined/canceled and any partial refund remain sticky against late success',async()=>{
   for(const status of ['declined','canceled'] as const){const i=await checkout();provider.payments.get(i.payment_id!)!.status=status;await service.reconcile(tenant,i.id);provider.success(i.payment_id!);assert.equal((await service.reconcile(tenant,i.id)).state,status);assert.equal(await grants(i.id),0);}
   for(const firstSuccess of [false,true]){
    const i=await checkout();provider.success(i.payment_id!);if(firstSuccess) await service.reconcile(tenant,i.id);
    const refund=provider.refund(i.payment_id!);await service.reconcile(tenant,i.id,refund);await service.reconcile(tenant,i.id,refund);await service.reconcile(tenant,i.id);
    assert.equal((await service.status(tenant,i.id)).state,'refunded');const e=(await pool.query('SELECT * FROM live_billing_entitlement WHERE intent_id=$1',[i.id])).rows[0];assert.equal(!!e,firstSuccess);if(e) assert.ok(e.revoked_at);
    assert.equal(Number((await pool.query('SELECT count(*) FROM live_billing_refund WHERE intent_id=$1',[i.id])).rows[0].count),1);
   }
  });
  await t.test('late in-flight canonical success cannot override persisted refund',async()=>{
   const i=await checkout();provider.success(i.payment_id!);let reached!:()=>void,release!:()=>void;
   const ready=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});
   const delayed=new LiveBillingService(pool,{create:b=>provider.create(b),fetchRefund:id=>provider.fetchRefund(id),async fetch(id){const p=await provider.fetch(id);reached();await gate;return p;}},price);
   const pending=delayed.reconcile(tenant,i.id);await ready;await service.reconcile(tenant,i.id,provider.refund(i.payment_id!));release();assert.equal((await pending).state,'refunded');assert.equal(await grants(i.id),0);
  });
  await t.test('wrong refund binding rejects transaction; no live referral conversions',async()=>{
   for(const patch of [{paymentId:'wrong'},{merchant:'wrong'},{mode:'local_test'},{currency:'USD'},{amountMinor:26000},{provider:'wrong'},{id:'wrong'}]){
    const i=await checkout();provider.success(i.payment_id!);const r=provider.refund(i.payment_id!);Object.assign(provider.refunds.get(r)!,patch);await assert.rejects(service.reconcile(tenant,i.id,r),/refund_mismatch/);assert.equal(await grants(i.id),0);
   }
   assert.equal(Number((await pool.query('SELECT count(*) FROM partner_conversion WHERE buyer_tenant=$1',[tenant])).rows[0].count),0);
  });
 } finally {await pool.end();}
});
