import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { referralFixture, day, lockWait } from './helpers/referral-fixture.mjs';
import { code } from './helpers/core-fixture.mjs';
import { transaction } from '../shared/infrastructure/postgres.mjs';
import { hash } from '../shared/domain/common.mjs';
import { createReferrals } from '../shared/referrals/service.mjs';

test('referral configuration validates destinations; key is hash-only, scoped, rotated and revoked', async t => {
  const x = await referralFixture(t), r = x.referrals;
  for (const landingUrl of ['http://merchant.example', 'https://u:p@merchant.example', 'https://merchant.example/#secret',
    'https://merchant.example/?n3_ref=bad', 'https://merchant.example/?n3_ref_expires=bad', 'https://localhost/']) {
    await assert.rejects(r.configure(x.owner.token, x.owner.membershipId, { landingUrl, returnUrl: 'https://merchant.example/paid' }), code('VALIDATION'));
  }
  await assert.rejects(r.configure(x.owner.token, x.owner.membershipId,
    { landingUrl: 'https://merchant.example', returnUrl: 'https://foreign.example' }), code('VALIDATION'));
  await assert.rejects(r.rotate(x.partner.token, x.joined.membershipId), code('FORBIDDEN'));
  const stored = (await x.pool.query('SELECT * FROM referral_credentials WHERE tenant_id=$1', [x.tenantId])).rows[0];
  assert.equal(stored.token_hash, hash(x.key.token)); assert.ok(!JSON.stringify(stored).includes(x.key.token));
  assert.equal(Date.parse(x.key.expiresAt) - x.now(), 90 * day);
  const next = await r.rotate(x.owner.token, x.owner.membershipId);
  await assert.rejects(r.bind(x.key.token, x.input()), code('UNAUTHENTICATED'));
  await r.bind(next.token, x.input());
  assert.equal((await x.pool.query('SELECT count(*)::int AS n FROM referral_credentials WHERE tenant_id=$1', [x.tenantId])).rows[0].n, 1);
  await r.revoke(x.owner.token, x.owner.membershipId);
  await assert.rejects(r.bind(next.token, x.input()), code('UNAUTHENTICATED'));
  assert.equal((await r.status(x.owner.token, x.owner.membershipId)).keyActive, false);
});

test('default 30 and published 60/90 day visits freeze server expiry independently of later policy', async t => {
  const x = await referralFixture(t);
  for (const days of [30, 60, 90]) {
    await x.publish(days); const visit = await x.visit();
    assert.equal(Date.parse(visit.expiresAt) - x.now(), days * day);
    assert.equal(visit.location.origin, 'https://merchant.example'); assert.equal(visit.location.searchParams.get('plan'), 'starter');
    assert.deepEqual(await x.referrals.trackerConfig(x.tenantId), { tenantId: x.tenantId, windowDays: days, landingOrigin: 'https://merchant.example' });
  }
  await x.publish(30); const first = await x.visit(); await x.publish(90); x.advance(30 * day);
  const input = x.input({ visitToken: first.token });
  const bound = await x.referrals.bind(x.key.token, input);
  assert.equal(bound.attribution.beneficiaryId, null); assert.equal(bound.attribution.reason, 'attribution_expired');
  assert.deepEqual(await x.referrals.bind(x.key.token, input), bound);
  const recent = await x.visit(); const live = await x.referrals.bind(x.key.token, x.input({ visitToken: recent.token }));
  assert.equal(live.attribution.beneficiaryId, x.joined.actorId);
});

test('verified binding has promo precedence, strict inputs, stable retries and no secret or email leakage', async t => {
  const x = await referralFixture(t), visit = await x.visit();
  const state = (await x.pool.query('SELECT state FROM tenants WHERE id=$1', [x.tenantId])).rows[0].state;
  const promoCode = state.actors.find(a => a.id === x.joined.actorId).promoCode;
  const input = x.input({ visitToken: visit.token, promoCode: 'WRONG' });
  await assert.rejects(x.referrals.bind(x.key.token, input), code('INVALID_REFERRAL'));
  assert.equal((await x.pool.query('SELECT count(*)::int AS n FROM referral_customers')).rows[0].n, 0);
  const bound = await x.referrals.bind(x.key.token, { ...input, promoCode });
  assert.equal(bound.attribution.channel, 'promo'); assert.equal(bound.attribution.beneficiaryId, x.joined.actorId);
  const repeated = await x.referrals.bind(x.key.token, { ...input, email: input.email.toUpperCase(), promoCode: 'NOW-INVALID' });
  assert.deepEqual(repeated, bound);
  await assert.rejects(x.referrals.bind(x.key.token, { ...input, email: 'changed@example.test' }), code('CUSTOMER_CONFLICT'));
  for (const extra of [{ emailVerified: false }, { beneficiaryId: x.joined.actorId }, { tenantId: x.tenantId }, { visitToken: '' }, { promoCode: '' }]) {
    await assert.rejects(x.referrals.bind(x.key.token, x.input(extra)), error => error.status === 400);
  }
  const raw = (await x.pool.query('SELECT * FROM referral_customers WHERE id=$1', [bound.bindingId])).rows[0];
  assert.equal(raw.email_hash, hash(input.email)); assert.ok(!JSON.stringify(raw).includes(input.email));
  assert.ok(!JSON.stringify(bound).includes(input.email));
});

test('foreign/forged evidence refuses, self referrals refuse, owner organic binding has zero beneficiary', async t => {
  const x = await referralFixture(t), visit = await x.visit();
  for (const email of [x.partnerEmail.toUpperCase(), ` ${x.ownerEmail} `]) {
    await assert.rejects(x.referrals.bind(x.key.token, x.input({ email, visitToken: visit.token })), code('SELF_REFERRAL'));
  }
  const organic = await x.referrals.bind(x.key.token, x.input({ email: x.ownerEmail }));
  assert.equal(organic.attribution.channel, 'none'); assert.equal(organic.attribution.beneficiaryId, null);
  await assert.rejects(x.referrals.bind(x.key.token, x.input({ visitToken: randomBytes(32).toString('base64url') })), code('INVALID_REFERRAL'));
  const foreignTenant = (await x.identity.me(x.partner.token)).memberships.find(m => m.membershipId === x.partner.membershipId).tenantId;
  await x.pool.query('UPDATE referral_visits SET tenant_id=$2 WHERE token_hash=$1', [hash(visit.token), foreignTenant]);
  await assert.rejects(x.referrals.bind(x.key.token, x.input({ visitToken: visit.token })), code('INVALID_REFERRAL'));
  await assert.rejects(transaction(x.pool, client => x.referrals.customer(client, foreignTenant, organic.customerId)), code('CUSTOMER_NOT_FOUND'));
});

test('public visits require real enrolled partner and explicitly published configured cash program', async t => {
  const x = await referralFixture(t);
  const ownerActor = (await x.identity.me(x.owner.token)).memberships[0].actorId;
  await assert.rejects(x.referrals.visit(ownerActor), code('REFERRAL_INACTIVE'));
  await assert.rejects(x.referrals.visit(x.f.session.actors.find(a => a.role === 'partner').id), code('PROGRAM_NOT_FOUND'));
  await x.pool.query("UPDATE tenants SET state=jsonb_set(state,'{enrollments}','[]') WHERE id=$1", [x.tenantId]);
  await assert.rejects(x.visit(), code('REFERRAL_INACTIVE'));
  await x.pool.query("UPDATE tenants SET state=jsonb_set(state,'{policyConfigured}','[]') WHERE id=$1", [x.tenantId]);
  await assert.rejects(x.referrals.trackerConfig(x.tenantId), code('POLICY_REQUIRED'));
});

test('concurrent same-customer binding creates one immutable row and unrelated tenant stays responsive', async t => {
  const x = await referralFixture(t), visit = await x.visit(), input = x.input({ visitToken: visit.token });
  const [bindings, unrelated] = await Promise.all([
    Promise.all(Array.from({ length: 8 }, () => x.referrals.bind(x.key.token, input))), x.identity.me(x.partner.token),
  ]);
  assert.equal(new Set(bindings.map(b => b.bindingId)).size, 1); assert.equal(unrelated.memberships.length, 2);
  assert.equal((await x.pool.query('SELECT count(*)::int AS n FROM referral_customers')).rows[0].n, 1);
  const conflict = await Promise.allSettled([
    x.referrals.bind(x.key.token, x.input({ customerId: 'raced' })), x.referrals.bind(x.key.token, x.input({ customerId: 'raced' })),
  ]);
  assert.equal(conflict.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(conflict.find(r => r.status === 'rejected').reason.code, 'CUSTOMER_CONFLICT');
});

test('credential invalidation and expiry are rechecked after tenant waits and roll back customer insert', async t => {
  const x = await referralFixture(t);
  const blocker = await x.pool.connect(); await blocker.query('BEGIN');
  try {
    await blocker.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [x.tenantId]);
    const pending = x.referrals.bind(x.key.token, x.input());
    const rejected = assert.rejects(pending, code('UNAUTHENTICATED'));
    await lockWait(x.pool, x.f.schema); x.advance(90 * day);
    await blocker.query('COMMIT'); await rejected;
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  assert.equal((await x.pool.query('SELECT count(*)::int AS n FROM referral_customers')).rows[0].n, 0);
  x.advance(-90 * day);
  await x.pool.query('UPDATE accounts SET version=version+1 WHERE id=(SELECT account_id FROM referral_credentials WHERE tenant_id=$1)', [x.tenantId]);
  await assert.rejects(x.referrals.bind(x.key.token, x.input()), code('UNAUTHENTICATED'));
});

test('rotation while authorization is waiting follows tenant-before-credential order without deadlock', async t => {
  const x = await referralFixture(t);
  let releaseRotation, enteredRotation;
  const entered = new Promise(resolve => { enteredRotation = resolve; });
  const release = new Promise(resolve => { releaseRotation = resolve; });
  const identity = { ...x.identity, lockedState: async (...args) => {
    const value = await x.identity.lockedState(...args); enteredRotation(); await release; return value;
  } };
  const rotator = createReferrals({ pool: x.pool, identity, now: x.now });
  const rotating = rotator.rotate(x.owner.token, x.owner.membershipId); await entered;
  const binding = assert.rejects(x.referrals.bind(x.key.token, x.input()), code('UNAUTHENTICATED'));
  try { await lockWait(x.pool, x.f.schema); } finally { releaseRotation(); }
  const next = await rotating; await binding;
  await x.referrals.bind(next.token, x.input());
});

test('literal tenant caps reject extra visits/customers while existing customer retry remains available', async t => {
  const x = await referralFixture(t), visit = await x.visit(), bound = await x.referrals.bind(x.key.token, x.input({ customerId: 'existing', email: 'existing@example.test' }));
  // Populate the exact same100000-row boundary in short setup statements.
  // This VPS is shared; fixture bulk IO must respect the production5s timeout.
  for(let start=1;start<=99998;start+=5000) await x.pool.query(`INSERT INTO referral_visits(id,token_hash,tenant_id,beneficiary_id,policy_id,created_at,expires_at)
    SELECT gen_random_uuid(),md5(g::text),tenant_id,beneficiary_id,policy_id,created_at,expires_at
    FROM referral_visits CROSS JOIN generate_series($2::int,$3::int) g WHERE token_hash=$1`, [hash(visit.token),start,Math.min(start+4999,99998)]);
  const clicks = await Promise.allSettled([x.visit(), x.visit()]);
  assert.equal(clicks.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(clicks.find(r => r.status === 'rejected').reason.code, 'REFERRAL_LIMIT');
  await assert.rejects(x.visit(), code('REFERRAL_LIMIT'));
  await x.pool.query(`INSERT INTO referral_customers(id,tenant_id,external_id,email_hash,beneficiary_id,channel,registered_at)
    SELECT gen_random_uuid(),$1,'capacity-'||g,md5(g::text),NULL,'none',$2 FROM generate_series(1,9998) g`, [x.tenantId, new Date(x.now())]);
  const signups = await Promise.allSettled([x.referrals.bind(x.key.token, x.input()), x.referrals.bind(x.key.token, x.input())]);
  assert.equal(signups.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(signups.find(r => r.status === 'rejected').reason.code, 'REFERRAL_LIMIT');
  await assert.rejects(x.referrals.bind(x.key.token, x.input()), code('REFERRAL_LIMIT'));
  assert.deepEqual(await x.referrals.bind(x.key.token, x.input({ customerId: 'existing', email: 'existing@example.test' })), bound);
  assert.equal((await x.identity.me(x.partner.token)).memberships.length, 2);
});

test('metrics scope partner facts, distinguish test/live and retain first commission after refund or next week', async t => {
  const x = await referralFixture(t), visit = await x.visit();
  const attributed = await x.referrals.bind(x.key.token, x.input({ visitToken: visit.token }));
  const organic = await x.referrals.bind(x.key.token, x.input());
  const legacyOnly = await x.referrals.bind(x.key.token, x.input());
  const state = (await x.pool.query('SELECT state FROM tenants WHERE id=$1', [x.tenantId])).rows[0].state;
  async function order(binding, { testMode = false, source = 'connector', status = 'succeeded', positive = true, at = x.now() } = {}) {
    const providerId = randomUUID(), attribution = { id: binding.bindingId, ...binding.attribution };
    await x.pool.query(`INSERT INTO checkout_orders(id,tenant_id,shop_id,test_mode,command_key,input_hash,input,policy_id,created_at,provider_id,status,source,attribution)
      VALUES($1,$2,'shop',$3,$4,'unused',$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(), x.tenantId, testMode, randomUUID(), { customerId: binding.customerId }, state.policies[0].id, new Date(at), providerId, status, source, attribution]);
    state.payments.push({ source, provider: 'yookassa', accountId: 'shop', objectId: providerId, bindingId: binding.bindingId,
      testMode, paidAt: new Date(at).toISOString(), rewardMinor: positive ? 200 : 0 });
  }
  await order(attributed, { testMode: true, at: x.now() - day });
  await order(attributed); await order(attributed); await order(organic, { positive: false });
  await order(legacyOnly, { source: 'legacy' }); await order(organic, { testMode: true, status: 'pending' });
  state.ledger.push({ amountMinor: -200 }); // Refund corrections do not erase the historical payment fact.
  await x.pool.query('UPDATE tenants SET state=$2 WHERE id=$1', [x.tenantId, state]);
  const owner = await x.referrals.status(x.owner.token, x.owner.membershipId);
  assert.deepEqual(owner.metrics, { visits: 1, registrations: 3, payingCustomers: 2, testPayingCustomers: 1,
    firstCommissionAt: new Date(x.now() - day).toISOString(), firstLiveCommissionAt: new Date(x.now()).toISOString(), activatedThisWeek: 1, mrr: null });
  const partner = await x.referrals.status(x.partner.token, x.joined.membershipId);
  assert.deepEqual(Object.keys(partner), ['metrics']); assert.equal(partner.metrics.registrations, 1); assert.equal(partner.metrics.payingCustomers, 1);
  x.advance(5 * day); // Monday in the next UTC week, while owner session remains active.
  assert.equal((await x.referrals.status(x.owner.token, x.owner.membershipId)).metrics.activatedThisWeek, 0);
});
