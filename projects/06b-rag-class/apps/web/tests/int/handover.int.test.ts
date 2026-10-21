import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { afterAll, describe, expect, it } from 'vitest';
import { acceptHandover, createStudioClient, issueHandover, listCabinetBots, listCabinetSources,
  readCabinetContext, withTenant } from '@n6b/db';
import { createAcceptHandoverHandler, createIssueHandoverHandler, HANDOVER_EMAIL_TAKEN } from '@/server/handover-handler';
import { createBotHandler } from '@/server/bots-handler';
import { createSourceHandler, createJobHandler, createRetryHandler } from '@/server/jobs-handler';
import { createPublishHandler } from '@/server/publish-handler';
import { createAskHandler } from '@/server/ask-handler';
import { publicationEmbedCode } from '@/server/publish-handler';
import { constructGateway } from '../../../../packages/rag/src/paid-call';
import { AnswerFixtureProvider, LIMITS } from './answer-fixture';
import { ownerPool, servicePool, tenantPool, seedTenant, uniq } from '../../../../packages/db/tests/int/helpers';
import { BASE, post, seedActor, studioAuth } from './studio-fixture';
import { actualAuth, digest, fixture, material, observePool, snapshot } from './handover-fixture';

const owner = ownerPool(); const service = servicePool(); const tenant = tenantPool();
afterAll(async () => { await Promise.all([owner.end(), service.end(), tenant.end()]); });
const hasher = { hash: (p: string, cost: number) => bcrypt.hash(p, cost), compare: (p: string, h: string) => bcrypt.compare(p, h) };
function handler(pool = service) {
  const auth = actualAuth(service, hasher);
  return { auth, accept: createAcceptHandoverHandler({ servicePool: pool, publicBaseUrl: BASE, auth, hasher,
    reserve: async () => ({ ok: true }), visitorSecret: 'test', authLimitPerHour: 10, production: true, log: () => undefined }) };
}
async function dataSnapshot(childId: string) {
  const result: Record<string, unknown> = {};
  for (const table of ['bot', 'source', 'source_file', 'document', 'chunk', 'index_job', 'question_log', 'growth_event', 'model_call_log']) {
    result[table] = (await owner.query(`SELECT * FROM ${table} WHERE account_id = $1 ORDER BY id`, [childId])).rows;
  }
  return result;
}
describe('HAN-01/02 real PostgreSQL handover', () => {
  it('SC-US-014-1 own root studio only, 32-byte hash, repeated tokens and database seven-day TTL', async () => {
    const f = await fixture(owner, service);
    const before = (await owner.query('SELECT clock_timestamp() AS t')).rows[0].t as Date;
    const raw = randomBytes(32).toString('base64url');
    const result = await issueHandover(service, f.studio.accountId, f.childId, digest(raw));
    expect(typeof result).toBe('object');
    const after = (await owner.query('SELECT clock_timestamp() AS t')).rows[0].t as Date;
    const row = (await owner.query('SELECT * FROM handover_token WHERE token_hash = $1', [digest(raw)])).rows[0];
    expect(row.token_hash).not.toBe(raw); expect(row.token_hash).toHaveLength(64);
    expect(row.expires_at.getTime() - 7 * 86400000).toBeGreaterThanOrEqual(before.getTime());
    expect(row.expires_at.getTime() - 7 * 86400000).toBeLessThanOrEqual(after.getTime());
    expect((await snapshot(owner, f.childId)).tokens).toHaveLength(2);
    const foreign = await seedActor(owner, service); const ordinary = await seedActor(owner, service, 'owner');
    const nested = await seedActor(owner, service, 'studio', foreign.accountId);
    for (const actor of [foreign.accountId, ordinary.accountId, nested.accountId, f.childId]) {
      expect(await issueHandover(service, actor, f.childId, digest(randomBytes(32).toString('base64url')))).toBe('forbidden');
    }
    expect(await issueHandover(service, f.studio.accountId, 'bad', digest(raw))).toBe('forbidden');
    for (const sql of ['studio_access = false', 'studio_access = true, password_hash = \'already\'',
      'password_hash = NULL, email = \'partial@example.test\'', 'email = NULL, parent_account_id = NULL']) {
      await owner.query(`UPDATE account SET ${sql} WHERE id = $1`, [f.childId]);
      const beforeDenied = await snapshot(owner, f.childId);
      expect(await issueHandover(service, f.studio.accountId, f.childId, digest(randomBytes(32).toString('base64url')))).toBe('forbidden');
      expect(await snapshot(owner, f.childId)).toEqual(beforeDenied);
    }
  });
  it.each([false, true])('SC-US-014-2 credentials/session commit and real password login keep=%s', async (keep) => {
    const f = await fixture(owner, service); const h = handler();
    const email = `${uniq('client')}@example.test`; const password = 'long-client-password';
    const r = await h.accept(post(f.studio.token, { email, password, keep_studio_access: keep },
      { 'x-forwarded-for': '192.0.2.1' }), f.token);
    expect(r.status).toBe(200); const cookie = r.headers.get('set-cookie')!;
    const raw = cookie.split(';')[0]!.slice('n6b_session='.length);
    expect(await h.auth.authenticate(raw)).toBe(f.childId);
    const login = await h.auth.login(email, password); expect(login).not.toBeNull();
    expect(await h.auth.authenticate(login!)).toBe(f.childId);
    const a = (await snapshot(owner, f.childId)).account[0];
    expect(a).toMatchObject({ email, studio_access: keep, parent_account_id: keep ? f.studio.accountId : null });
    expect(await bcrypt.compare(password, a.password_hash)).toBe(true);
    expect(await bcrypt.compare('wrong', a.password_hash)).toBe(false);
    expect(cookie).toContain('HttpOnly; SameSite=Lax; Max-Age=604800; Secure');
  });
  it.each(['session', 'final-token'] as const)('HAN-02 forced %s failure rolls back real credentials and session writes', async (fault) => {
    const f = await fixture(owner, service); const before = await snapshot(owner, f.childId);
    const pool = observePool(service, { query: async (c, sql, args) => {
      if (fault === 'session' && sql.startsWith('INSERT INTO session')) throw new Error('test session fault');
      if (fault === 'final-token' && sql.startsWith('UPDATE handover_token')) return c.query(sql.replace('RETURNING id', 'AND false RETURNING id'), args);
      return c.query(sql, args);
    } });
    const h = handler(pool); const r = await h.accept(post(f.studio.token, { email: f.input.email, password: 'long-password',
      keep_studio_access: false }, { 'x-forwarded-for': '192.0.2.1' }), f.token);
    expect(r.status).toBe(fault === 'session' ? 503 : 410); expect(r.headers.get('set-cookie')).toBeNull();
    expect(await snapshot(owner, f.childId)).toEqual(before);
  });
  it('HAN-02 session unique violation is 503 and never email409', async () => {
    const f = await fixture(owner, service);
    await owner.query('INSERT INTO session(account_id,token_hash,expires_at) VALUES($1,$2,$3)',
      [f.studio.accountId, f.input.session.tokenHash, f.input.session.expiresAt]);
    const before = await snapshot(owner, f.childId);
    await expect(acceptHandover(service, f.input)).rejects.toMatchObject({ code: '23505', constraint: 'session_token_hash_key' });
    expect(await snapshot(owner, f.childId)).toEqual(before);
  });
  it('SC-US-014-3 unknown/expired/used tokens do not change state', async () => {
    const f = await fixture(owner, service);
    expect(await acceptHandover(service, material())).toBe('missing');
    for (const sql of ["expires_at = clock_timestamp() - interval '1 second'", "expires_at = clock_timestamp() + interval '7 days', used_at = clock_timestamp()"] ) {
      await owner.query(`UPDATE handover_token SET ${sql} WHERE token_hash = $1`, [f.input.tokenHash]);
      const before = await snapshot(owner, f.childId); expect(await acceptHandover(service, f.input)).toBe('gone');
      expect(await snapshot(owner, f.childId)).toEqual(before);
    }
  });
  it('HAN-04 claimed-keep-access guard blocks second-token reset and reissue', async () => {
    const f = await fixture(owner, service); f.input.keepStudioAccess = true;
    const second = material(); expect(await issueHandover(service, f.studio.accountId, f.childId, second.tokenHash)).not.toBe('forbidden');
    expect(await acceptHandover(service, f.input)).toEqual({ accountId: f.childId });
    const before = await snapshot(owner, f.childId);
    expect(await acceptHandover(service, second)).toBe('gone');
    expect(await issueHandover(service, f.studio.accountId, f.childId, material().tokenHash)).toBe('forbidden');
    expect(await snapshot(owner, f.childId)).toEqual(before);
  });
  it('SC-US-014-4 duplicate normalized email returns exact409, token survives retry', async () => {
    const f = await fixture(owner, service); const existing = await seedActor(owner, service, 'owner');
    const email = (await owner.query('SELECT email FROM account WHERE id=$1', [existing.accountId])).rows[0].email;
    const before = await snapshot(owner, f.childId); const h = handler();
    const r = await h.accept(post(f.studio.token, { email: ` ${email.toUpperCase()} `, password: 'long-password',
      keep_studio_access: false }, { 'x-forwarded-for': '192.0.2.1' }), f.token);
    expect(r.status).toBe(409); expect((await r.json()).error.message).toBe(HANDOVER_EMAIL_TAKEN);
    expect(r.headers.get('set-cookie')).toBeNull(); expect(await snapshot(owner, f.childId)).toEqual(before);
    expect(await acceptHandover(service, f.input)).toEqual({ accountId: f.childId });
  });
});

describe('HAN-03 ownership and RLS preserve all child rows', () => {
  it.each([false, true])('SC-US-014-2 real handover preserves IDs/data/publication and access keep=%s', async (keep) => {
    const studio = await seedActor(owner, service); const foreign = await seedActor(owner, service);
    const sibling = await seedActor(owner, service, 'owner', studio.accountId);
    const full = await seedTenant(owner, { parent: studio.accountId, studioAccess: true, email: null });
    await owner.query('UPDATE account SET password_hash = NULL WHERE id = $1', [full.accountId]);
    await owner.query("UPDATE bot SET published=true, contact='client@example.test', demo_enabled=true, demo_slug=$2, allowed_origins=ARRAY['https://client.example.test'] WHERE id=$1", [full.botId, randomBytes(16).toString('hex')]);
    const beforeData = await dataSnapshot(full.accountId);
    const originalBot = (await listCabinetBots(tenant, studio.accountId, full.accountId))[0]!;
    const embed = publicationEmbedCode(originalBot, BASE);
    expect(embed).toContain(originalBot.public_id);
    expect(originalBot.demo_slug).not.toBeNull();
    const raw = randomBytes(32).toString('base64url'); const input = material(undefined, keep, raw);
    expect(await issueHandover(service, studio.accountId, full.accountId, input.tokenHash)).not.toBe('forbidden');
    expect(await acceptHandover(service, input)).toEqual({ accountId: full.accountId });
    expect(await dataSnapshot(full.accountId)).toEqual(beforeData);
    const bot = (await listCabinetBots(tenant, full.accountId, full.accountId))[0]!;
    expect(bot.id).toBe(full.botId); expect(publicationEmbedCode(bot, BASE)).toBe(embed);
    expect((await listCabinetSources(tenant, full.accountId, full.accountId)).length).toBeGreaterThan(0);
    expect((await readCabinetContext(tenant, full.accountId))?.actor.id).toBe(full.accountId);
    expect(await readCabinetContext(tenant, full.accountId, studio.accountId)).toBeNull();
    for (const actor of [foreign, sibling]) expect(await readCabinetContext(tenant, actor.accountId, full.accountId)).toBeNull();
    if (keep) {
      expect((await readCabinetContext(tenant, studio.accountId, full.accountId))?.selected.id).toBe(full.accountId);
      expect((await listCabinetBots(tenant, studio.accountId, full.accountId))[0]?.id).toBe(full.botId);
    } else {
      const auth = studioAuth(service); const provider = new AnswerFixtureProvider();
      const deps = { tenantPool: tenant, servicePool: service, publicBaseUrl: BASE,
        authenticate: (t: string) => auth.authenticate(t), resolver: async () => [{ address: '93.184.216.34', family: 4 }] };
      expect(await readCabinetContext(tenant, studio.accountId, full.accountId)).toBeNull();
      expect(await listCabinetBots(tenant, studio.accountId, full.accountId)).toEqual([]);
      expect(await listCabinetSources(tenant, studio.accountId, full.accountId)).toEqual([]);
      expect((await createBotHandler(deps)(post(studio.token, { name: 'denied', account_id: full.accountId }))).status).toBe(404);
      expect((await createSourceHandler(deps)(post(studio.token, { url: 'https://example.test/new' }), full.botId)).status).toBe(404);
      const form = new FormData(); form.append('file', new Blob(['%PDF-1.7\n']), 'Client.pdf');
      expect((await createSourceHandler(deps)(new Request(BASE, { method: 'POST', headers: { origin: BASE,
        cookie: `n6b_session=${studio.token}` }, body: form }), full.botId)).status).toBe(404);
      expect((await createJobHandler(deps)(new Request(BASE, { headers: { cookie: `n6b_session=${studio.token}` } }), full.jobId)).status).toBe(404);
      expect((await createRetryHandler(deps)(post(studio.token), full.jobId)).status).toBe(404);
      expect((await createPublishHandler(deps)(post(studio.token, { contact: 'c@example.test', allowed_origins: [] }), full.botId)).status).toBe(404);
      expect((await createAskHandler({ ...deps, minSimilarity: 0.7,
        gateway: constructGateway({ pool: service, provider, limits: LIMITS }) })(post(studio.token, { question: 'Denied?' }), full.botId)).status).toBe(404);
      expect(provider.total).toBe(0); expect(await dataSnapshot(full.accountId)).toEqual(beforeData);
    }
    const tables = await withTenant(tenant, full.accountId, (c) => c.query('SELECT id FROM chunk WHERE account_id = $1', [full.accountId]));
    expect(tables.rows.map((r) => r.id)).toContain(full.chunkId);
  });
});
