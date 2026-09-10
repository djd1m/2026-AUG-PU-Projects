import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { abandonUndispatched, createPaymentsEngine } from '../dist/index.js';
import { Context } from '../dist/internal.js';
import { settle } from '../dist/settlement.js';
import { fixture, pool, setup } from './reference-host.mjs';
const enabled = !!(process.env.AGENT_PAYMENTS_TEST_DATABASE_URL || process.env.TEST_DATABASE_URL);
before(async () => { if (enabled) await setup(); });
after(() => pool.end());
function pgtest(name, body) { test(name, { skip: !enabled }, body); }
async function abandon(f) {
  return f.store.transaction(f.scope, c => abandonUndispatched(c, f.scope), c => f.host.lockResource(c, f.scope));
}
async function claims(f) {
  return (await pool.query('SELECT source_id FROM agent_payments.period_claims WHERE merchant=$1 AND buyer=$2 AND resource=$3', [f.scope.merchantId, f.scope.buyerId, f.scope.resourceId])).rows;
}
pgtest('definitive provider cancellation releases own claim and permits fresh same-period authorization', async () => {
  const f = await fixture(); await f.seedMethod(); await f.mandate();
  const original = f.provider.create.bind(f.provider);
  f.provider.create = async request => { const result = await original(request); result.status = 'canceled'; return result; };
  const first = await f.order();
  assert.equal((await f.engine.executePayment(f.agent, { orderId: first.orderId })).paymentStatus, 'canceled');
  assert.equal((await claims(f)).length, 0);
  assert.equal((await pool.query('SELECT state FROM agent_payments.reservations WHERE order_id=$1', [first.orderId])).rows[0].state, 'released');
  f.provider.create = original;
  const retry = await f.order();
  assert.equal((await f.engine.executePayment(f.agent, { orderId: retry.orderId })).paymentStatus, 'succeeded');
  assert.equal(f.provider.creates, 2);
  assert.equal((await f.engine.executePayment(f.agent, { orderId: first.orderId })).paymentStatus, 'canceled');
  assert.equal(f.provider.creates, 2);
});
pgtest('pre-fence revoked grant releases claim and newly authorized agent can retry period', async () => {
  const f = await fixture(); await f.seedMethod(); await f.mandate(); const first = await f.order(); let count = 0;
  const store = { transaction: async (scope, op, beforeLock) => {
    if (scope.buyerId === f.scope.buyerId && ++count === 3) await f.engine.revokeGrant(f.human, f.grant.grantId);
    return f.store.transaction(scope, op, beforeLock);
  } };
  assert.equal((await createPaymentsEngine({ ...f.options, store }).executePayment(f.agent, { orderId: first.orderId })).paymentStatus, 'canceled');
  assert.equal((await claims(f)).length, 0); assert.equal(f.provider.creates, 0);
  const grant = await f.engine.issueGrant(f.human, { audience: f.agent.audience, expiresAt: f.grant.expiresAt });
  const agent = { ...f.agent, token: grant.token };
  const quote = await f.engine.getOffer(agent, 'course');
  const retry = await f.engine.createOrder(agent, { quoteId: quote.quoteId, idempotencyKey: 'new-authorization' });
  assert.equal((await f.engine.executePayment(agent, { orderId: retry.orderId })).paymentStatus, 'succeeded');
  assert.equal(f.provider.creates, 1);
});
pgtest('abandonment between snapshot and reservation never resurrects or dispatches prepared order', async () => {
  const f = await fixture(); await f.seedMethod(); await f.mandate(); const first = await f.order(); let count = 0;
  const store = { transaction: async (scope, op, beforeLock) => {
    if (scope.buyerId === f.scope.buyerId && ++count === 2) assert.deepEqual(await abandon(f), [first.orderId]);
    return f.store.transaction(scope, op, beforeLock);
  } };
  const result = await createPaymentsEngine({ ...f.options, store }).executePayment(f.agent, { orderId: first.orderId });
  assert.equal(result.paymentStatus, 'canceled'); assert.equal(f.provider.creates, 0);
  assert.equal((await pool.query('SELECT * FROM agent_payments.attempts WHERE order_id=$1', [first.orderId])).rows.length, 0);
});
pgtest('abandonment between reservation and fence releases hold and never fences canceled order', async () => {
  const f = await fixture(); await f.seedMethod(); await f.mandate(); const first = await f.order(); let count = 0;
  const store = { transaction: async (scope, op, beforeLock) => {
    if (scope.buyerId === f.scope.buyerId && ++count === 3) assert.deepEqual(await abandon(f), [first.orderId]);
    return f.store.transaction(scope, op, beforeLock);
  } };
  const result = await createPaymentsEngine({ ...f.options, store }).executePayment(f.agent, { orderId: first.orderId });
  assert.equal(result.paymentStatus, 'canceled'); assert.equal(f.provider.creates, 0); assert.equal((await claims(f)).length, 0);
  assert.equal((await pool.query('SELECT data FROM agent_payments.attempts WHERE order_id=$1', [first.orderId])).rows[0].data.dispatchedAt, undefined);
  const retry = await f.order(); assert.equal((await f.engine.executePayment(f.agent, { orderId: retry.orderId })).paymentStatus, 'succeeded');
});
pgtest('racing explicit abandonment and execute has only canceled-unsent or fenced-paid outcomes', async () => {
  for (let i = 0; i < 6; i++) {
    const f = await fixture(); await f.seedMethod(); await f.mandate(); const first = await f.order();
    await Promise.all([f.engine.executePayment(f.agent, { orderId: first.orderId }), abandon(f)]);
    const order = await f.engine.getOrder(f.agent, first.orderId);
    assert.ok(['canceled', 'succeeded'].includes(order.paymentStatus));
    assert.equal(f.provider.creates, order.paymentStatus === 'succeeded' ? 1 : 0);
  }
});
pgtest('abandonment never releases unknown fenced outcome or authorizes another same-period charge', async () => {
  const f = await fixture(); await f.seedMethod(); await f.mandate(); const first = await f.order(); f.provider.loseResponse = true;
  assert.equal((await f.engine.executePayment(f.agent, { orderId: first.orderId })).paymentStatus, 'unknown');
  assert.deepEqual(await abandon(f), []); assert.equal((await claims(f))[0].source_id, first.orderId);
  assert.equal((await pool.query('SELECT state FROM agent_payments.reservations WHERE order_id=$1', [first.orderId])).rows[0].state, 'held');
  const retry = await f.order(); await assert.rejects(f.engine.executePayment(f.agent, { orderId: retry.orderId }), /period_already_claimed/);
  assert.equal(f.provider.creates, 1);
});
pgtest('abandonment preserves an accepted dispatch still waiting on network', async () => {
  const f = await fixture(); const first = await f.order(); let release, entered;
  f.provider.gate = new Promise(resolve => release = resolve); const started = new Promise(resolve => entered = resolve);
  const original = f.provider.create.bind(f.provider);
  f.provider.create = async request => { entered(); return original(request); };
  const payment = f.engine.approveOrder(f.human, { orderId: first.orderId, saveMethod: false });
  await started; assert.deepEqual(await abandon(f), []); release();
  assert.equal((await payment).paymentStatus, 'succeeded'); assert.equal(f.provider.creates, 1);
});
pgtest('abandonment is scoped and deletes only claims owned by abandoned order', async () => {
  const f = await fixture(); const first = await f.order(); const other = await fixture(); const foreign = await other.order();
  await pool.query('INSERT INTO agent_payments.period_claims VALUES($1,$2,$3,$4,$5)', [f.scope.merchantId, f.scope.buyerId, f.scope.resourceId, first.quote.billingPeriod, 'other-owner']);
  assert.deepEqual(await abandon(f), [first.orderId]); assert.equal((await claims(f))[0].source_id, 'other-owner');
  assert.equal((await other.engine.getOrder(other.agent, foreign.orderId)).paymentStatus, 'prepared');
});
pgtest('abandonment and claim release roll back with enclosing human transaction', async () => {
  const f = await fixture(); const first = await f.order();
  await assert.rejects(f.store.transaction(f.scope, async c => { await abandonUndispatched(c, f.scope); throw Error('host rollback'); }), /host rollback/);
  assert.equal((await f.engine.getOrder(f.agent, first.orderId)).paymentStatus, 'prepared');
});
pgtest('deferred fulfillment retries original event exactly once across restart and concurrent reconciliation', async () => {
  const f = await fixture(); const first = await f.order(); const original = f.host.fulfill; const eventIds = [];
  f.host.fulfill = async (c, event, order) => { eventIds.push(event.eventId); if (eventIds.length === 1) return 'pending'; return original(c, event, order); };
  const paid = await f.engine.approveOrder(f.human, { orderId: first.orderId, saveMethod: false });
  assert.equal(paid.paymentStatus, 'succeeded'); assert.equal(paid.fulfillmentStatus, 'pending');
  const [event] = await f.engine.pendingEvents(f.scope); await f.engine.acknowledgeEvent(f.scope, event.eventId);
  f.provider.query = async () => { throw Error('provider unavailable after payment verified'); };
  const restarted = createPaymentsEngine(f.options);
  await Promise.all(Array.from({ length: 5 }, () => restarted.reconcile(f.scope, first.orderId)));
  const active = await f.engine.getOrder(f.agent, first.orderId); assert.equal(active.fulfillmentStatus, 'active');
  assert.deepEqual(eventIds, [event.eventId, event.eventId]); assert.equal(active.version, paid.version); assert.equal(f.provider.creates, 1);
  assert.equal((await pool.query('SELECT * FROM agent_payments.events WHERE order_id=$1', [first.orderId])).rows.length, 1);
  assert.equal((await pool.query('SELECT * FROM agent_payments.reference_receipts WHERE merchant=$1', [f.scope.merchantId])).rows.length, 1);
});
pgtest('deferred fulfillment failure remains paid-pending and can recover on later reconciliation', async () => {
  const f = await fixture(); const first = await f.order(); const original = f.host.fulfill; let mode = 'pending';
  f.host.fulfill = async (c, event, order) => { if (mode === 'pending') return 'pending'; if (mode === 'fail') { await original(c, event, order); throw Error('deferred failure'); } return original(c, event, order); };
  await f.engine.approveOrder(f.human, { orderId: first.orderId, saveMethod: false }); mode = 'fail';
  await assert.rejects(f.engine.reconcile(f.scope, first.orderId), /deferred failure/);
  const pending = await f.engine.getOrder(f.agent, first.orderId); assert.equal(pending.paymentStatus, 'succeeded'); assert.equal(pending.fulfillmentStatus, 'pending');
  assert.equal((await pool.query('SELECT * FROM agent_payments.reference_receipts WHERE merchant=$1', [f.scope.merchantId])).rows.length, 0);
  mode = 'active'; assert.equal((await f.engine.reconcile(f.scope, first.orderId)).fulfillmentStatus, 'active');
});
pgtest('refund after deferred payment prevents replay of earlier entitlement grant', async () => {
  const f = await fixture(); const first = await f.order(); let calls = 0; f.host.fulfill = async () => { calls++; return 'pending'; };
  await f.engine.approveOrder(f.human, { orderId: first.orderId, saveMethod: false }); const providerId = [...f.provider.payments.keys()][0];
  f.provider.refunds.set('refund-pending', { refundId: 'refund-pending', providerId, accountId: f.provider.accountId, test: true, amount: { minor: '1000', currency: 'RUB' }, status: 'succeeded' });
  await f.engine.reconcileRefund(f.scope, first.orderId, 'refund-pending');
  const order = await f.engine.reconcile(f.scope, first.orderId); assert.equal(order.fulfillmentStatus, 'review_required'); assert.equal(calls, 1);
});
pgtest('settled refund rejects switched provider or account before querying refund', async () => {
  for (const key of ['provider', 'accountId']) {
    const f = await fixture(); const first = await f.order(); await f.engine.approveOrder(f.human, { orderId: first.orderId, saveMethod: false });
    let calls = 0; f.provider.queryRefund = async () => { calls++; throw Error('must not query'); }; f.provider[key] = 'different';
    await assert.rejects(f.engine.reconcileRefund(f.scope, first.orderId, 'same-id'), /attempt_provider_mismatch/); assert.equal(calls, 0);
  }
});
pgtest('direct verified settlement replay cannot duplicate paid event or entitlement', async () => {
  const f = await fixture(); const first = await f.order(); await f.engine.approveOrder(f.human, { orderId: first.orderId, saveMethod: false });
  const result = [...f.provider.payments.values()][0]; const ctx = new Context(f.options);
  await Promise.all(Array.from({ length: 5 }, () => settle(ctx, f.scope, first.orderId, result)));
  assert.equal((await pool.query('SELECT * FROM agent_payments.events WHERE order_id=$1', [first.orderId])).rows.length, 1);
  assert.equal((await pool.query('SELECT * FROM agent_payments.reference_receipts WHERE merchant=$1', [f.scope.merchantId])).rows.length, 1);
});
