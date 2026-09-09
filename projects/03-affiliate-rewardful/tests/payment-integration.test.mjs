import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture,code } from './helpers/core-fixture.mjs';

const pass='Commercial integration password 57!';
async function setup(t) {
  let clock=Date.now(),calls=[]; const payments=new Map(),refunds=new Map();
  const config={enabled:false,shopId:'123456',secretKey:'dedicated-test-key-never-production',testMode:true,returnUrl:'https://n3-a.212.192.0.33.sslip.io/account'};
  const fetchImpl=async(url,options)=>{
    calls.push({url,method:options.method,key:options.headers['idempotence-key']});
    if (options.method==='POST') {
      const input=JSON.parse(options.body); let p=[...payments.values()].find(v=>v.metadata.order_id===input.metadata.order_id);
      if (!p) { p={id:randomUUID(),status:'pending',amount:input.amount,paid:false,test:true,refundable:false,recipient:{account_id:'123456'},metadata:input.metadata,confirmation:{type:'redirect',confirmation_url:'https://yoomoney.ru/checkout/test'}};payments.set(p.id,p); }
      return Response.json(p);
    }
    const id=url.split('/').at(-1), obj=url.includes('/refunds/')?refunds.get(id):payments.get(id);
    return obj?Response.json(obj):Response.json({error:'not_found'},{status:404});
  };
  const f=await fixture(t,{clock:()=>clock,yookassaConfig:config,paymentFetch:fetchImpl});
  const owner=await f.app.identity.register({email:`${randomUUID()}@example.test`,password:pass,name:'Commerce'});
  config.tenantId=(await f.app.identity.me(owner.token)).memberships[0].tenantId;
  config.enabled=true; await f.restart();
  const partner=await f.app.identity.register({email:`${randomUUID()}@example.test`,password:pass,name:'Partner'});
  const invite=await f.app.identity.invite(owner.token,owner.membershipId,{role:'partner'});
  const joined=await f.app.identity.acceptInvite(partner.token,{invitation:invite.invitation,name:'Referral partner'});
  const command=(action,input={},key=randomUUID())=>f.app.executeReal(owner.token,owner.membershipId,action,input,key);
  await command('program.save',{kind:'cash',bps:2000,windowDays:30,holdDays:7,recurring:true});
  const input={beneficiaryId:joined.actorId,customerId:'external-buyer-1',amountMinor:100000,kind:'cash'};
  const checkout=(key=randomUUID(),body=input)=>f.app.payments.checkout(owner.token,owner.membershipId,body,key);
  const notification=(event,obj)=>JSON.stringify({type:'notification',event,object:obj});
  function succeeded(id) { clock+=1000; const p=payments.get(id); Object.assign(p,{status:'succeeded',paid:true,refundable:true,captured_at:new Date(clock).toISOString()}); return p; }
  return {f,owner,partner,joined,command,checkout,input,notification,succeeded,payments,refunds,calls,config,advance:ms=>{clock+=ms;}};
}
test('real durable checkout survives retry; verified duplicate and refund-before-payment accrue and reverse once',async t=>{
  const x=await setup(t),key=randomUUID();
  const [first,second]=await Promise.all([x.checkout(key),x.checkout(key)]);
  assert.equal(first.orderId,second.orderId); assert.equal(first.paymentId,second.paymentId); assert.equal(x.payments.size,1);
  await assert.rejects(x.checkout(key,{...x.input,amountMinor:200000}),code('IDEMPOTENCY_CONFLICT'));
  const payment=x.succeeded(first.paymentId); x.advance(1000);
  const refund={id:randomUUID(),status:'succeeded',amount:{value:'250.00',currency:'RUB'},payment_id:payment.id,created_at:new Date(Date.parse(payment.captured_at)+1000).toISOString()};x.refunds.set(refund.id,refund);
  const notice=x.notification('refund.succeeded',refund);
  await Promise.all([x.f.app.payments.webhook(notice),x.f.app.payments.webhook(notice)]);
  await x.f.app.payments.webhook(x.notification('payment.succeeded',payment));
  await x.f.restart(); await x.f.app.payments.webhook(notice);
  const state=await x.command('dashboard'); assert.equal(state.payments.length,1); assert.equal(state.refunds.length,1);
  assert.equal(state.ledger.length,2); assert.equal(state.ledger.reduce((sum,e)=>sum+e.amountMinor,0),15000);
  assert.equal(state.payments[0].provider,'yookassa'); assert.equal(state.simulated,false);
});
test('forged and mismatched provider objects never reserve dedup; later authentic delivery succeeds with frozen policy',async t=>{
  const x=await setup(t),order=await x.checkout(),pending=x.payments.get(order.paymentId);
  const forged={...pending,status:'succeeded',paid:true,captured_at:new Date().toISOString()};
  await assert.rejects(x.f.app.payments.webhook(x.notification('payment.succeeded',forged)),code('PROVIDER_UNVERIFIED'));
  assert.equal((await x.command('dashboard')).ledger.length,0);
  const real=x.succeeded(order.paymentId);
  await x.command('program.save',{kind:'cash',bps:5000,windowDays:30,holdDays:0,recurring:true});
  const original=structuredClone(real); real.amount.value='2000.00';
  await assert.rejects(x.f.app.payments.webhook(x.notification('payment.succeeded',real)),code('PAYMENT_BINDING_CONFLICT'));
  x.payments.set(real.id,original);
  await x.f.app.payments.webhook(x.notification('payment.succeeded',original));
  assert.equal((await x.command('dashboard')).payments[0].rewardMinor,20000);
  const foreign=await x.f.app.identity.register({email:`${randomUUID()}@example.test`,password:pass,name:'Other tenant'});
  await assert.rejects(x.f.app.payments.checkout(foreign.token,foreign.membershipId,x.input,randomUUID()),code('PAYMENT_UNCONFIGURED'));
  assert.equal((await x.f.app.payments.status(foreign.token,foreign.membershipId)).orders.length,0);
});
test('provider outage keeps order retryable; ambiguous creates older than23h require reconciliation',async t=>{
  const x=await setup(t),order=await x.checkout();
  await x.f.sql('UPDATE checkout_orders SET provider_id=NULL,confirmation_url=NULL WHERE id=$1',[order.orderId]);
  x.advance(24*3600000);
  const stored=(await x.f.sql('SELECT command_key FROM checkout_orders WHERE id=$1',[order.orderId])).rows[0];
  const before=x.calls.length;
  await assert.rejects(x.checkout(stored.command_key),code('RECONCILIATION_REQUIRED')); assert.equal(x.calls.length,before);
});
test('shop rotation cannot retry an unbound order against a different merchant account',async t=>{
  const x=await setup(t),key=randomUUID(),order=await x.checkout(key);
  await x.f.sql('UPDATE checkout_orders SET provider_id=NULL WHERE id=$1',[order.orderId]);
  x.config.shopId='654321';await x.f.restart();const before=x.calls.length;
  await assert.rejects(x.checkout(key),code('SHOP_CHANGED'));assert.equal(x.calls.length,before);
});
