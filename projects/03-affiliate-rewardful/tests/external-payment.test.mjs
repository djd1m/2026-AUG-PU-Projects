import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { referralPaymentFixture as setup } from './helpers/referral-payment-fixture.mjs';
import { code } from './helpers/core-fixture.mjs';

async function external(x, key=randomUUID()) {
  const customerId=await x.bind();
  const input={customerId,amountMinor:99000};
  const order=await x.f.app.payments.externalOrder(x.key,input,key);
  const payment={id:randomUUID(),status:'pending',paid:false,refundable:false,test:true,
    amount:{value:'990.00',currency:'RUB'},recipient:{account_id:x.config.shopId},metadata:{order_id:order.orderId}};
  x.payments.set(payment.id,payment);
  return {order,payment,input,key};
}
const event=(order,payment)=>({orderId:order.orderId,event:'payment.succeeded',objectId:payment.id});

test('external reservation is durable and concurrent replay never creates a provider payment',async t=>{
  const x=await setup(t),customerId=await x.bind(),input={customerId,amountMinor:99000},key=randomUUID();
  const results=await Promise.all(Array.from({length:8},()=>x.f.app.payments.externalOrder(x.key,input,key)));
  assert.equal(new Set(results.map(r=>r.orderId)).size,1);assert.equal(x.calls.length,0);
  assert.equal(results[0].currency,'RUB');assert.equal(results[0].testMode,true);
  await x.f.restart();assert.equal((await x.f.app.payments.externalOrder(x.key,input,key)).orderId,results[0].orderId);
  await assert.rejects(x.f.app.payments.externalOrder(x.key,{...input,amountMinor:100},key),code('IDEMPOTENCY_CONFLICT'));
  const native=await x.f.app.payments.connectorCheckout(x.key,input,key);
  assert.notEqual(native.orderId,results[0].orderId);
});

test('external paid event is independently verified and concurrent repeats accrue one test commission',async t=>{
  const x=await setup(t),{order,payment}=await external(x);
  await assert.rejects(x.f.app.payments.externalEvent(x.key,event(order,payment)),code('PROVIDER_UNVERIFIED'));
  x.succeed(payment.id);
  await Promise.all([1,2,3].map(()=>x.f.app.payments.externalEvent(x.key,event(order,payment))));
  await x.f.restart();
  assert.equal((await x.f.app.payments.connectorOrder(x.key,order.orderId)).verified,true);
  const state=await x.command('dashboard');assert.equal(state.payments.length,1);assert.equal(state.payments[0].rewardMinor,19800);
  assert.equal(state.summary.accruedMinor,0);
});

test('external events refuse wrong metadata, amount, currency, shop and mode without consuming dedup',async t=>{
  const x=await setup(t),{order,payment}=await external(x);x.succeed(payment.id);
  const original=structuredClone(payment);
  for(const change of [{metadata:{order_id:randomUUID()}},{amount:{value:'991.00',currency:'RUB'}},
    {amount:{value:'990.00',currency:'USD'}},{recipient:{account_id:'999999'}},{test:false},{paid:false},{captured_at:undefined}]) {
    Object.assign(payment,original,change);
    await assert.rejects(x.f.app.payments.externalEvent(x.key,event(order,payment)));
    assert.equal((await x.command('dashboard')).payments.length,0);
  }
  Object.assign(payment,original);await x.f.app.payments.externalEvent(x.key,event(order,payment));
  assert.equal((await x.command('dashboard')).payments.length,1);
});

test('external refunds arriving first settle original payment and cumulatively claw back once',async t=>{
  const x=await setup(t),{order,payment}=await external(x);x.succeed(payment.id);
  const refund={id:randomUUID(),payment_id:payment.id,status:'succeeded',amount:{value:'330.01',currency:'RUB'},created_at:new Date(x.now()).toISOString()};
  x.refunds.set(refund.id,refund);
  const report={orderId:order.orderId,event:'refund.succeeded',objectId:refund.id};
  await x.f.app.payments.externalEvent(x.key,report);await x.f.app.payments.externalEvent(x.key,report);
  await x.f.app.payments.externalEvent(x.key,event(order,payment));
  const second={...refund,id:randomUUID(),amount:{value:'659.99',currency:'RUB'}};x.refunds.set(second.id,second);
  await x.f.app.payments.externalEvent(x.key,{...report,objectId:second.id});
  const state=await x.command('dashboard');assert.equal(state.payments.length,1);assert.equal(state.refunds.length,2);
  assert.equal(state.ledger.reduce((n,r)=>n+r.amountMinor,0),0);
  assert.equal((await x.f.app.payments.connectorOrder(x.key,order.orderId)).netAmountMinor,0);
});

test('external event rejects missing and native orders before provider work',async t=>{
  const x=await setup(t),customerId=await x.bind(),native=await x.checkout(customerId);
  const before=x.calls.length;
  for(const orderId of [native.orderId,randomUUID()]) await assert.rejects(x.f.app.payments.externalEvent(x.key,{orderId,event:'payment.succeeded',objectId:randomUUID()}),code('NOT_FOUND'));
  assert.equal(x.calls.length,before);
});

test('external authority is rechecked after provider IO while ordinary identity can use the pool',async t=>{
  const x=await setup(t),{order,payment}=await external(x);x.succeed(payment.id);
  let revoked=false;
  x.faults.beforeGet=async()=>{
    x.faults.beforeGet=null;revoked=true;
    await x.f.app.referrals.revoke(x.owner.token,x.owner.membershipId);
    assert.ok(await x.f.app.identity.me(x.owner.token));
  };
  await assert.rejects(x.f.app.payments.externalEvent(x.key,event(order,payment)));
  assert.equal(revoked,true);assert.equal((await x.command('dashboard')).payments.length,0);
  await x.rotate();await x.f.app.payments.externalEvent(x.key,event(order,payment));
  assert.equal((await x.command('dashboard')).payments.length,1);
});

test('external cap preserves retries; a foreign connector cannot verify another tenant order',async t=>{
  const x=await setup(t),{order,payment,input,key}=await external(x);
  const stranger=await x.f.app.identity.register({email:`${randomUUID()}@example.test`,password:'Foreign bridge password 19!',name:'Other'});
  await x.f.app.executeReal(stranger.token,stranger.membershipId,'program.save',{kind:'cash',bps:2000,windowDays:30,holdDays:30,recurring:true},randomUUID());
  await x.f.app.referrals.configure(stranger.token,stranger.membershipId,{landingUrl:'https://other.example/start',returnUrl:'https://other.example/paid'});
  const foreign=(await x.f.app.referrals.rotate(stranger.token,stranger.membershipId)).token;
  const before=x.calls.length;
  await assert.rejects(x.f.app.payments.externalEvent(foreign,event(order,payment)));
  assert.equal(x.calls.length,before);
  await x.f.sql(`INSERT INTO checkout_orders(id,tenant_id,shop_id,test_mode,command_key,input_hash,input,policy_id,created_at,source,attribution,return_url,external)
    SELECT md5($1::text || n::text)::uuid,tenant_id,shop_id,test_mode,'cap:' || n,input_hash,input,policy_id,created_at,source,attribution,return_url,external
    FROM checkout_orders CROSS JOIN generate_series(1,4999) n WHERE id=$1::uuid`,[order.orderId]);
  await assert.rejects(x.f.app.payments.externalOrder(x.key,input,randomUUID()),code('ORDER_LIMIT'));
  assert.equal((await x.f.app.payments.externalOrder(x.key,input,key)).orderId,order.orderId);
  assert.equal(x.calls.length,before);
});

test('external public and private replay share dedup; second valid payment cannot replace order binding',async t=>{
  const x=await setup(t),{order,payment}=await external(x);x.succeed(payment.id);
  await Promise.all([x.f.app.payments.externalEvent(x.key,event(order,payment)),x.f.app.payments.webhook(x.notification('payment.succeeded',payment))]);
  const second={...payment,id:randomUUID()};x.payments.set(second.id,second);
  await assert.rejects(x.f.app.payments.externalEvent(x.key,event(order,second)),code('PAYMENT_BINDING_CONFLICT'));
  const refund={id:randomUUID(),payment_id:payment.id,status:'succeeded',amount:{value:'990.00',currency:'RUB'},created_at:new Date(x.now()).toISOString()};
  x.refunds.set(refund.id,refund);
  await Promise.all([x.f.app.payments.externalEvent(x.key,{orderId:order.orderId,event:'refund.succeeded',objectId:refund.id}),x.f.app.payments.webhook(x.notification('refund.succeeded',refund))]);
  const state=await x.command('dashboard');assert.equal(state.payments.length,1);assert.equal(state.refunds.length,1);
  assert.equal(state.ledger.reduce((sum,row)=>sum+row.amountMinor,0),0);
  assert.equal((await x.f.app.payments.connectorOrder(x.key,order.orderId)).paymentId,payment.id);
});

test('four stalled external provider reads leave the shared SQL pool usable and bound further admission',async t=>{
  const x=await setup(t),{order,payment}=await external(x);x.succeed(payment.id);
  let release,entered=0,allEntered;const gate=new Promise(r=>{release=r;});const ready=new Promise(r=>{allEntered=r;});
  x.faults.beforeGet=async()=>{entered++;if(entered===4)allEntered();await gate;};
  const pending=Array.from({length:4},()=>x.f.app.payments.externalEvent(x.key,event(order,payment)));
  try {
    await Promise.race([ready,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Provider entry timed out')),1500);timer.unref();})]);
    assert.ok(await x.f.app.identity.me(x.owner.token));
    await assert.rejects(x.f.app.payments.externalEvent(x.key,event(order,payment)),code('PROVIDER_BUSY'));
    assert.equal(entered,4);
  } finally {release();await Promise.all(pending);}
  assert.equal((await x.command('dashboard')).payments.length,1);
});

test('pre-bridge schema upgrade preserves native and connector orders as nonexternal',async t=>{
  const x=await setup(t),customerId=await x.bind(),connector=await x.checkout(customerId);
  const native=await x.f.app.payments.checkout(x.owner.token,x.owner.membershipId,{customerId:'old-native',beneficiaryId:x.joined.actorId,amountMinor:99000,kind:'cash'},randomUUID());
  await x.f.sql('ALTER TABLE checkout_orders DROP COLUMN external');await x.f.restart();
  const rows=(await x.f.sql('SELECT id,external FROM checkout_orders ORDER BY id')).rows;
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.external===false));
  await x.settle(connector);await x.settle(native);
  for(const orderId of [native.orderId,connector.orderId])await assert.rejects(x.f.app.payments.externalEvent(x.key,{orderId,event:'payment.succeeded',objectId:randomUUID()}),code('NOT_FOUND'));
  assert.equal((await x.command('dashboard')).payments.length,2);
});

test('connector expiry while final order lock waits rolls back settlement and permits fresh-key replay',async t=>{
  const {default:pg}=await import('pg');
  const x=await setup(t),{order,payment}=await external(x);x.succeed(payment.id);
  const pool=new pg.Pool(x.f.database),blocker=await pool.connect();
  const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  x.faults.beforeGet=async()=>{
    x.faults.beforeGet=null;await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM checkout_orders WHERE id=$1 FOR UPDATE',[order.orderId]);
  };
  const result=x.f.app.payments.externalEvent(x.key,event(order,payment)).then(value=>({value}),error=>({error}));
  try {
    let waiting=false;
    for(let n=0;n<100;n++){
      const row=(await pool.query('SELECT count(*)::int AS n FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))',[pid])).rows[0];
      if(row.n>0){waiting=true;break;}
      await new Promise(r=>setTimeout(r,10));
    }
    assert.equal(waiting,true,'Must observe actual final order lock wait');
    x.advance(91*86400000);await blocker.query('ROLLBACK');
    assert.equal((await result).error?.code,'UNAUTHENTICATED');
    const saved=(await x.f.sql('SELECT status,provider_id FROM checkout_orders WHERE id=$1',[order.orderId])).rows[0];
    assert.equal(saved.status,'created');assert.equal(saved.provider_id,null);
  } finally {await blocker.query('ROLLBACK');blocker.release();await pool.end();await result;}
  await x.reauthenticate();await x.rotate();
  await x.f.app.payments.externalEvent(x.key,event(order,payment));
  assert.equal((await x.command('dashboard')).payments.length,1);
});
