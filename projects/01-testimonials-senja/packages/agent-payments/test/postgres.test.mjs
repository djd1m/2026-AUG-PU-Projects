import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import { createPaymentsEngine, PostgresStore, lockBuyer } from '../dist/index.js';
import { dispatchAgentCommand } from '../dist/transport-http.js';
import { fixture,pool,setup } from './reference-host.mjs';
const enabled=!!(process.env.AGENT_PAYMENTS_TEST_DATABASE_URL||process.env.TEST_DATABASE_URL);
before(async()=>{if(enabled)await setup();});after(()=>pool.end());
function pgtest(name,body){test(name,{skip:!enabled},body);}
pgtest('two independent hosts own different product prices without attribution',async()=> {
  for(const [amount,product] of [['700','book'],['3200','video']]) {
    const f=await fixture({amount,product});const o=await f.order();const paid=await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});
    assert.equal(paid.quote.amount.minor,amount);assert.equal(paid.quote.productId,product);assert.equal(paid.paymentStatus,'succeeded');assert.equal(paid.fulfillmentStatus,'active');assert.equal(paid.attributionStatus,'none');
  }
});
pgtest('hash-only grants reject foreign audience, merchant, bearer and resource',async()=> {
  const f=await fixture();const o=await f.order();
  const row=(await pool.query('SELECT token_hash,data FROM agent_payments.grants WHERE id=$1',[f.grant.grantId])).rows[0];
  assert.equal(row.token_hash.length,64);assert.ok(!JSON.stringify(row).includes(f.grant.token));
  for(const change of [{audience:'foreign'},{merchantId:'foreign'},{token:'invalid'}])await assert.rejects(f.engine.getOrder({...f.agent,...change},o.orderId),/unauthorized/);
  const other=await fixture();await assert.rejects(other.engine.getOrder(other.agent,o.orderId),/not_found/);
  await f.engine.revokeGrant(f.human,f.grant.grantId);await assert.rejects(f.engine.getOrder(f.agent,o.orderId),/unauthorized/);
});
pgtest('grant alone and saved method alone require human approval; no create call',async()=> {
  const f=await fixture();const o=await f.order();assert.equal((await f.engine.executePayment(f.agent,{orderId:o.orderId})).nextAction.kind,'human_approval');
  await f.seedMethod();assert.equal((await f.engine.executePayment(f.agent,{orderId:o.orderId})).nextAction.kind,'human_approval');assert.equal(f.provider.creates,0);
});
pgtest('mandate without saved method requires hosted human approval',async()=> {
  const f=await fixture();await f.mandate();const o=await f.order();assert.equal((await f.engine.executePayment(f.agent,{orderId:o.orderId})).nextAction.kind,'human_approval');assert.equal(f.provider.creates,0);
});
pgtest('explicit human payment saves method, separate consent, public DTO never reveals reference',async()=> {
  const f=await fixture();const o=await f.order();const paid=await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:true});
  assert.equal(paid.paymentStatus,'succeeded');assert.ok(!JSON.stringify(paid).includes('private-method'));
  assert.equal((await pool.query('SELECT data FROM agent_payments.methods WHERE merchant=$1',[f.scope.merchantId])).rows.length,1);
  const events=await f.engine.pendingEvents(f.scope);assert.equal(events.length,1);assert.ok(!JSON.stringify(events).includes('private-method'));
  assert.equal((await pool.query("SELECT * FROM agent_payments.consents WHERE merchant=$1 AND data->>'kind'='order_approval'",[f.scope.merchantId])).rows.length,1);
});
pgtest('distinct keys race same billing period: one dispatch and one fulfillment',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();
  const orders=await Promise.all(Array.from({length:8},()=>f.order()));
  const results=await Promise.allSettled(orders.map(o=>f.engine.executePayment(f.agent,{orderId:o.orderId})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.provider.creates,1);
  assert.equal((await pool.query('SELECT * FROM agent_payments.reference_receipts WHERE merchant=$1',[f.scope.merchantId])).rows.length,1);
});
pgtest('same order concurrent execution and repeated settlement never duplicate',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();
  await Promise.all(Array.from({length:8},()=>f.engine.executePayment(f.agent,{orderId:o.orderId})));
  await Promise.all(Array.from({length:8},()=>f.engine.reconcile(f.scope,o.orderId)));
  assert.equal(f.provider.creates,1);assert.equal((await f.engine.pendingEvents(f.scope)).length,1);
});
pgtest('same idempotency key has stable order and conflicts with different quote',async()=> {
  const f=await fixture();const q=await f.engine.getOffer(f.agent,'course');
  const values=await Promise.all(Array.from({length:6},()=>f.engine.createOrder(f.agent,{quoteId:q.quoteId,idempotencyKey:'key'})));
  assert.equal(new Set(values.map(v=>v.orderId)).size,1);
  const q2=await f.engine.getOffer(f.agent,'course');await assert.rejects(f.engine.createOrder(f.agent,{quoteId:q2.quoteId,idempotencyKey:'key'}),/idempotency_conflict/);
});
pgtest('new mandate and grant do not reset shared budget',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();let o=await f.order();await f.engine.executePayment(f.agent,{orderId:o.orderId});
  f.offer.billingPeriod='period-2';await f.mandate({sharedBudgetMinor:'10000'});
  const grant=await f.engine.issueGrant(f.human,{audience:f.agent.audience,expiresAt:'2026-12-01T00:00:00Z'});
  o=await f.order();await assert.rejects(f.engine.executePayment({...f.agent,token:grant.token},{orderId:o.orderId}),/budget_exceeded/);assert.equal(f.provider.creates,1);
});
pgtest('manual spending reduces agent budget but explicit extra human payments bypass caps',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();
  await f.store.transaction(f.scope,c=>f.engine.observeHumanSpend(c,f.scope,{sourceId:'legacy',amount:{minor:'1000',currency:'RUB'},budgetPeriod:'2026-09',billingPeriod:'legacy-period'}));
  const o=await f.order();await assert.rejects(f.engine.executePayment(f.agent,{orderId:o.orderId}),/budget_exceeded/);
  assert.equal((await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false})).paymentStatus,'succeeded');
  f.offer.billingPeriod='manual-extra-period';const extra=await f.order();assert.equal((await f.engine.approveOrder(f.human,{orderId:extra.orderId,saveMethod:false})).paymentStatus,'succeeded');assert.equal(f.provider.creates,2);
});
pgtest('human observed duplicate is idempotent and payload conflicts',async()=> {
  const f=await fixture();const input={sourceId:'legacy',amount:{minor:'1000',currency:'RUB'},budgetPeriod:'2026-09',billingPeriod:'legacy-period'};
  for(let i=0;i<2;i++)await f.store.transaction(f.scope,c=>f.engine.observeHumanSpend(c,f.scope,input));
  await assert.rejects(f.store.transaction(f.scope,c=>f.engine.observeHumanSpend(c,f.scope,{...input,amount:{minor:'900',currency:'RUB'}})),/human_spend_conflict/);
});
pgtest('price, terms, eligibility and expiry changes prevent autonomous dispatch',async()=> {
  for(const change of ['price','terms','eligibility','expiry']) {
    const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();
    if(change==='price')f.offer.amount.minor='1200';if(change==='terms')f.offer.termsVersion='v2';if(change==='eligibility')f.offer.autonomousEligible=false;if(change==='expiry')f.setNow('2026-09-10T12:00:00Z');
    await assert.rejects(f.engine.executePayment(f.agent,{orderId:o.orderId}));assert.equal(f.provider.creates,0);
  }
});
pgtest('mandate revocation and expiry prevent autonomous dispatch',async()=> {
  for(const mode of ['revoke','expiry']) {
    const f=await fixture();await f.seedMethod();const m=await f.mandate();const o=await f.order();
    if(mode==='revoke')await f.engine.revokeMandate(f.human,m.mandateId);else await pool.query("UPDATE agent_payments.mandates SET data=jsonb_set(data,'{policy,validUntil}','\"2020-01-01T00:00:00Z\"') WHERE id=$1",[m.mandateId]);
    await assert.rejects(f.engine.executePayment(f.agent,{orderId:o.orderId,mandateId:m.mandateId}),/mandate_unavailable/);assert.equal(f.provider.creates,0);
  }
});
pgtest('revoke committed between reservation and dispatch fence prevents provider call',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();let count=0;
  const store={transaction:async(scope,op,before)=>{
    if(scope.buyerId===f.scope.buyerId && ++count===3)await f.engine.revokeGrant(f.human,f.grant.grantId);
    return f.store.transaction(scope,op,before);
  }};
  const engine=createPaymentsEngine({...f.options,store});const result=await engine.executePayment(f.agent,{orderId:o.orderId});
  assert.equal(result.paymentStatus,'canceled');assert.equal(f.provider.creates,0);
});
pgtest('lost response persists hold across engine restart; provider ID hint recovers without create',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();f.provider.loseResponse=true;
  assert.equal((await f.engine.executePayment(f.agent,{orderId:o.orderId})).paymentStatus,'unknown');
  const restarted=createPaymentsEngine({...f.options,store:new PostgresStore(pool)});
  await restarted.executePayment(f.agent,{orderId:o.orderId});assert.equal((await restarted.reconcile(f.scope,o.orderId)).paymentStatus,'unknown');assert.equal(f.provider.creates,1);
  f.offer.billingPeriod='next';const next=await f.order();await assert.rejects(restarted.executePayment(f.agent,{orderId:next.orderId}),/budget_exceeded/);
  const providerId=[...f.provider.payments.keys()][0];assert.equal((await restarted.reconcile(f.scope,o.orderId,providerId)).paymentStatus,'succeeded');assert.equal(f.provider.creates,1);
});
pgtest('untrusted wrong provider evidence cannot settle or release budget',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();f.provider.loseResponse=true;await f.engine.executePayment(f.agent,{orderId:o.orderId});
  const [providerId,result]=[...f.provider.payments.entries()][0];f.provider.payments.set(providerId,{...result,amount:{minor:'1',currency:'RUB'}});
  await assert.rejects(f.engine.reconcile(f.scope,o.orderId,providerId),/provider_mismatch/);
  assert.equal((await f.engine.getOrder(f.agent,o.orderId)).paymentStatus,'unknown');assert.equal((await f.engine.pendingEvents(f.scope)).length,0);
});
pgtest('fulfillment rollback rolls back entitlement, spend, events; query recovery commits once',async()=> {
  const f=await fixture();const o=await f.order();f.setRollback(true);
  assert.equal((await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false})).paymentStatus,'unknown');
  assert.equal((await pool.query('SELECT * FROM agent_payments.reference_receipts WHERE merchant=$1',[f.scope.merchantId])).rows.length,0);assert.equal((await f.engine.pendingEvents(f.scope)).length,0);
  assert.equal((await pool.query('SELECT state FROM agent_payments.reservations WHERE order_id=$1',[o.orderId])).rows[0].state,'held');
  f.setRollback(false);await f.engine.reconcile(f.scope,o.orderId,[...f.provider.payments.keys()][0]);assert.equal((await f.engine.pendingEvents(f.scope)).length,1);
});
pgtest('partial refund replay and late paid preserve gross spend and cumulative correction',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();await f.engine.executePayment(f.agent,{orderId:o.orderId});const providerId=[...f.provider.payments.keys()][0];
  for(const [refundId,minor] of [['r2','200'],['r1','300']])f.provider.refunds.set(refundId,{refundId,providerId,accountId:f.provider.accountId,test:true,amount:{minor,currency:'RUB'},status:'succeeded'});
  await Promise.all([f.engine.reconcileRefund(f.scope,o.orderId,'r2'),f.engine.reconcileRefund(f.scope,o.orderId,'r2')]);await f.engine.reconcileRefund(f.scope,o.orderId,'r1');
  const result=await f.engine.reconcile(f.scope,o.orderId);assert.equal(result.paymentStatus,'succeeded');assert.equal(result.refundedMinor,'500');assert.equal(result.fulfillmentStatus,'review_required');
  assert.equal((await f.engine.pendingEvents(f.scope)).length,3);
  f.offer.billingPeriod='next';const next=await f.order();await assert.rejects(f.engine.executePayment(f.agent,{orderId:next.orderId}),/budget_exceeded/);
});
pgtest('required attribution refuses dispatch until acknowledged',async()=> {
  const f=await fixture({attribution:true});const o=await f.order();await assert.rejects(f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false}),/attribution_required/);assert.equal(f.provider.creates,0);
});
pgtest('durable event acknowledgement is scoped and persisted across restart',async()=> {
  const f=await fixture();const o=await f.order();await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});const [event]=await f.engine.pendingEvents(f.scope);
  await assert.rejects(f.engine.acknowledgeEvent({...f.scope,buyerId:'other'},event.eventId),/not_found/);
  await f.engine.acknowledgeEvent(f.scope,event.eventId);const engine=createPaymentsEngine(f.options);assert.equal((await engine.pendingEvents(f.scope)).length,0);
});
pgtest('transport delegates same authority and refuses human consent command',async()=> {
  const f=await fixture();const q=await dispatchAgentCommand(f.engine,f.agent,{command:'offer_get',productId:'course'});assert.equal(q.quoteId.length,36);
  await assert.rejects(dispatchAgentCommand(f.engine,f.agent,{command:'approve_order'}),/invalid_command/);
  await assert.rejects(dispatchAgentCommand(f.engine,{...f.agent,token:'bad'},{command:'offer_get',productId:'course'}),/unauthorized/);
});
pgtest('provider account switch after reserve is refused before any network',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();f.provider.loseResponse=true;await f.engine.executePayment(f.agent,{orderId:o.orderId});
  f.provider.accountId='changed-shop';await assert.rejects(f.engine.reconcile(f.scope,o.orderId),/attempt_provider_mismatch/);assert.equal(f.provider.queries,0);
});
pgtest('forged provider merchant account cannot settle',async()=> {
  const f=await fixture();const o=await f.order();f.provider.loseResponse=true;await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});
  const [providerId,result]=[...f.provider.payments.entries()][0];f.provider.payments.set(providerId,{...result,accountId:'other-shop'});
  await assert.rejects(f.engine.reconcile(f.scope,o.orderId,providerId),/provider_mismatch/);assert.equal((await f.engine.pendingEvents(f.scope)).length,0);
});
pgtest('refund arriving before lost paid response reconciles verified payment first',async()=> {
  const f=await fixture();const o=await f.order();f.provider.loseResponse=true;await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});const providerId=[...f.provider.payments.keys()][0];
  f.provider.refunds.set('early',{refundId:'early',providerId,accountId:f.provider.accountId,test:true,amount:{minor:'250',currency:'RUB'},status:'succeeded'});
  const result=await f.engine.reconcileRefund(f.scope,o.orderId,'early');assert.equal(result.paymentStatus,'succeeded');assert.equal(result.refundedMinor,'250');assert.equal(f.provider.creates,1);assert.equal((await f.engine.pendingEvents(f.scope)).length,2);
});
pgtest('payment evidence survives fulfillment rollback for polling without webhook hint',async()=> {
  const f=await fixture();const o=await f.order();f.setRollback(true);await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});f.setRollback(false);
  assert.equal((await f.engine.reconcile(f.scope,o.orderId)).paymentStatus,'succeeded');assert.equal(f.provider.creates,1);
});
pgtest('human can approve existing prepared order after original agent grant revocation',async()=> {
  const f=await fixture();const o=await f.order();await f.engine.revokeGrant(f.human,f.grant.grantId);
  assert.equal((await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false})).paymentStatus,'succeeded');
});
pgtest('revocation after accepted dispatch fence reconciles already sent payment',async()=> {
  const f=await fixture();await f.seedMethod();await f.mandate();const o=await f.order();
  let release,entered;f.provider.gate=new Promise(r=>release=r);const started=new Promise(r=>entered=r);
  const original=f.provider.create.bind(f.provider);f.provider.create=async request=>{entered();return original(request);};
  const payment=f.engine.executePayment(f.agent,{orderId:o.orderId});await started;await f.engine.revokeGrant(f.human,f.grant.grantId);release();
  assert.equal((await payment).paymentStatus,'succeeded');assert.equal(f.provider.creates,1);
});
pgtest('unknown past provider idempotency window never creates a fresh charge',async()=> {
  const f=await fixture();const o=await f.order();f.provider.loseResponse=true;await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});
  f.setNow('2026-09-12T10:00:00Z');await assert.rejects(f.engine.executePayment(f.agent,{orderId:o.orderId}),/expired/);
  assert.equal((await f.engine.reconcile(f.scope,o.orderId,[...f.provider.payments.keys()][0])).paymentStatus,'succeeded');assert.equal(f.provider.creates,1);
});
pgtest('refund amount cannot exceed paid gross',async()=> {
  const f=await fixture();const o=await f.order();await f.engine.approveOrder(f.human,{orderId:o.orderId,saveMethod:false});const providerId=[...f.provider.payments.keys()][0];
  f.provider.refunds.set('too-large',{refundId:'too-large',providerId,accountId:f.provider.accountId,test:true,amount:{minor:'1001',currency:'RUB'},status:'succeeded'});
  await assert.rejects(f.engine.reconcileRefund(f.scope,o.orderId,'too-large'),/refund_exceeds_payment/);assert.equal((await f.engine.getOrder(f.agent,o.orderId)).refundedMinor,'0');
});
pgtest('boundary money rejects float, zero, negative and noncanonical minor values',async()=> {
  for(const minor of ['1.00','0','-1','01',1,null,'9999999999999999999999']) {
    const f=await fixture();f.offer.amount.minor=minor;await assert.rejects(f.engine.getOffer(f.agent,'course'),/invalid_money/);assert.equal(f.provider.creates,0);
  }
});
