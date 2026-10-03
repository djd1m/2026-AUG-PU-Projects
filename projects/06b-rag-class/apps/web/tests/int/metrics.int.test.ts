import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { acquireMetricBatch, isMetricOperator, readWeeklyMetrics, type MetricBatch, type Pool } from '@n6b/db';
import { ownerPool, servicePool, uniq } from '../../../../packages/db/tests/int/helpers';
import { AuthService } from '@/server/auth';
import { PgAuthStore } from '@/server/auth-store';
import { createMetricVerifyHandler } from '@/server/metrics-handler';
import { metricInstallEligible, metricSummary, verifyMetricBatch } from '@/server/metrics-verifier';

const BASE = 'https://widget.example';
let owner: Pool, service: Pool, auth: AuthService, actor: string, token: string;
let accounts: string[] = [], bots: string[] = [], leases: MetricBatch[] = [];
let prefix: string;
const callbacks: Array<() => Promise<void>> = [];

async function account(isTest = false, operator = false) {
  const id = (await owner.query<{ id: string }>(`INSERT INTO account (email, is_test)
    VALUES ($1, $2) RETURNING id`, [`${uniq('metric')}@example.test`, isTest])).rows[0]!.id;
  accounts.push(id);
  if (operator) await owner.query('INSERT INTO operator (account_id) VALUES ($1)', [id]);
  return id;
}
async function bot(accountId: string) {
  const publicId = randomBytes(9).toString('base64url');
  const id = (await owner.query<{ id: string }>(`INSERT INTO bot (account_id, public_id, name)
    VALUES ($1, $2, 'metric bot') RETURNING id`, [accountId, publicId])).rows[0]!.id;
  bots.push(id);
  return { id, publicId, accountId };
}
async function install(b: Awaited<ReturnType<typeof bot>>, rank: number, options: {
  host?: string; page?: string; verified?: boolean; question?: boolean;
} = {}) {
  const id = `${prefix}${String(rank).padStart(12, '0')}`;
  const host = options.host ?? 'shop.example';
  await owner.query(`INSERT INTO widget_install
    (id, bot_id, origin_host, page_url, config_seen_at, first_question_at, page_verified_at)
    VALUES ($1, $2, $3, $4, '2020-01-01', $5::timestamptz, $6::timestamptz)`,
  [id, b.id, host, options.page ?? `https://www.${host}/contact`, options.question === false ? null : '2020-01-02',
    options.verified ? '2020-01-03' : null]);
  return id;
}
const eligible = (row: Parameters<typeof metricInstallEligible>[0]) => metricInstallEligible(row, BASE);
async function batch(afterId: string | null = null) {
  const result = await acquireMetricBatch(service, actor, afterId, eligible);
  if (result.kind !== 'ready') throw new Error(`expected acquired lease, got ${result.kind}`);
  leases.push(result.batch);
  return result.batch;
}
async function summary() {
  const data = await readWeeklyMetrics(service, actor);
  if (!data) throw new Error('operator rejected');
  return metricSummary(data.installs, data.totals, BASE);
}
function script(publicId: string) {
  return { status: 200, headers: { 'content-type': 'text/html' },
    body: `<script src="${BASE}/w.js" data-bot="${publicId}"></script>` };
}
function request(session = token, origin = BASE, cursor = '') {
  return new Request(`${BASE}/admin/metrics/verify`, { method: 'POST', headers: { origin,
    cookie: `n6b_session=${session}${cursor ? `; ${cursor}` : ''}` }, body: JSON.stringify({ account_id: actor, operator: true }) });
}
function handler(fetchPage = vi.fn(async () => script('WrongBot1234'))) {
  return createMetricVerifyHandler({ servicePool: service, publicBaseUrl: BASE, cursorSecret: 'metric-test-secret',
    authenticate: (t) => auth.authenticate(t), after: (cb) => callbacks.push(cb), fetchPage, log: () => undefined });
}

beforeAll(() => {
  owner = ownerPool(); service = servicePool();
  auth = new AuthService(new PgAuthStore(service), { hash: async () => { throw new Error('unused'); },
    compare: async () => { throw new Error('unused'); } }, 'metric-test-secret');
});
beforeEach(async () => {
  accounts = []; bots = []; leases = []; callbacks.length = 0;
  prefix = `00000000-0000-0000-${randomBytes(2).toString('hex')}-`;
  actor = await account(false, true);
  token = randomBytes(32).toString('base64url');
  await owner.query('INSERT INTO session (account_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'1 day\')',
    [actor, auth.tokenHash(token)]);
});
afterEach(async () => {
  for (const pending of leases) await pending.finish(false);
  // All callbacks are consumed in each test; no naked work survives fixture cleanup.
  await owner.query('DELETE FROM operator WHERE account_id = ANY($1::uuid[])', [accounts]);
  await owner.query('UPDATE account SET referred_by_bot_id = NULL WHERE id = ANY($1::uuid[])', [accounts]);
  await owner.query('DELETE FROM widget_install WHERE bot_id = ANY($1::uuid[])', [bots]);
  await owner.query('DELETE FROM badge_event WHERE bot_id = ANY($1::uuid[])', [bots]);
  await owner.query('DELETE FROM bot WHERE id = ANY($1::uuid[])', [bots]);
  await owner.query('DELETE FROM account WHERE id = ANY($1::uuid[])', [accounts]);
});
afterAll(async () => { await Promise.all([owner.end(), service.end()]); });

describe('MET-01/02 SC-US-015-3: real PostgreSQL canonical metrics', () => {
  it('existing operator/session gates reject anonymous, ordinary, expired, revoked and forged body authority', async () => {
    const plain = await account();
    const plainToken = randomBytes(32).toString('base64url');
    await owner.query('INSERT INTO session (account_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'1 day\')',
      [plain, auth.tokenHash(plainToken)]);
    const fetchPage = vi.fn(async () => script('WrongBot1234'));
    const post = handler(fetchPage);
    expect((await post(request(''))).status).toBe(404);
    expect((await post(request(plainToken))).status).toBe(404);
    expect(await readWeeklyMetrics(service, plain)).toBeNull();
    expect((await post(request(token, 'https://foreign.example'))).status).toBe(403);
    await owner.query("UPDATE session SET expires_at = now() - interval '1 second' WHERE account_id = $1", [actor]);
    expect((await post(request())).status).toBe(404);
    await owner.query("UPDATE session SET expires_at = now() + interval '1 day' WHERE account_id = $1", [actor]);
    await owner.query('DELETE FROM operator WHERE account_id = $1', [actor]);
    expect(await isMetricOperator(service, actor)).toBe(false);
    expect((await post(request())).status).toBe(404);
    expect(fetchPage).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(0);
  });
  it('counts two bots on one normalized host, excludes test/operator/excluded/no-question; separate badge/signup totals are cumulative', async () => {
    const before = await summary();
    const first = await bot(await account());
    const second = await bot(first.accountId);
    await install(first, 1, { verified: true });
    await install(second, 2);
    await install(first, 3, { host: 'unused.example', question: false, verified: true });
    await install(await bot(await account(true)), 4, { verified: true });
    await install(await bot(actor), 5, { verified: true });
    let rank = 6;
    for (const host of ['widget.example', 'localhost', '127.0.0.1', 'internal.local', 'x.vercel.app', 'x.netlify.app',
      'x.github.io', 'x.tilda.ws', 'x.pages.dev']) await install(first, rank++, { host, verified: true, page: `https://${host}/` });
    await install(first, rank, { host: 'mismatch.example', page: 'https://other.example/', verified: true });
    await owner.query(`INSERT INTO badge_event (bot_id, kind, visitor_key, day, created_at)
      VALUES ($1, 'impression', NULL, '2020-01-01', '2020-01-01'),
        ($1, 'impression', NULL, '2020-01-01', '2020-01-01'),
        ($1, 'click', 'metric-click', '2020-01-01', '2020-01-01'),
        ($1, 'tamper', NULL, '2020-01-01', '2020-01-01')`, [first.id]);
    const signup = await account(true); // Canonical referral totals do not share install eligibility.
    await owner.query('UPDATE account SET referred_by_bot_id = $2, created_at = \'2020-01-01\' WHERE id = $1', [signup, first.id]);
    const after = await summary();
    expect(after.raw - before.raw).toBe(2);
    expect(after.verified - before.verified).toBe(1);
    expect(after.impressions - before.impressions).toBe(2);
    expect(after.clicks - before.clicks).toBe(1);
    expect(after.signups - before.signups).toBe(1);
    expect(after.conversion).toBe(after.signups / after.clicks * 100);
    await owner.query('UPDATE account SET is_test = true WHERE id = $1', [first.accountId]);
    expect((await summary()).raw).toBe(before.raw);
  });
  it('real PG count deltas give zero/no data and exact n=29/30 threshold without inventing K', async () => {
    // Use count deltas because other integration files share this disposable database.
    const b = await bot(await account());
    const before = await summary();
    const initial = await summary();
    expect(metricSummary([], { impressions: initial.impressions - before.impressions,
      clicks: initial.clicks - before.clicks, signups: initial.signups - before.signups }, BASE))
      .toMatchObject({ raw: 0, verified: 0, conversion: null, sampleWarning: 'n < 30, K не считается' });
    const referrals: string[] = [];
    for (let i = 0; i < 30; i++) referrals.push(await account());
    await owner.query('UPDATE account SET referred_by_bot_id = $2 WHERE id = ANY($1::uuid[])', [referrals.slice(0, 29), b.id]);
    const at29 = await summary();
    expect(at29.signups - before.signups).toBe(29);
    expect(metricSummary([], { ...at29, signups: at29.signups - before.signups, clicks: 0 }, BASE))
      .toMatchObject({ raw: 0, verified: 0, conversion: null, sampleWarning: 'n < 30, K не считается' });
    await owner.query('UPDATE account SET referred_by_bot_id = $2 WHERE id = $1', [referrals[29], b.id]);
    const at30 = await summary();
    expect(at30.signups - before.signups).toBe(30);
    expect(metricSummary([], { ...at30, signups: at30.signups - before.signups, clicks: 0 }, BASE).sampleWarning).toBeNull();
  });
});

describe('MET-04 real shared lease, cursor and conditional write races', () => {
  it('holds the lease before 202 and across callbacks, concurrent requests do not duplicate fetch; rollback releases', async () => {
    const b = await bot(await account());
    const id = await install(b, 1);
    const fetchPage = vi.fn(async (_url: string) => script(b.publicId));
    const post = handler(fetchPage);
    const accepted = await post(request());
    expect(accepted.status).toBe(202);
    expect(fetchPage).not.toHaveBeenCalled();
    const responses = await Promise.all(Array.from({ length: 8 }, () => post(request())));
    expect(responses.every((r) => r.status === 409)).toBe(true);
    expect(responses.every((r) => !r.headers.has('set-cookie'))).toBe(true);
    expect(callbacks).toHaveLength(1);
    await callbacks[0]!();
    expect(fetchPage.mock.calls.filter(([url]) => url === 'https://www.shop.example/contact')).toHaveLength(1);
    expect((await owner.query('SELECT page_verified_at FROM widget_install WHERE id = $1', [id])).rows[0].page_verified_at).not.toBeNull();
    const next = await batch();
    await next.finish(false);
    const reacquired = await batch();
    await reacquired.finish(false);
  });
  it('signed server cursor advances past failed first five; pending rows survive a fresh handler/restart and reset round', async () => {
    const b = await bot(await account());
    const ids = [];
    for (let rank = 1; rank <= 6; rank++) ids.push(await install(b, rank, { host: `site${rank}.example` }));
    const fetched: string[] = [];
    const fetchPage = vi.fn(async (url: string) => {
      fetched.push(url);
      return url.includes('site6.') ? script(b.publicId) : script('WrongBot1234');
    });
    const first = await handler(fetchPage)(request());
    expect((await first.json()).data.selected).toBe(5);
    await callbacks.shift()!();
    expect(fetched).toHaveLength(5);
    const cookie = first.headers.get('set-cookie')!.split(';')[0]!;
    const second = await handler(fetchPage)(request(token, BASE, cookie));
    expect(second.status).toBe(202);
    await callbacks.shift()!();
    expect(fetched.some((url) => url.includes('site6.'))).toBe(true);
    const records = (await owner.query('SELECT id, page_verified_at FROM widget_install WHERE id = ANY($1::uuid[]) ORDER BY id', [ids])).rows;
    expect(records.slice(0, 5).every((r) => r.page_verified_at === null)).toBe(true);
    expect(records[5].page_verified_at).not.toBeNull();
    // A fresh process with no cursor rediscovers failed pending rows.
    const restarted = await handler(fetchPage)(request());
    expect(restarted.status).toBe(202);
    await callbacks.shift()!();
    expect(fetched.filter((url) => url.includes('site1.'))).toHaveLength(2);
    const final = await batch('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(final.rows).toHaveLength(0);
    expect(final.nextId).toBeNull();
    await final.finish(true);
  });
  it.each(['page', 'public-id', 'host', 'config', 'question', 'test', 'owner-operator', 'actor-revoked'])(
    'does not count stale verification after concurrent %s change', async (change) => {
      const b = await bot(await account());
      const id = await install(b, 1);
      const leased = await batch();
      expect(leased.rows[0]?.id).toBe(id);
      const fetchPage = vi.fn(async () => {
        if (change === 'page') await owner.query('UPDATE widget_install SET page_url = \'https://changed.example/\' WHERE id = $1', [id]);
        if (change === 'public-id') await owner.query('UPDATE bot SET public_id = $2 WHERE id = $1', [b.id, randomBytes(9).toString('base64url')]);
        if (change === 'host') await owner.query('UPDATE widget_install SET origin_host = \'changed.example\' WHERE id = $1', [id]);
        if (change === 'config') await owner.query("UPDATE widget_install SET config_seen_at = '2020-02-01' WHERE id = $1", [id]);
        if (change === 'question') await owner.query('UPDATE widget_install SET first_question_at = NULL WHERE id = $1', [id]);
        if (change === 'test') await owner.query('UPDATE account SET is_test = true WHERE id = $1', [b.accountId]);
        if (change === 'owner-operator') await owner.query('INSERT INTO operator (account_id) VALUES ($1)', [b.accountId]);
        if (change === 'actor-revoked') await owner.query('DELETE FROM operator WHERE account_id = $1', [actor]);
        return script(b.publicId);
      });
      await verifyMetricBatch(leased, BASE, async () => true, fetchPage);
      expect((await owner.query('SELECT page_verified_at FROM widget_install WHERE id = $1', [id])).rows[0].page_verified_at).toBeNull();
    });
  it('callback rechecks revoked operator and session before any outbound request', async () => {
    const b = await bot(await account());
    await install(b, 1);
    const fetchPage = vi.fn(async () => script(b.publicId));
    expect((await handler(fetchPage)(request())).status).toBe(202);
    await owner.query('DELETE FROM operator WHERE account_id = $1', [actor]);
    await callbacks.shift()!();
    expect(fetchPage).not.toHaveBeenCalled();
    await owner.query('INSERT INTO operator (account_id) VALUES ($1)', [actor]);
    expect((await handler(fetchPage)(request())).status).toBe(202);
    await owner.query('DELETE FROM session WHERE account_id = $1', [actor]);
    await callbacks.shift()!();
    expect(fetchPage).not.toHaveBeenCalled();
  });
  it('conditional success preserves an existing timestamp and rollback does not leak marks or lease', async () => {
    const b = await bot(await account());
    const id = await install(b, 1);
    const leased = await batch();
    const selected = leased.rows.find((r) => r.id === id)!;
    expect(await leased.markVerified(selected)).toBe(true);
    expect(await leased.markVerified(selected)).toBe(false);
    await leased.finish(false);
    expect((await owner.query('SELECT page_verified_at FROM widget_install WHERE id = $1', [id])).rows[0].page_verified_at).toBeNull();
    const retry = await batch();
    await owner.query("UPDATE widget_install SET page_verified_at = '2020-03-01' WHERE id = $1", [id]);
    expect(await retry.markVerified(retry.rows.find((r) => r.id === id)!)).toBe(false);
    await retry.finish(true);
    expect((await owner.query('SELECT page_verified_at::text AS stamp FROM widget_install WHERE id = $1', [id])).rows[0].stamp)
      .toContain('2020-03-01');
  });
});
