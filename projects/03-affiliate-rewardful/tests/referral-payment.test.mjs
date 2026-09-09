import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { referralPaymentFixture as setup } from './helpers/referral-payment-fixture.mjs';
import { code } from './helpers/core-fixture.mjs';

test('connector orders freeze durable signup attribution; late renewal survives cookie expiry and refunds remain idempotent',async t=>{
  const x=await setup(t),customerId=await x.bind(),key=randomUUID();
  const [a,b]=await Promise.all([x.checkout(customerId,key),x.checkout(customerId,key)]);
  assert.equal(a.orderId,b.orderId);assert.equal(x.payments.size,1);
  assert.equal(x.payments.get(a.paymentId).returnUrl,'https://merchant.example/complete');
  assert.equal((await x.f.app.payments.connectorOrder(x.key,a.orderId)).verified,false);
  await x.settle(a);await x.f.restart();
  x.advance(40*86400000);const renewal=await x.checkout(customerId);await x.settle(renewal);
  await x.reauthenticate();
  const dashboard=await x.command('dashboard');
  assert.equal(dashboard.payments.length,2);assert.deepEqual(dashboard.payments.map(p=>p.rewardMinor),[20000,20000]);
  assert.ok(dashboard.payments.every(p=>p.source==='connector' && p.attribution.channel==='link'));
  const refund=await x.refund(a,100000);
  await Promise.all([1,2].map(()=>x.f.app.payments.webhook(x.notification('refund.succeeded',refund))));
  const status=await x.f.app.payments.connectorOrder(x.key,a.orderId);
  assert.equal(status.verified,true);assert.equal(status.refundedAmountMinor,100000);assert.equal(status.netAmountMinor,0);
  assert.equal((await x.command('dashboard')).ledger.reduce((s,e)=>s+e.amountMinor,0),20000);
});

test('organic checkout has null beneficiary and no reward; private customer and amount authority cannot be spoofed',async t=>{
  const x=await setup(t),customerId=randomUUID();
  await x.f.app.referrals.bind(x.key,{customerId,email:'organic@example.test',emailVerified:true});
  const order=await x.checkout(customerId);await x.settle(order);
  const payment=(await x.command('dashboard')).payments[0];
  assert.equal(payment.beneficiaryId,null);assert.equal(payment.rewardMinor,0);assert.equal(payment.attribution.reason,'no_attribution');
  await assert.rejects(x.f.app.payments.connectorCheckout(x.key,{customerId,amountMinor:100000,beneficiaryId:x.joined.actorId},randomUUID()),code('VALIDATION'));
  await assert.rejects(x.checkout('unknown-customer'));
  assert.equal(x.payments.size,1);
});

test('connector commission rejects a forged provider claim before dedup, then accepts authentic delivery once',async t=>{
  const x=await setup(t),customerId=await x.bind(),order=await x.checkout(customerId),payment=x.succeed(order.paymentId);
  const forged=structuredClone(payment);forged.amount.value='2000.00';
  await assert.rejects(x.f.app.payments.webhook(x.notification('payment.succeeded',forged)),code('PROVIDER_UNVERIFIED'));
  assert.equal((await x.command('dashboard')).payments.length,0);
  await Promise.all([1,2].map(()=>x.f.app.payments.webhook(x.notification('payment.succeeded',payment))));
  assert.equal((await x.command('dashboard')).payments.length,1);
});

test('test commission does not consume one-time live commission; metrics count unique live customers and survive clawback',async t=>{
  const x=await setup(t);await x.publish(false);const customerId=await x.bind();
  const first=await x.checkout(customerId);await x.settle(first);
  assert.equal((await x.command('dashboard')).summary.accruedMinor,0);
  const testRegistry=await x.command('registry.prepare',{period:'2026-09'});
  assert.equal(testRegistry.amountMinor,0);assert.equal(testRegistry.exclusions[0].reason,'test_payment');
  let status=await x.f.app.referrals.status(x.owner.token,x.owner.membershipId);
  assert.equal(status.metrics.payingCustomers,0);assert.equal(status.metrics.testPayingCustomers,1);assert.equal(status.metrics.firstLiveCommissionAt,null);
  x.config.testMode=false;await x.f.restart();
  const live=await x.checkout(customerId);await x.settle(live);
  const renewal=await x.checkout(customerId);await x.settle(renewal);
  assert.deepEqual((await x.command('dashboard')).payments.map(p=>p.rewardMinor),[20000,20000,0]);
  status=await x.f.app.referrals.status(x.owner.token,x.owner.membershipId);
  assert.equal(status.metrics.payingCustomers,1);assert.equal(status.metrics.testPayingCustomers,1);
  assert.equal(status.metrics.activatedThisWeek,1);const milestone=status.metrics.firstLiveCommissionAt;
  assert.equal((await x.command('dashboard')).summary.accruedMinor,20000);
  await x.refund(live,100000);
  assert.equal((await x.f.app.referrals.status(x.owner.token,x.owner.membershipId)).metrics.firstLiveCommissionAt,milestone);
});

test('integrated referral contention shares the application pool and leaves ordinary identity requests usable',async t=>{
  const x=await setup(t),visitToken=await x.visit(),input={customerId:randomUUID(),email:'shared-pool@example.test',emailVerified:true,visitToken};
  const started=performance.now();
  const results=await Promise.all([...Array.from({length:8},()=>x.f.app.referrals.bind(x.key,input)),x.f.app.identity.me(x.owner.token)]);
  assert.equal(new Set(results.slice(0,8).map(r=>r.bindingId)).size,1);
  assert.equal(results[8].memberships[0].tenantId,x.config.tenantId);
  assert.ok(performance.now()-started<5000,'Shared pool must complete within bounded request budget');
});

test('credential revoked during external create cannot publish response; durable order is recoverable with rotated authority',async t=>{
  const x=await setup(t),customerId=await x.bind(),key=randomUUID();
  x.faults.beforeReturn=async()=>{x.faults.beforeReturn=null;await x.f.app.referrals.revoke(x.owner.token,x.owner.membershipId);};
  await assert.rejects(x.checkout(customerId,key));
  const row=(await x.f.sql("SELECT * FROM checkout_orders WHERE source='connector'")).rows[0];assert.equal(row.provider_id,null);
  await x.rotate();const recovered=await x.checkout(customerId,key);
  assert.equal(recovered.orderId,row.id);assert.equal(x.payments.size,1);
  await x.settle(recovered);assert.equal((await x.command('dashboard')).payments.length,1);
});

test('lost connector create response retains idempotency; foreign credentials cannot query order or redirect binding',async t=>{
  const x=await setup(t),customerId=await x.bind(),key=randomUUID();x.faults.drop=true;
  await assert.rejects(x.checkout(customerId,key),code('PROVIDER_UNAVAILABLE'));
  await x.f.restart();const order=await x.checkout(customerId,key);assert.equal(x.payments.size,1);
  await assert.rejects(x.checkout(customerId,key,200000),code('IDEMPOTENCY_CONFLICT'));
  const stranger=await x.f.app.identity.register({email:`${randomUUID()}@example.test`,password:'Foreign referral password 12!',name:'Other'});
  await x.f.app.executeReal(stranger.token,stranger.membershipId,'program.save',{kind:'cash',bps:2000,windowDays:30,holdDays:30,recurring:true},randomUUID());
  await x.f.app.referrals.configure(stranger.token,stranger.membershipId,{landingUrl:'https://other.example/signup',returnUrl:'https://other.example/paid'});
  const foreignKey=(await x.f.app.referrals.rotate(stranger.token,stranger.membershipId)).token;
  await assert.rejects(x.f.app.payments.connectorOrder(foreignKey,order.orderId),code('NOT_FOUND'));
  await x.f.app.referrals.configure(x.owner.token,x.owner.membershipId,{landingUrl:'https://merchant.example/new',returnUrl:'https://merchant.example/changed'});
  assert.equal(x.payments.get(order.paymentId).returnUrl,'https://merchant.example/complete');
});

test('webhook before connector create response keeps succeeded and accrues once without reverse lock order',async t=>{
  const x=await setup(t),customerId=await x.bind();
  x.faults.beforeReturn=async payment=>{x.faults.beforeReturn=null;await x.settle({paymentId:payment.id});};
  const order=await x.checkout(customerId);assert.equal(order.status,'succeeded');
  assert.equal((await x.f.app.payments.connectorOrder(x.key,order.orderId)).verified,true);
  assert.equal((await x.command('dashboard')).payments.length,1);
});

test('literal 5000-order cap refuses extra provider work while an existing connector retry stays available',async t=>{
  const x=await setup(t),customerId=await x.bind(),key=randomUUID(),order=await x.checkout(customerId,key);
  await x.f.sql(`INSERT INTO checkout_orders(id,tenant_id,shop_id,test_mode,command_key,input_hash,input,policy_id,created_at,source,attribution,return_url)
    SELECT md5($1::text || n::text)::uuid,tenant_id,shop_id,test_mode,'cap:' || n,input_hash,input,policy_id,created_at,source,attribution,return_url
    FROM checkout_orders CROSS JOIN generate_series(1,4999) n WHERE id=$1::uuid`,[order.orderId]);
  assert.equal((await x.f.sql('SELECT count(*)::int AS n FROM checkout_orders')).rows[0].n,5000);
  const before=x.calls.length;await assert.rejects(x.checkout(customerId),code('ORDER_LIMIT'));assert.equal(x.calls.length,before);
  assert.equal((await x.checkout(customerId,key)).orderId,order.orderId);
});

test('additive migration preserves old checkout rows and their legacy payment/refund interpretation',async t=>{
  const x=await setup(t);
  const order=await x.f.app.payments.checkout(x.owner.token,x.owner.membershipId,{customerId:'legacy-customer',beneficiaryId:x.joined.actorId,amountMinor:100000,kind:'cash'},randomUUID());
  // Only this test's disposable schema: simulate the pre-F3 table shape.
  await x.f.sql('ALTER TABLE checkout_orders DROP COLUMN source, DROP COLUMN attribution, DROP COLUMN return_url');
  await x.f.restart();
  const row=(await x.f.sql('SELECT * FROM checkout_orders WHERE id=$1',[order.orderId])).rows[0];
  assert.equal(row.source,'legacy');assert.equal(row.attribution,null);assert.equal(row.provider_id,order.paymentId);
  await x.settle(order);await x.refund(order,50000);
  const state=await x.command('dashboard');assert.equal(state.payments[0].rewardMinor,20000);assert.equal(state.payments[0].source,undefined);
  assert.equal(state.summary.accruedMinor,20000);assert.equal(state.summary.adjustmentMinor,-10000);
  assert.equal((await x.f.app.referrals.status(x.owner.token,x.owner.membershipId)).metrics.testPayingCustomers,0);
});
