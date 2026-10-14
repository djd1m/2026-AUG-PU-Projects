import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BillingService, type Payment } from '@n8/domain/billing';
import { freshDb } from '../helpers/db';
import { account, counts, config, deferred, offer, services, signal } from './fixtures';
let db:Awaited<ReturnType<typeof freshDb>>;
beforeEach(async()=>{db=await freshDb();});afterEach(async()=>{await db.close();});
describe('BILLING immutable checkout and verified ledger',()=>{
 it('AC-billing-2 parallel same-key checkout has one durable order and provider id; client prices rejected',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool),key=randomUUID();
  const orders=await Promise.all(Array.from({length:16},()=>service.checkout(actor,key,{sku:'room'})));
  expect(new Set(orders.map(x=>x.id)).size).toBe(1);expect(provider.payments.size).toBe(1);expect(new Set(provider.keys)).toEqual(new Set([orders[0].id]));
  expect(await counts(db.pool,actor)).toEqual({credits_available:0,paid_export:false,billing_hold:false,events:0,orders:1});
  await expect(service.checkout(actor,randomUUID(),{sku:'room',priceMinor:1,credits:999})).rejects.toMatchObject({status:422});
  const changed=new BillingService(services(db.pool).store,provider,{...config,skus:[{...offer,priceMinor:20000}]});
  await expect(changed.checkout(actor,key,{sku:'room'})).rejects.toMatchObject({status:409,code:'IDEMPOTENCY_CONFLICT'});
  expect(provider.keys.every(x=>x===orders[0].id)).toBe(true);
 });
 it('provider blocked outside DB transaction; intent already durable; timeout replay keeps same remote key',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool),entered=deferred(),release=deferred(),key=randomUUID();
  provider.beforeCreate=async()=>{entered.resolve();await release.promise;};provider.unavailable=true;
  const first=service.checkout(actor,key,{sku:'room'});const rejection=expect(first).rejects.toMatchObject({status:503});await entered.promise;
  const c=await db.pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='200ms'");await c.query('UPDATE account SET paid_export=false WHERE id=$1',[actor]);await c.query('COMMIT');}finally{c.release();}
  expect((await counts(db.pool,actor)).orders).toBe(1);release.resolve();await rejection;
  provider.beforeCreate=undefined;provider.unavailable=false;const replay=await service.checkout(actor,key,{sku:'room'});
  expect(new Set(provider.keys)).toEqual(new Set([replay.id]));expect(provider.payments.size).toBe(1);expect((await counts(db.pool,actor)).credits_available).toBe(0);
 });
 it('stale unknown remote outcome cannot charge again after provider 24h idempotence horizon',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool),key=randomUUID();provider.unavailable=true;await expect(service.checkout(actor,key,{sku:'room'})).rejects.toMatchObject({status:503});
  // Clock movement is test-only; advance Date.now rather than alter immutable intent.
  const original=Date.now;Date.now=()=>original()+24*60*60*1000;
  try{provider.unavailable=false;await expect(service.checkout(actor,key,{sku:'room'})).rejects.toMatchObject({code:'PAYMENT_RECONCILIATION_REQUIRED'});expect(provider.keys).toHaveLength(1);}finally{Date.now=original;}
 });
 it('AC-billing-3 verified concurrent delivery grants exactly one package and one event; return GET is read-only',async()=>{
  const actor=await account(db.pool),{service,provider,store}=services(db.pool);const order=await service.checkout(actor,randomUUID(),{sku:'room'}),remote=[...provider.payments.values()][0];provider.succeed(remote.id);
  expect((await store.get(actor,order.id)).state).toBe('pending');expect((await counts(db.pool,actor)).credits_available).toBe(0);
  const entered=deferred(),release=deferred();let n=0;provider.beforeGet=async()=>{if(++n===12)entered.resolve();await release.promise;};
  const calls=Array.from({length:12},()=>service.notification(signal(remote.id)));await entered.promise;release.resolve();const results=await Promise.all(calls);
  expect(results.filter(x=>x.outcome==='applied')).toHaveLength(1);expect(results.filter(x=>x.outcome==='duplicate')).toHaveLength(11);
  expect(await counts(db.pool,actor)).toEqual({credits_available:10,paid_export:true,billing_hold:false,events:1,orders:1});
 });
 it('AC-billing-4 merchant/test/amount/currency/paid/status/metadata/bound-id negatives leave ledger empty',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const remote=provider.succeed([...provider.payments.keys()][0]);const saved=structuredClone(remote);
  const changes:Partial<Payment>[]=[{merchantId:'other'},{test:false},{amountMinor:19899},{currency:'USD' as 'RUB'},{paid:false},{status:'pending'},{orderId:randomUUID()},{id:randomUUID()}];
  for(const change of changes){Object.assign(remote,saved,change);await expect(service.notification(signal(saved.id))).rejects.toMatchObject({status:400});expect((await counts(db.pool,actor)).events).toBe(0);}
  Object.assign(remote,saved);const impostor={...saved,id:randomUUID()};provider.payments.set(impostor.id,impostor);
  await expect(service.notification(signal(impostor.id))).rejects.toMatchObject({status:400});expect((await counts(db.pool,actor)).credits_available).toBe(0);
 });
 it('notification amount/status/merchant fields are ignored; only refetched object grants',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);
  await service.notification({...signal(payment.id),event_id:'evil-key',object:{id:payment.id,amount:{value:'99999999.00',currency:'USD'},recipient:{account_id:'evil'},paid:false,status:'canceled',metadata:{order_id:randomUUID()}}});
  expect((await counts(db.pool,actor)).credits_available).toBe(10);const row=(await db.pool.query('SELECT remote_event_key FROM payment_event')).rows[0];expect(row.remote_event_key).toBe(`succeeded:${payment.id}`);
 });
 it('AC-billing-5 verification outage occupies no event key; later retry grants once',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const remote=provider.succeed([...provider.payments.keys()][0]);provider.unavailable=true;
  await expect(service.notification(signal(remote.id))).rejects.toMatchObject({status:503});expect((await counts(db.pool,actor)).events).toBe(0);provider.unavailable=false;
  await service.notification(signal(remote.id));await service.notification(signal(remote.id));expect((await counts(db.pool,actor)).credits_available).toBe(10);expect((await counts(db.pool,actor)).events).toBe(1);
 });
 it('database failure rolls back event/order/credits together and leaves retry possible',async()=>{
  const actor=await account(db.pool),{service,provider}=services(db.pool);await service.checkout(actor,randomUUID(),{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);
  await db.pool.query("CREATE FUNCTION reject_grant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture grant failure'; END $$; CREATE TRIGGER reject_grant BEFORE UPDATE OF credits_available ON account FOR EACH ROW EXECUTE FUNCTION reject_grant()");
  await expect(service.notification(signal(payment.id))).rejects.toThrow('fixture grant failure');expect(await counts(db.pool,actor)).toMatchObject({events:0,credits_available:0,paid_export:false});expect((await db.pool.query('SELECT state FROM payment_order')).rows[0].state).toBe('pending');
  await db.pool.query('DROP TRIGGER reject_grant ON account');await service.notification(signal(payment.id));expect((await counts(db.pool,actor)).credits_available).toBe(10);
 });
 it('owned order reads hide foreign IDs and history cursor returns all 53 orders without overlap',async()=>{
  const actor=await account(db.pool),other=await account(db.pool),{store}=services(db.pool);const orders=[];for(let i=0;i<53;i++)orders.push(await store.prepare(actor,randomUUID(),offer,config));
  await expect(store.get(other,orders[0].id)).rejects.toMatchObject({status:404});const first=await store.list(actor);expect(first.items).toHaveLength(50);expect(first.nextCursor).toBeTruthy();const second=await store.list(actor,first.nextCursor!);expect(second.items).toHaveLength(3);expect(new Set([...first.items,...second.items].map(x=>x.id)).size).toBe(53);expect(second.nextCursor).toBeNull();expect((await store.list(other)).items).toEqual([]);
  await expect(store.list(actor,'forged')).rejects.toMatchObject({status:400});
 });
});
it('DDL immutable intent and bound identity survive direct SQL; refund state cannot be restored by late write',async()=>{
 const actor=await account(db.pool),other=await account(db.pool),{store}=services(db.pool);const order=await store.prepare(actor,randomUUID(),offer,config);
 for(const [column,value] of [['price_minor',1],['sku','changed'],['account_id',other],['request_hash','new'],['created_at',new Date(0)],['credits',999]])await expect(db.pool.query(`UPDATE payment_order SET ${column}=$2 WHERE id=$1`,[order.id,value])).rejects.toThrow('immutable payment intent');
 const remote=randomUUID();await db.pool.query("UPDATE payment_order SET remote_id=$2,state='pending' WHERE id=$1",[order.id,remote]);await expect(db.pool.query('UPDATE payment_order SET remote_id=$2 WHERE id=$1',[order.id,randomUUID()])).rejects.toThrow('remote identity cannot change');await expect(db.pool.query('UPDATE payment_order SET remote_id=NULL WHERE id=$1',[order.id])).rejects.toThrow('remote identity cannot change');
 await db.pool.query("UPDATE payment_order SET state='succeeded',paid_at=now() WHERE id=$1",[order.id]);await db.pool.query("UPDATE payment_order SET state='refund_hold' WHERE id=$1",[order.id]);await expect(db.pool.query("UPDATE payment_order SET state='succeeded' WHERE id=$1",[order.id])).rejects.toThrow('refund hold is permanent');
});
it('verified webhook can arrive before create response persistence; later bind never downgrades succeeded state',async()=>{
 const actor=await account(db.pool),{service,provider,store}=services(db.pool),entered=deferred(),release=deferred();provider.beforeCreate=async()=>{entered.resolve();await release.promise;};
 const checkout=service.checkout(actor,randomUUID(),{sku:'room'});await entered.promise;const local=(await store.list(actor)).items[0];const id=randomUUID();provider.payments.set(id,{id,orderId:local.id,status:'succeeded',paid:true,test:true,merchantId:config.shopId,amountMinor:offer.priceMinor,currency:'RUB',confirmationUrl:null});
 await service.notification(signal(id));release.resolve();expect((await checkout).state).toBe('succeeded');expect(await counts(db.pool,actor)).toMatchObject({credits_available:10,events:1});expect((await store.get(actor,local.id)).confirmationUrl).toBeNull();
});
it('merchant/test config rotation cannot replay or verify an immutable intent against another provider identity',async()=>{
 const actor=await account(db.pool),{service,provider,store}=services(db.pool),key=randomUUID();const order=await service.checkout(actor,key,{sku:'room'});const payment=provider.succeed([...provider.payments.keys()][0]);
 for(const identity of [{shopId:'another-shop'},{testMode:false}]){const changed={...config,...identity};const rotated=new BillingService(store,provider,changed);await expect(rotated.checkout(actor,key,{sku:'room'})).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  const proof={...payment,merchantId:changed.shopId,test:changed.testMode};await expect(store.apply({kind:'succeeded',payment:proof},changed)).rejects.toMatchObject({code:'PAYMENT_PROOF_INVALID'});await expect(store.bind(actor,order.id,proof,changed)).rejects.toMatchObject({code:'PAYMENT_PROOF_INVALID'});
 }
 expect((await counts(db.pool,actor)).events).toBe(0);await service.notification(signal(payment.id));expect((await counts(db.pool,actor)).credits_available).toBe(10);
});
