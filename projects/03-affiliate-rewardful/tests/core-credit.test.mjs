import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, refundFor, code } from './helpers/core-fixture.mjs';

test('credit concurrency across processes never over-reserves balance or invoice; unknown retains, success applies once', async t => {
  const f = await fixture(t), customer = f.context('customer'), view = await f.call('credit.read', {}, customer), peer = await f.peer();
  assert.equal(view.availableMinor, 30000); assert.equal(view.invoice.remainingMinor, 150000);
  const input = { invoiceId: view.invoice.id, amountMinor: 30000 };
  const results = await Promise.allSettled([f.call('credit.reserve', input, customer), peer.execute(customer, 'credit.reserve', input, 'peer-reserve')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'INSUFFICIENT_CREDIT');
  const reservation = results.find(r => r.status === 'fulfilled').value;
  await f.call('credit.resolve', { reservationId: reservation.id, outcome: 'unknown' });
  await f.restart();
  assert.equal((await f.call('credit.read', {}, customer)).reservedMinor, 30000);
  const success = await f.call('credit.resolve', { reservationId: reservation.id, outcome: 'success' });
  assert.deepEqual(await f.call('credit.resolve', { reservationId: reservation.id, outcome: 'success' }), success);
  const applied = await f.call('credit.read', {}, customer);
  assert.equal(applied.invoice.remainingMinor, 120000); assert.equal(applied.availableMinor, 0); assert.equal(applied.appliedMinor, 30000);
  await assert.rejects(f.call('credit.resolve', { reservationId: reservation.id, outcome: 'failed' }), code('BILLING_CONFLICT'));
});
test('failed billing releases once; late refund keeps prior invoice and exposes negative credit adjustment', async t => {
  const f = await fixture(t), customer = f.context('customer'), view = await f.call('credit.read', {}, customer);
  const reservation = await f.call('credit.reserve', { invoiceId: view.invoice.id, amountMinor: 30000 }, customer);
  await f.call('credit.resolve', { reservationId: reservation.id, outcome: 'failed' });
  await f.call('credit.resolve', { reservationId: reservation.id, outcome: 'failed' });
  assert.equal((await f.call('credit.read', {}, customer)).availableMinor, 30000);
  const another = await f.call('credit.reserve', { invoiceId: view.invoice.id, amountMinor: 30000 }, customer);
  await f.call('credit.resolve', { reservationId: another.id, outcome: 'success' });
  await f.call('fixture.event', await refundFor(f, { paymentId: 'maria-credit', amountMinor: 150000 }));
  const final = await f.call('credit.read', {}, customer);
  assert.equal(final.invoice.remainingMinor, 120000); assert.equal(final.adjustmentMinor, -30000);
  assert.equal(final.availableMinor, 0); assert(final.exceptions.some(e => e.type === 'applied_credit_refund'));
});
test('explicit enrollment is idempotent, branded share kit remains own scoped, credit cannot become cash', async t => {
  const f = await fixture(t), customer = f.context('customer'), partner = f.context('partner');
  await assert.rejects(f.call('share.read', {}, partner), code('ENROLLMENT_REQUIRED'));
  await assert.rejects(f.call('enrollment.join', { consent: false }, partner), code('CONSENT_REQUIRED'));
  const joined = await f.call('enrollment.join', { consent: true }, partner);
  assert.deepEqual(await f.call('enrollment.join', { consent: true }, partner), joined);
  const share = await f.call('share.read', {}, partner), terms = await f.call('program.read', {}, partner);
  assert.equal(share.referralUrl, joined.referralUrl); assert.notEqual(share.referralUrl, terms.enrollmentUrl); assert.equal(share.branded, true);
  await assert.rejects(f.call('credit.reserve', { amountMinor: -1, invoiceId: 'x' }, customer), code('VALIDATION'));
  await assert.rejects(f.call('registry.prepare', { period: '2026-08' }, customer), code('FORBIDDEN'));
  const grant = await f.call('grant.create', { actions: ['credit.read'], expiresInSeconds: 60 }, customer);
  const delegated = { ...customer, grantId: grant.grantId };
  assert.deepEqual(await f.call('credit.read', {}, delegated), await f.call('credit.read', {}, customer));
  await assert.rejects(f.call('credit.reserve', { amountMinor: 1, invoiceId: 'x' }, delegated), code('GRANT_SCOPE'));
});
