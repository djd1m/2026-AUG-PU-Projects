import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { moscowDay, recordBadgeRemovalIntent, recordReferralClick, reserveQuotaNow, resolveReferralBot, visitorKey, withService } from '@n6b/db';
import { PgAuthStore } from '@/server/auth-store';
import { AuthService } from '@/server/auth';
import { createAuthHandler, readSessionCookie } from '@/server/auth-handler';
import { createBadgeRemovalHandler, createReferralClickHandler } from '@/server/referral-handler';
import { badgeRequired } from '@/server/widget-policy';
import { ownerPool, runDate, servicePool, uniq } from '../../../../packages/db/tests/int/helpers';

const owner = ownerPool();
const service = servicePool(10);
const store = new PgAuthStore(service);
const BASE = 'https://referral.example';
const SECRET = 'referral-test-secret';
const auth = new AuthService(store, { hash: async () => 'test-hash', compare: async () => true }, 'session-test-secret');
afterAll(async () => { await owner.end(); await service.end(); });

async function seed(kind: 'owner' | 'studio' = 'owner', parent: string | null = null) {
  const accountId = (await owner.query<{ id: string }>(`INSERT INTO account (email, kind, parent_account_id)
    VALUES ($1, $2, $3) RETURNING id`, [`${uniq('ref')}@example.test`, kind, parent])).rows[0]!.id;
  const publicId = randomBytes(9).toString('base64url');
  const botId = (await owner.query<{ id: string }>(`INSERT INTO bot (account_id, public_id, name)
    VALUES ($1, $2, 'referral bot') RETURNING id`, [accountId, publicId])).rows[0]!.id;
  return { accountId, publicId, botId };
}
const session = () => ({ tokenHash: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 86400000) });
const email = () => `${uniq('signup')}@example.test`;

describe('REF-01 SC-US-011-1: actual PostgreSQL click uniqueness', () => {
  it('20 concurrent clicks on an unpublished bot produce exactly one HMAC click; Moscow day rolls over', async () => {
    const bot = await seed();
    const at = runDate(0, 20, 59);
    const handler = createReferralClickHandler({ servicePool: service, publicBaseUrl: BASE,
      visitorSecret: SECRET, now: () => at });
    const responses = await Promise.all(Array.from({ length: 20 }, () => handler(new Request(`${BASE}/r/b/${bot.publicId}`,
      { headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' } }), bot.publicId)));
    expect(responses.every((r) => r.status === 302 && r.headers.get('location') ===
      `${BASE}/?ref=${bot.publicId}&utm_source=badge`)).toBe(true);
    const rows = (await owner.query('SELECT visitor_key, day::text FROM badge_event WHERE bot_id = $1', [bot.botId])).rows;
    expect(rows).toEqual([{ visitor_key: visitorKey(SECRET, '203.0.113.9', bot.botId), day: moscowDay(at) }]);
    expect(JSON.stringify(rows)).not.toContain('203.0.113');
    // Same /24 is the same visitor. A new Moscow day and a different prefix each get their own row.
    await recordReferralClick(service, bot.publicId, SECRET, '203.0.113.99', at);
    await recordReferralClick(service, bot.publicId, SECRET, '203.0.113.9', new Date(at.getTime() + 60000));
    await recordReferralClick(service, bot.publicId, SECRET, '203.0.114.9', at);
    expect((await owner.query('SELECT count(*)::int AS n FROM badge_event WHERE bot_id = $1', [bot.botId])).rows[0].n).toBe(3);
  });
  it('missing trusted IP and unknown IDs never invent a click', async () => {
    const bot = await seed();
    const handler = createReferralClickHandler({ servicePool: service, publicBaseUrl: BASE, visitorSecret: SECRET });
    const known = await handler(new Request(BASE), bot.publicId);
    expect(known.status).toBe(302);
    expect(known.headers.get('location')).toContain(`ref=${bot.publicId}`);
    const unknown = await handler(new Request(BASE), randomBytes(9).toString('base64url'));
    expect(unknown.headers.get('location')).toBe(`${BASE}/`);
    expect((await owner.query('SELECT count(*)::int AS n FROM badge_event WHERE bot_id = $1', [bot.botId])).rows[0].n).toBe(0);
  });
});

describe('REF-03 SC-US-011-1: account, attribution and session form one transaction', () => {
  it('HTTP registration uses cookie, ignores body/family IDs; login preserves attribution and duplicate email creates no session', async () => {
    const bot = await seed();
    const other = await seed();
    const signupEmail = email();
    const ip = Array.from(randomBytes(4)).join('.');
    const deps = { auth, publicBaseUrl: BASE, visitorSecret: SECRET, authLimitPerHour: 10, production: true,
      now: () => runDate(2), reserve: (keys: Parameters<typeof reserveQuotaNow>[1]) => reserveQuotaNow(service, keys) };
    const request = (ref: string) => new Request(BASE, { method: 'POST', headers: { origin: BASE,
      'x-forwarded-for': ip, 'content-type': 'application/json', cookie: `n6b_ref=${ref}` },
      body: JSON.stringify({ email: signupEmail, password: 'correct horse 1', ref: other.publicId,
        actingStudioId: bot.accountId, referred_by_bot_id: other.botId }) });
    const registered = await createAuthHandler('register', deps)(request(bot.publicId));
    expect(registered.status).toBe(201);
    const token = readSessionCookie(new Request(BASE, { headers: { cookie: registered.headers.get('set-cookie')! } }))!;
    const accountId = await auth.authenticate(token);
    expect(accountId).not.toBeNull();
    expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE id = $1', [accountId])).rows[0].referred_by_bot_id)
      .toBe(bot.botId);
    expect((await createAuthHandler('register', deps)(request(other.publicId))).status).toBe(409);
    expect((await owner.query('SELECT count(*)::int AS n FROM session WHERE account_id = $1', [accountId])).rows[0].n).toBe(1);
    expect((await createAuthHandler('login', deps)(request(other.publicId))).status).toBe(200);
    expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE id = $1', [accountId])).rows[0].referred_by_bot_id)
      .toBe(bot.botId);
  });
  it('unknown, missing and previously deleted bots permit ordinary signup without invalid FKs', async () => {
    const deleted = await seed();
    await owner.query('DELETE FROM bot WHERE id = $1', [deleted.botId]);
    for (const ref of [null, randomBytes(9).toString('base64url'), deleted.publicId, 'invalid']) {
      const signupEmail = email();
      expect(await store.register(signupEmail, 'hash', 'owner', session(), ref)).toBe(true);
      expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE email = $1', [signupEmail]))
        .rows[0].referred_by_bot_id).toBeNull();
    }
  });
  it('a failed session insert rolls back the account and its attribution', async () => {
    const bot = await seed();
    const duplicate = session();
    expect(await store.register(email(), 'hash', 'owner', duplicate, bot.publicId)).toBe(true);
    const failedEmail = email();
    await expect(store.register(failedEmail, 'hash', 'owner', duplicate, bot.publicId)).rejects.toMatchObject({ code: '23505' });
    expect((await owner.query('SELECT id FROM account WHERE email = $1', [failedEmail])).rows).toHaveLength(0);
    expect((await owner.query('SELECT count(*)::int AS n FROM session WHERE token_hash = $1', [duplicate.tokenHash])).rows[0].n)
      .toBe(1);
  });
  it('20 concurrent registrations of one email create one attributed account and one session', async () => {
    const bot = await seed();
    const signupEmail = email();
    const created = await Promise.all(Array.from({ length: 20 }, () =>
      store.register(signupEmail, 'hash', 'owner', session(), bot.publicId)));
    expect(created.filter(Boolean)).toHaveLength(1);
    const accounts = (await owner.query('SELECT id, referred_by_bot_id FROM account WHERE email = $1', [signupEmail])).rows;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].referred_by_bot_id).toBe(bot.botId);
    expect((await owner.query('SELECT count(*)::int AS n FROM session WHERE account_id = $1', [accounts[0].id])).rows[0].n).toBe(1);
  });
  it('source resolution holds a bot lock until the account/session transaction finishes', async () => {
    const bot = await seed();
    const client = await service.connect();
    const deleter = await owner.connect();
    try {
      await client.query('BEGIN'); await client.query('SET LOCAL ROLE n6b_service');
      expect(await resolveReferralBot(client, bot.publicId)).toBe(bot.botId);
      await deleter.query('BEGIN'); await deleter.query("SET LOCAL lock_timeout = '200ms'");
      await expect(deleter.query('DELETE FROM bot WHERE id = $1', [bot.botId])).rejects.toMatchObject({ code: '55P03' });
      await deleter.query('ROLLBACK');
      await client.query('ROLLBACK');
      await owner.query('DELETE FROM bot WHERE id = $1', [bot.botId]);
      expect(await store.register(email(), 'hash', 'owner', session(), bot.publicId)).toBe(true);
    } finally { await client.query('ROLLBACK'); await deleter.query('ROLLBACK'); client.release(); deleter.release(); }
  });
});

describe('REF-04 SC-US-011-2: DB contract for future F13 trusted studio wiring', () => {
  it('studio and direct child excluded even without studio_access; unrelated studio/child and standalone allowed', async () => {
    const studio = await seed('studio');
    const child = await seed('owner', studio.accountId);
    const otherStudio = await seed('studio');
    const otherChild = await seed('owner', otherStudio.accountId);
    for (const [source, expected] of [[studio, null], [child, null], [otherStudio, otherStudio.botId],
      [otherChild, otherChild.botId]] as const) {
      const createdEmail = email();
      await withService(service, async (c) => {
        const resolved = await resolveReferralBot(c, source.publicId, studio.accountId);
        expect(resolved).toBe(expected);
        await c.query(`INSERT INTO account (email, parent_account_id, referred_by_bot_id, studio_access)
          VALUES ($1, $2, $3, true)`, [createdEmail, studio.accountId, resolved]);
      });
      expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE email = $1', [createdEmail]))
        .rows[0].referred_by_bot_id).toBe(expected);
    }
    const standalone = email();
    expect(await store.register(standalone, 'hash', 'studio', session(), studio.publicId)).toBe(true);
    expect((await owner.query('SELECT referred_by_bot_id FROM account WHERE email = $1', [standalone]))
      .rows[0].referred_by_bot_id).toBe(studio.botId);
  });
});

describe('REF-05 SC-US-010-1: real PG intent concurrency and Moscow day', () => {
  it('20 concurrent authenticated requests record one intent; client account ignored, plan/removal/badge unchanged', async () => {
    const account = await seed();
    const other = await seed();
    const at = runDate(1, 20, 59);
    const token = randomBytes(32).toString('base64url');
    await store.createSession(account.accountId, { tokenHash: auth.tokenHash(token), expiresAt: session().expiresAt });
    const handler = createBadgeRemovalHandler({ servicePool: service, publicBaseUrl: BASE,
      now: () => at, authenticate: (value) => auth.authenticate(value) });
    const responses = await Promise.all(Array.from({ length: 20 }, () => handler(new Request(BASE, { method: 'POST',
      headers: { origin: BASE, cookie: `n6b_session=${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ account_id: other.accountId, plan: 'studio', badge_removal: 'active' }) }))));
    expect(responses.every((r) => r.status === 200)).toBe(true);
    const bodies = await Promise.all(responses.map((r) => r.json()));
    expect(bodies.filter((b) => b.data.recorded)).toHaveLength(1);
    expect((await owner.query("SELECT count(*)::int AS n FROM growth_event WHERE account_id = $1 AND kind = 'badge_removal_intent'",
      [account.accountId])).rows[0].n).toBe(1);
    const settings = (await owner.query('SELECT plan, badge_removal FROM account WHERE id = $1', [account.accountId])).rows[0];
    expect(settings).toEqual({ plan: 'free', badge_removal: 'none' });
    expect(badgeRequired(settings.plan, settings.badge_removal)).toBe(true);
    expect((await owner.query('SELECT id FROM growth_event WHERE account_id = $1', [other.accountId])).rows).toHaveLength(0);
    expect(await recordBadgeRemovalIntent(service, account.accountId, at)).toBe(false);
    expect(await recordBadgeRemovalIntent(service, account.accountId, new Date(at.getTime() + 60000))).toBe(true);
    expect((await owner.query("SELECT count(*)::int AS n FROM growth_event WHERE account_id = $1 AND kind = 'badge_removal_intent'",
      [account.accountId])).rows[0].n).toBe(2);
  });
});
