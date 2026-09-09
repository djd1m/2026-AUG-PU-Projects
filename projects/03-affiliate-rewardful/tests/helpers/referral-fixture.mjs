import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { fixture } from './core-fixture.mjs';
import { referralMigration } from '../../shared/referrals/schema.mjs';
import { createReferrals } from '../../shared/referrals/service.mjs';

export const day = 86400000;
export async function referralFixture(t) {
  let clock = Date.parse('2026-09-09T12:00:00.000Z');
  const f = await fixture(t, { clock: () => clock });
  const pool = new pg.Pool({ ...f.database, application_name: f.schema });
  t.after(() => pool.end()); await pool.query(referralMigration);
  const identity = f.app.identity, referrals = createReferrals({ pool, identity, now: () => clock });
  const ownerEmail = `${randomUUID()}@example.test`, partnerEmail = `${randomUUID()}@example.test`;
  const register = email => identity.register({ email, password: 'Referral fixture password 123!', name: 'Referral test' });
  const owner = await register(ownerEmail), partner = await register(partnerEmail);
  const tenantId = (await identity.me(owner.token)).memberships[0].tenantId;
  const invite = await identity.invite(owner.token, owner.membershipId, { role: 'partner' });
  const joined = await identity.acceptInvite(partner.token, { invitation: invite.invitation, name: 'Partner' });
  const publish = (windowDays = 30) => f.app.executeReal(owner.token, owner.membershipId, 'program.save',
    { kind: 'cash', bps: 2000, windowDays, holdDays: 7, recurring: true }, randomUUID());
  await publish();
  await f.app.executeReal(partner.token, joined.membershipId, 'enrollment.join', { consent: true }, randomUUID());
  await referrals.configure(owner.token, owner.membershipId,
    { landingUrl: 'https://merchant.example/signup?plan=starter', returnUrl: 'https://merchant.example/paid' });
  const key = await referrals.rotate(owner.token, owner.membershipId);
  const input = (extra = {}) => ({ customerId: randomUUID(), email: `${randomUUID()}@example.test`, emailVerified: true, ...extra });
  const visit = async () => {
    const location = new URL((await referrals.visit(joined.actorId)).location);
    return { token: location.searchParams.get('n3_ref'), expiresAt: location.searchParams.get('n3_ref_expires'), location };
  };
  return { f, pool, identity, referrals, owner, partner, joined, tenantId, ownerEmail, partnerEmail, key, publish, input, visit,
    now: () => clock, advance: ms => { clock += ms; }, setClock: ms => { clock = ms; } };
}
export async function lockWait(pool, name) {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'", [name]);
    if (result.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected transaction to wait for lock');
}
