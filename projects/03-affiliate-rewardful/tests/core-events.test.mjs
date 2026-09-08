import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, eventFor, refundFor, code, ref } from './helpers/core-fixture.mjs';

test('SC-US-002-1 SC-US-006-3 concurrent business payment across processes and retry after restart accrues once', async t => {
  const f = await fixture(t), event = await eventFor(f), peer = await f.peer();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => i % 2 ? f.call('fixture.event', event) :
    peer.execute(f.context('merchant'), 'fixture.event', event, `parallel-${i}`)));
  assert.equal(new Set(results.map(r => r.paymentId)).size, 1);
  await f.restart();
  assert.deepEqual(await f.call('fixture.event', event), results[0]);
  const dashboard = await f.call('dashboard');
  assert.equal(dashboard.ledger.filter(e => e.paymentId === results[0].paymentId).length, 1);
  await assert.rejects(f.call('fixture.event', { ...event, amountMinor: 1 }), code('BUSINESS_KEY_CONFLICT'));
  const facts = await f.sql('SELECT count(*)::int AS n FROM immutable_facts WHERE kind=$1 AND business_key=$2', ['payment', `fixture/demo/${event.objectId}`]);
  assert.equal(facts.rows[0].n, 1);
});
test('SC-US-002-2 recurring payment IDs accrue separately and frozen policy versions survive changes', async t => {
  const f = await fixture(t), event = await eventFor(f), first = await f.call('fixture.event', event);
  await f.call('program.save', { kind: 'cash', bps: 3000, holdDays: 0, windowDays: 30, recurring: true });
  const second = await f.call('fixture.event', { ...event, objectId: `${event.objectId}-renewal` });
  assert.equal(first.rewardMinor, 20000); assert.equal(second.rewardMinor, 30000);
  assert.notEqual(first.policyVersion, second.policyVersion);
  assert.deepEqual(await f.call('fixture.event', event), first);
  await f.call('program.save', { kind: 'cash', bps: 4000, holdDays: 0, windowDays: 30, recurring: false });
  assert.equal((await f.call('fixture.event', { ...event, objectId: `${event.objectId}-disabled` })).rewardMinor, 0);
});
test('SC-US-002-3 unverified and unknown events cannot claim identity; verified retry can', async t => {
  const f = await fixture(t), event = await eventFor(f);
  await assert.rejects(f.call('fixture.event', { ...event, verified: false }), code('UNVERIFIED_EVENT'));
  await assert.rejects(f.call('fixture.event', { ...event, status: 'unknown' }), code('UNVERIFIED_EVENT'));
  assert.equal((await f.call('fixture.event', event)).rewardMinor, 20000);
});
test('SC-US-002-4 explicit promo wins and invalid promo, self-referral and expired attribution explain zero reward', async t => {
  const f = await fixture(t), event = await eventFor(f);
  const ilya = f.session.actors.filter(a => a.role === 'partner')[1];
  const mixed = { ...event, cookie: { beneficiaryId: ilya.id, attributedAt: event.promo.attributedAt } };
  const result = await f.call('fixture.event', mixed);
  assert.equal(result.attribution.channel, 'promo'); assert.equal(result.attribution.beneficiaryId, event.beneficiaryId);
  for (const [suffix, patch, reason] of [
    ['invalid', { promo: { ...event.promo, code: 'INVALID' } }, 'invalid_promo_or_link'],
    ['self', { customerId: event.beneficiaryId }, 'self_referral'],
    ['expired', { promo: { ...event.promo, attributedAt: '2026-01-01T00:00:00.000Z' } }, 'attribution_expired'],
  ]) {
    const zero = await f.call('fixture.event', { ...mixed, objectId: `${event.objectId}-${suffix}`, ...patch });
    assert.equal(zero.rewardMinor, 0); assert.equal(zero.attribution.reason, reason);
  }
});
test('SC-US-003-1 pending refund, cumulative rounding and duplicate refund preserve immutable ledger; failed transaction rolls back', async t => {
  const f = await fixture(t), event = await eventFor(f, { amountMinor: 9 });
  const refund = await refundFor(f, { paymentId: event.objectId, amountMinor: 1 });
  assert.equal((await f.call('fixture.event', refund)).status, 'pending_payment');
  const payment = await f.call('fixture.event', event);
  for (const [i, amountMinor] of [1, 7].entries()) await f.call('fixture.event', { ...refund, objectId: `${refund.objectId}-${i}`, amountMinor });
  await f.call('fixture.event', refund);
  const ledger = (await f.call('dashboard')).ledger.filter(e => e.paymentId === payment.paymentId);
  assert.deepEqual(ledger.map(e => e.amountMinor), [1, -1]);
  await assert.rejects(f.sql('UPDATE immutable_facts SET payload=$1 WHERE kind=$2', ['{}', 'ledger']), /Immutable fact/);
  const before = await f.call('dashboard');
  await assert.rejects(f.call('fixture.event', { ...refund, objectId: `${refund.objectId}-over`, amountMinor: 1 }), code('REFUND_EXCEEDS_PAYMENT'));
  assert.deepEqual(await f.call('dashboard'), before);
  const pending = await eventFor(f, { amountMinor: 1 });
  await f.call('fixture.event', await refundFor(f, { paymentId: pending.objectId, amountMinor: 2 }));
  await assert.rejects(f.call('fixture.event', pending, undefined, 'rollback-retry'), code('REFUND_EXCEEDS_PAYMENT'));
  assert(!(await f.call('dashboard')).payments.some(p => p.objectId === pending.objectId));
  assert.equal((await f.call('fixture.event', { ...pending, amountMinor: 2 }, undefined, 'rollback-retry')).status, 'no_reward');
});
test('SC-US-003-3 refund after simulated sent fact creates debt exception and never frees sent obligations', async t => {
  const f = await fixture(t), artifact = await f.call('registry.prepare', { period: '2026-08' });
  await f.call('registry.approve', ref(artifact));
  const anna = f.session.actors.find(a => a.name === 'Анна');
  const transfer = await f.call('registry.sent', { ...ref(artifact), partnerId: anna.id, evidence: 'synthetic transfer 1', sentAt: f.session.clock });
  await f.call('fixture.event', await refundFor(f));
  const view = await f.call('dashboard');
  assert.deepEqual(view.transfers[0], transfer); assert(view.exceptions.some(e => e.type === 'post_sent_refund'));
  const next = await f.call('registry.prepare', { period: '2026-08' });
  assert(!next.rows.some(r => r.partnerId === anna.id));
  assert(next.exclusions.some(e => e.reason === 'sent'));
  await assert.rejects(f.sql('DELETE FROM allocations WHERE transfer_id IS NOT NULL'), /Sent allocation/);
});
