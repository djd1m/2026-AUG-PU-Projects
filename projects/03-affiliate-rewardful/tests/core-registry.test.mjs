import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, refundFor, ref, code } from './helpers/core-fixture.mjs';

test('SC-US-003-2 SC-US-004-1 selected month cash registry explains held, refunded and credit exclusions', async t => {
  const f = await fixture(t), artifact = await f.call('registry.prepare', { period: '2026-08' });
  assert.equal(artifact.amountMinor, 60000); assert.equal(artifact.currency, 'RUB');
  assert.equal(artifact.rows.length, 2); assert.equal(artifact.dueDate, '2026-09-05');
  for (const reason of ['held', 'refunded_or_disputed', 'subscription_credit']) assert(artifact.exclusions.some(e => e.reason === reason));
  assert(!artifact.rows.some(r => r.partnerId === f.context('customer').actorId));
  assert.equal((await f.call('registry.prepare', { period: '2026-07' })).rows.length, 0);
  await assert.rejects(f.call('registry.prepare', { period: '2026-13' }), code('VALIDATION'));
});
test('SC-US-004-2 SC-US-004-7 refund invalidates approval, exports including cached command and releases only unsent allocations', async t => {
  const f = await fixture(t), artifact = await f.call('registry.prepare', { period: '2026-08' });
  await f.call('registry.approve', ref(artifact), undefined, 'approve-v1');
  await f.call('registry.export', ref(artifact), undefined, 'export-v1');
  await f.call('fixture.event', await refundFor(f));
  await assert.rejects(f.call('registry.export', ref(artifact)), code('STALE_SOURCE'));
  await assert.rejects(f.call('registry.export', ref(artifact), undefined, 'export-v1'), code('STALE_SOURCE'));
  await assert.rejects(f.call('registry.approve', ref(artifact), undefined, 'approve-v1'), code('STALE_SOURCE'));
  assert.equal((await f.sql('SELECT count(*)::int AS n FROM allocations')).rows[0].n, 0);
  const current = await f.call('registry.read', { artifactId: artifact.artifactId });
  assert.equal(current.approval, null); assert.equal(current.status, 'stale'); assert.equal(current.hash, artifact.hash);
  const next = await f.call('registry.prepare', { period: '2026-08', artifactId: artifact.artifactId });
  assert.equal(next.revision, 2); assert.notEqual(next.hash, artifact.hash); assert.equal(next.amountMinor, 55000);
  assert.equal(next.approval, null);
  await f.call('registry.approve', ref(next));
  await f.call('registry.export', ref(next));
  const historical = await f.sql('SELECT payload FROM immutable_facts WHERE kind=$1 AND business_key=$2', ['registry_revision', `${artifact.artifactId}/1`]);
  assert.equal(historical.rows[0].payload.hash, artifact.hash);
});
test('SC-US-004-2 stale draft cannot be approved when no previous approval exists to invalidate', async t => {
  const f = await fixture(t), artifact = await f.call('registry.prepare', { period: '2026-08' });
  await f.call('fixture.event', await refundFor(f));
  await assert.rejects(f.call('registry.approve', ref(artifact)), code('STALE_SOURCE'));
  assert.equal((await f.sql('SELECT count(*)::int AS n FROM allocations')).rows[0].n, 0);
});
test('SC-US-004-3 SC-US-004-6 export does not send; repeated send with new key preserves one fact; mixed partner sends survive', async t => {
  const f = await fixture(t), artifact = await f.call('registry.prepare', { period: '2026-08' });
  await assert.rejects(f.call('registry.export', ref(artifact)), code('APPROVAL_REQUIRED'));
  await f.call('registry.approve', ref(artifact));
  const csv = await f.call('registry.export', ref(artifact));
  assert(csv.csv.includes('amount_minor')); assert.equal((await f.call('dashboard')).transfers.length, 0);
  const payload = { ...ref(artifact), partnerId: artifact.rows[0].partnerId, evidence: 'synthetic 1', sentAt: f.session.clock };
  const transfer = await f.call('registry.sent', payload);
  assert.deepEqual(await f.call('registry.sent', payload), transfer);
  assert.equal((await f.call('registry.read', { artifactId: artifact.artifactId })).status, 'partially_sent');
  await assert.rejects(f.call('registry.sent', { ...payload, evidence: 'conflicting' }), code('TRANSFER_CONFLICT'));
  await f.call('registry.sent', { ...payload, partnerId: artifact.rows[1].partnerId, evidence: 'synthetic 2' });
  assert.equal((await f.call('dashboard')).summary.sentMinor, 60000);
  assert.equal((await f.call('registry.read', { artifactId: artifact.artifactId })).status, 'sent');
  assert.equal((await f.call('registry.prepare', { period: '2026-08' })).rows.length, 0);
});
test('SC-US-004-4 SC-US-004-5 same artifact snapshot is stable and competing approvals cannot share obligations', async t => {
  const f = await fixture(t), first = await f.call('registry.prepare', { period: '2026-08' });
  assert.deepEqual(await f.call('registry.prepare', { period: '2026-08', artifactId: first.artifactId }), first);
  const second = await f.call('registry.prepare', { period: '2026-08' }), peer = await f.peer();
  const results = await Promise.allSettled([f.call('registry.approve', ref(first)),
    peer.execute(f.context('merchant'), 'registry.approve', ref(second), 'other-approval')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'ALLOCATION_CONFLICT');
  assert.equal((await f.sql('SELECT count(*)::int AS n FROM allocations')).rows[0].n, 2);
  assert.equal((await f.call('registry.prepare', { period: '2026-08' })).rows.length, 0);
});
test('SC-US-004-7 mixed sent row remains allocated after refund and remaining row can be reapproved', async t => {
  const f = await fixture(t), first = await f.call('registry.prepare', { period: '2026-08' });
  await f.call('registry.approve', ref(first));
  const ilya = f.session.actors.find(a => a.name === 'Илья');
  await f.call('registry.sent', { ...ref(first), partnerId: ilya.id, evidence: 'ilya sent', sentAt: f.session.clock });
  await f.call('fixture.event', await refundFor(f));
  const allocations = await f.sql('SELECT * FROM allocations');
  assert.equal(allocations.rows.length, 1); assert(allocations.rows[0].transfer_id);
  const next = await f.call('registry.prepare', { period: '2026-08', artifactId: first.artifactId });
  assert.equal(next.rows.length, 1); assert.equal(next.amountMinor, 15000);
  await f.call('registry.approve', ref(next));
  await f.call('registry.sent', { ...ref(next), partnerId: next.rows[0].partnerId, evidence: 'anna after correction', sentAt: f.session.clock });
  assert.equal((await f.call('dashboard')).summary.sentMinor, 55000);
});
test('SC-US-004-8 historical CSV actual payment creates one reconciliation and never authorizes a second transfer', async t => {
  const f = await fixture(t), first = await f.call('registry.prepare', { period: '2026-08' });
  await f.call('registry.approve', ref(first)); await f.call('registry.export', ref(first));
  await f.call('fixture.event', await refundFor(f));
  const anna = f.session.actors.find(a => a.name === 'Анна');
  const input = { artifactId: first.artifactId, revision: first.revision, partnerId: anna.id, amountMinor: 20000, evidence: 'old CSV synthetic transfer', sentAt: f.session.clock };
  const record = await f.call('registry.reconcile', input);
  assert.equal(record.discrepancyMinor, 5000); assert.deepEqual(await f.call('registry.reconcile', input), record);
  await assert.rejects(f.call('registry.reconcile', { ...input, amountMinor: 22000 }), code('RECONCILIATION_CONFLICT'));
  const view = await f.call('dashboard');
  assert.equal(view.transfers.length, 1); assert.equal(view.summary.sentMinor, 20000);
  assert(view.exceptions.some(e => e.type === 'stale_csv_reconciliation'));
  const next = await f.call('registry.prepare', { period: '2026-08' });
  assert(!next.rows.some(r => r.partnerId === anna.id));
});
