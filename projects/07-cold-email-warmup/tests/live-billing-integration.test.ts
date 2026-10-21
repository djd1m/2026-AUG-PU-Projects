import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPool,migrate } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { YooKassaProvider } from '../src/billing/yookassa.js';
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
   assert.equal((await currentEntitlement(pool,tenant,'live_provider')).label,'LIVE');
   Object.assign(provider.payments.get(i.payment_id!)!,{status:'pending',paid:false,paidAt:null});assert.equal((await service.reconcile(tenant,i.id)).state,'succeeded');
   await assert.rejects(pool.query('UPDATE live_billing_intent SET amount_minor=1 WHERE id=$1',[i.id]),/immutable/);
  });
  await t.test('first verified expired window survives newer paidAt replay and service restart',async()=>{
   const i=await service.checkout(other,randomUUID());provider.success(i.payment_id!);
   const firstPaidAt=new Date(Date.now()-20*86400000).toISOString();provider.payments.get(i.payment_id!)!.paidAt=firstPaidAt;
   await service.reconcile(other,i.id);
   const first=(await pool.query('SELECT paid_at,expires_at FROM live_billing_entitlement WHERE intent_id=$1',[i.id])).rows[0];
   assert.ok(first,'expired canonical success must persist its original window');
   assert.equal(first.paid_at.getTime(),Date.parse(firstPaidAt));assert.equal(first.expires_at.getTime(),Date.parse(firstPaidAt)+17*86400000);
   assert.equal((await currentEntitlement(pool,other,'live_provider')).plan,'free');
   provider.payments.get(i.payment_id!)!.paidAt=new Date(Date.now()-1000).toISOString();
   const restarted=new LiveBillingService(pool,provider,price);
   await Promise.all(Array.from({length:4},()=>restarted.reconcile(other,i.id)));
   assert.equal(await grants(i.id),1);assert.deepEqual((await pool.query('SELECT paid_at,expires_at FROM live_billing_entitlement WHERE intent_id=$1',[i.id])).rows[0],first);
   assert.equal((await currentEntitlement(pool,other,'live_provider')).plan,'free','expired success replay cannot unlock the paid plan');
  });
  await t.test('saved YooKassa create body survives response loss and concurrent retries, bound checkout is GET only',async()=>{
   const remote=new Map<string,Record<string,unknown>>(),posts:string[]=[],keys:string[]=[];let lose=true;
   const adapter=new YooKassaProvider({shopId:'123',secretKey:'offline',async fetchImpl(url,init){
    let value:Record<string,unknown>;
    if(init?.method==='POST'){
     posts.push(String(init.body));const key=new Headers(init.headers).get('idempotence-key')!;keys.push(key);
     const request=JSON.parse(String(init.body));
     if(!remote.has(key)) remote.set(key,{id:randomUUID(),status:'pending',paid:false,test:false,amount:request.amount,metadata:request.metadata,recipient:{account_id:'123'},confirmation:{confirmation_url:'https://yoomoney.ru/pay'}});
     value=remote.get(key)!;if(lose){lose=false;throw new Error('response lost');}
    } else {value=[...remote.values()].find(p=>String(url).endsWith(String(p.id)))!;}
    return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
   }});
   const paidPrice={...price,provider:'yookassa',merchant:'123',durationDays:30};
   const configured=new LiveBillingService(pool,adapter,paidPrice,{returnUrl:id=>'https://cabinet.example/app?billingIntent='+id,description:'Team original'});
   const key=randomUUID();await assert.rejects(configured.checkout(other,key),/provider_unavailable/);
   const saved=(await pool.query('SELECT * FROM live_billing_intent WHERE tenant_id=$1 AND client_key=$2',[other,key])).rows[0];assert.ok(saved.first_create_attempt_at);assert.equal(saved.create_request.description,'Team original');assert.equal(saved.payment_id,null);
   const changed=new LiveBillingService(pool,adapter,paidPrice,{returnUrl:()=> 'https://changed.example/',description:'Changed'});
   const recovered=await Promise.all(Array.from({length:4},()=>changed.checkout(other,key)));const i=recovered[0]!;
   assert.equal(new Set(recovered.map(p=>p.payment_id)).size,1);assert.equal(remote.size,1);assert.equal(new Set(posts).size,1);assert.deepEqual(new Set(keys),new Set([i.id]));assert.equal(i.confirmation_url,'https://yoomoney.ru/pay');
   const before=posts.length;await changed.checkout(other,key);assert.equal(posts.length,before,'bound checkout makes no new POST');
   for(const sql of ["UPDATE live_billing_intent SET create_request='{}' WHERE id=$1",'UPDATE live_billing_intent SET first_create_attempt_at=clock_timestamp() WHERE id=$1',"UPDATE live_billing_intent SET confirmation_url='https://yoomoney.ru/other' WHERE id=$1"]) await assert.rejects(pool.query(sql,[i.id]),/immutable/);
   const payment=[...remote.values()][0]!;const timestamp=new Date(Date.now()-1000).toISOString().replace(/(\.\d{3})Z$/,(_match,fraction:string)=>fraction+'456789Z');Object.assign(payment,{status:'succeeded',paid:true,captured_at:timestamp});
   await configured.reconcile(other,i.id);const e=(await pool.query('SELECT paid_at,expires_at FROM live_billing_entitlement WHERE intent_id=$1',[i.id])).rows[0];assert.equal(e.paid_at.getTime(),Date.parse(timestamp));
   const observation=(await pool.query("SELECT snapshot FROM live_billing_observation WHERE intent_id=$1 AND kind='payment' ORDER BY sequence DESC LIMIT 1",[i.id])).rows[0].snapshot;assert.equal(observation.paidAt,timestamp);
  });
  await t.test('unbound checkout at or after stored 24h boundary refuses any new create',async()=>{
   for(const age of ['24 hours','25 hours']){
    const id=randomUUID(),key=randomUUID();await pool.query(`INSERT INTO live_billing_intent(id,tenant_id,client_key,provider,merchant,mode,plan,amount_minor,currency,duration_days,first_create_attempt_at) VALUES($1,$2,$3,'double','shop','live','team',25000,'RUB',17,clock_timestamp()-$4::interval)`,[id,other,key,age]);
    const before=provider.calls.length;await assert.rejects(service.checkout(other,key),/checkout_reconciliation_required/);assert.equal(provider.calls.length,before);assert.equal((await service.status(other,id)).payment_id,null);assert.equal(await grants(id),0);
   }
   const id=randomUUID(),key=randomUUID();await pool.query(`INSERT INTO live_billing_intent(id,tenant_id,client_key,provider,merchant,mode,plan,amount_minor,currency,duration_days,first_create_attempt_at) VALUES($1,$2,$3,'double','shop','live','team',25000,'RUB',17,clock_timestamp()-interval '23 hours')`,[id,other,key]);assert.equal((await service.checkout(other,key)).id,id);
  });
  await t.test('commit completion crossing saved 24h deadline makes zero provider POSTs',async()=>{
   const id=randomUUID(),key=randomUUID();const body={amount:{value:'250.00',currency:'RUB'},capture:true,confirmation:{type:'redirect',return_url:'https://cabinet.example/app?billingIntent='+id},description:'Deadline crossing',metadata:{order_id:id}};
   const row=(await pool.query(`INSERT INTO live_billing_intent(id,tenant_id,client_key,provider,merchant,mode,plan,amount_minor,currency,duration_days,create_request,first_create_attempt_at) VALUES($1,$2,$3,'yookassa','123','live','team',25000,'RUB',30,$4,clock_timestamp()-interval '24 hours'+interval '500 milliseconds') RETURNING first_create_attempt_at`,[id,other,key,body])).rows[0];
   let delay=true,posts=0;
   const wrapped=new Proxy(pool,{get(target,property){
    if(property==='query')return target.query.bind(target);
    if(property==='connect')return async()=>{const c=await target.connect();return new Proxy(c,{get(client,name){
     if(name==='release')return ()=>client.release();
     if(name==='query')return async(text:string,values?:unknown[])=>{const result=await client.query(text,values);if(text==='COMMIT' && delay){delay=false;await new Promise(r=>setTimeout(r,1000));}return result;};
     return Reflect.get(client,name);
    }});};return Reflect.get(target,property);
   }});
   const adapter=new YooKassaProvider({shopId:'123',secretKey:'offline',async fetchImpl(){posts++;return new Response(JSON.stringify({id:randomUUID(),status:'pending',paid:false,test:false,amount:body.amount,metadata:body.metadata,recipient:{account_id:'123'},confirmation:{confirmation_url:'https://yoomoney.ru/pay'}}),{headers:{'content-type':'application/json'}});}});
   const delayed=new LiveBillingService(wrapped,adapter,{...price,provider:'yookassa',merchant:'123',durationDays:30});
   await assert.rejects(delayed.checkout(other,key),{code:'checkout_reconciliation_required'});assert.equal(posts,0);assert.equal(delay,false,'transaction preflight passed before delayed commit');
   const saved=await service.status(other,id);assert.equal(saved.payment_id,null);assert.deepEqual(saved.first_create_attempt_at,row.first_create_attempt_at);assert.equal(await grants(id),0);
  });
  await t.test('all mismatches, TEST success, unpaid/invalid time and outage grant zero',async()=>{
   const patches:Record<string,unknown>[]=[{tenant:other},{intent:randomUUID()},{id:'wrong'},{provider:'wrong'},{merchant:'wrong'},{mode:'local_test'},{plan:'free'},{durationDays:30},{amountMinor:100},{currency:'USD'},{paid:false},{paidAt:null},{paidAt:'invalid'},{paidAt:'2025-02-29T00:00:00Z'},{paidAt:'2026-04-31T00:00:00Z'},{paidAt:new Date(Date.now()+86400000).toISOString()}];
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
