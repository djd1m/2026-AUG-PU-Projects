import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, code } from './helpers/core-fixture.mjs';

test('SC-US-001-1 SC-US-006-1 foreign tenant resource is denied across UI/MCP/A2A fixture contexts', async t => {
  const f = await fixture(t), other = await f.app.createDemo({ variant: 'D', role: 'merchant' });
  const artifact = await f.call('registry.prepare', { period: '2026-08' });
  for (const channel of ['UI', 'MCP', 'A2A']) {
    await assert.rejects(f.app.execute({ token: other.token, actorId: other.actorId }, 'registry.read', { artifactId: artifact.artifactId }), error => {
      assert(!JSON.stringify(error).includes(artifact.hash), channel); return error.status === 404;
    });
    await assert.rejects(f.app.execute({ token: other.token, actorId: f.session.actorId }, 'dashboard', {}), code('FORBIDDEN'));
  }
  assert.notEqual(f.session.runId, other.runId);
  assert.equal((await f.app.execute({ token: other.token, actorId: other.actorId }, 'dashboard', {})).registries.length, 0);
});
test('SC-US-001-2 partner cannot read merchant registry or known other partner', async t => {
  const f = await fixture(t), partner = f.context('partner');
  const ilya = f.session.actors.find(a => a.name === 'Илья');
  await assert.rejects(f.call('dashboard', {}, partner), code('FORBIDDEN'));
  await assert.rejects(f.call('registry.prepare', { period: '2026-08' }, partner), code('FORBIDDEN'));
  await assert.rejects(f.call('partner.read', { partnerId: ilya.id }, partner), code('FORBIDDEN'));
  const personal = await f.call('partner.read', {}, partner);
  assert(personal.ledger.every(e => e.beneficiaryId === partner.actorId));
  assert(!JSON.stringify(personal).includes(ilya.id));
});
test('SC-US-001-3 server checks selected membership, limited token cannot gain merchant through variant switch', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('dashboard')).actor.role, 'merchant');
  assert.equal((await f.call('partner.read', {}, f.context('partner'))).actor.role, 'partner');
  const limited = await f.app.createDemo({ variant: 'D', role: 'partner', limited: true });
  assert.equal(limited.actors.length, 1);
  const row = await f.sql('SELECT state FROM tenants WHERE id=$1', [limited.runId]);
  const merchant = row.rows[0].state.actors.find(a => a.role === 'merchant');
  await assert.rejects(f.app.execute({ token: limited.token, actorId: merchant.id }, 'dashboard', {}), code('FORBIDDEN'));
});
test('strict schemas, idempotent input hash and atomic bootstrap limits fail closed', async t => {
  const f = await fixture(t, { maxDemoRuns: 2 });
  await assert.rejects(f.call('program.save', JSON.parse('{"__proto__":{"admin":true}}')), code('VALIDATION'));
  await assert.rejects(f.call('fixture.advance', { days: 1, tenantId: f.session.runId }), code('VALIDATION'));
  await assert.rejects(f.call('does.not.exist'), code('UNKNOWN_ACTION'));
  for (const grantId of [null, '', false, 0]) await assert.rejects(f.call('dashboard', {}, { ...f.context('merchant'), grantId }), code('VALIDATION'));
  await assert.rejects(f.app.createDemo({ variant: 'A', role: 'merchant', actorId: 'forged' }), code('VALIDATION'));
  const first = await f.call('fixture.advance', { days: 1 }, undefined, 'same-key');
  assert.deepEqual(await f.call('fixture.advance', { days: 1 }, undefined, 'same-key'), first);
  await assert.rejects(f.call('fixture.advance', { days: 2 }, undefined, 'same-key'), code('IDEMPOTENCY_CONFLICT'));
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => f.app.createDemo({ variant: 'B', role: 'customer' })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'DEMO_LIMIT'));
  assert.equal((await f.sql('SELECT count(*)::int AS n FROM tenants')).rows[0].n, 2);
  const tokens = await f.sql('SELECT token_hash FROM sessions');
  assert(tokens.rows.every(r => r.token_hash.length === 64 && r.token_hash !== f.session.token));
});
