import { randomBytes, createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from '@n6b/db';
import { createAcceptHandoverHandler, createIssueHandoverHandler, HANDOVER_EMAIL_TAKEN } from '@/server/handover-handler';

const mocks = vi.hoisted(() => ({ issue: vi.fn(), accept: vi.fn(), authenticate: vi.fn(), hash: vi.fn(), reserve: vi.fn(), log: vi.fn() }));
vi.mock('@n6b/db', async (original) => ({ ...await original<object>(), issueHandover: mocks.issue, acceptHandover: mocks.accept }));
const BASE = 'https://studio.example.test';
const ID = '22222222-2222-2222-2222-222222222222';
const token = randomBytes(32).toString('base64url');
const pool = {} as Pool;
const prepared = { token: 's'.repeat(43), record: { tokenHash: 'session-hmac', expiresAt: new Date('2030-01-01') } };
const prepareSession = vi.fn(() => prepared);
const issue = createIssueHandoverHandler({ servicePool: pool, publicBaseUrl: BASE, authenticate: mocks.authenticate });
const accept = createAcceptHandoverHandler({ servicePool: pool, publicBaseUrl: BASE,
  auth: { prepareSession }, hasher: { hash: mocks.hash, compare: vi.fn() }, reserve: mocks.reserve,
  visitorSecret: 'test-visitor-secret', authLimitPerHour: 10, production: true, log: mocks.log });
const good = { email: ' CLIENT@Example.test ', password: 'long-password', keep_studio_access: false };
function request(body?: unknown, extra: Record<string, string> = {}) {
  return new Request(BASE, { method: 'POST', headers: { origin: BASE, 'content-type': 'application/json',
    cookie: `n6b_session=${'a'.repeat(43)}`, 'x-forwarded-for': '192.0.2.1', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
function stream(chunks: readonly string[], extra: Record<string, string> = {}) {
  return new Request(BASE, { method: 'POST', headers: { origin: BASE, cookie: `n6b_session=${'a'.repeat(43)}`,
    'x-forwarded-for': '192.0.2.1', ...extra }, body: new ReadableStream({ start(c) {
      for (const chunk of chunks) c.enqueue(Buffer.from(chunk)); c.close();
    } }), duplex: 'half' } as RequestInit);
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(ID); mocks.hash.mockResolvedValue('bcrypt12');
  mocks.reserve.mockResolvedValue({ ok: true }); mocks.issue.mockResolvedValue({ expiresAt: new Date('2030-01-01') });
  mocks.accept.mockResolvedValue({ accountId: ID });
});
describe('HAN-01/02 handover HTTP boundary', () => {
  it('SC-US-014-1: real empty stream accepted without media, only hash stored and configured origin used', async () => {
    for (const chunks of [[], [''], ['', '']]) {
      const r = await issue(stream(chunks), ID); expect(r.status).toBe(201);
      const data = (await r.json()).data; const raw = new URL(data.link).pathname.split('/').pop()!;
      expect(new URL(data.link).origin).toBe(BASE); expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
      expect(mocks.issue).toHaveBeenLastCalledWith(pool, ID, ID, createHash('sha256').update(raw).digest('hex'));
      expect(r.headers.get('cache-control')).toBe('no-store'); expect(r.headers.get('referrer-policy')).toBe('no-referrer');
    }
  });
  it('SC-US-014-1: malformed ID, authentication and authority failures have no issue effects', async () => {
    expect((await issue(request(), 'bad')).status).toBe(403);
    expect((await issue(request(undefined, { cookie: '' }), ID)).status).toBe(401);
    expect(mocks.issue).not.toHaveBeenCalled();
    mocks.issue.mockResolvedValue('forbidden'); expect((await issue(request(), ID)).status).toBe(403);
  });
  it('HAN-02 Origin missing/null/foreign precedes auth, quota, hashing and DB', async () => {
    for (const origin of ['', 'null', 'https://foreign.test']) {
      expect((await issue(request({}, { origin }), ID)).status).toBe(403);
      expect((await accept(request(good, { origin }), token)).status).toBe(403);
    }
    const absent = request(good); absent.headers.delete('origin'); expect((await accept(absent, token)).status).toBe(403);
    expect(mocks.authenticate).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.accept).not.toHaveBeenCalled();
  });
  it('HAN-02 actual issue bytes and object envelopes bounded', async () => {
    for (const raw of [' ', '{', 'null', '[]', '"too-large"']) {
      expect((await issue(stream([raw], { 'content-type': 'application/json' }), ID)).status).toBe(422);
    }
    expect((await issue(stream(['{}'], { 'content-type': 'application/jsonp' }), ID)).status).toBe(422);
    expect((await issue(stream(['x'.repeat(4096), 'x'], { 'content-length': '0' }), ID)).status).toBe(413);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect((await issue(stream(['{}'], { 'content-type': 'application/json; charset=utf-8' }), ID)).status).toBe(201);
  });
  it('SC-US-014-2: false/true exact boolean, normalized email, bcrypt12 and prepared atomic session', async () => {
    for (const keep of [false, true]) {
      const r = await accept(request({ ...good, keep_studio_access: keep }), token); expect(r.status).toBe(200);
      expect(mocks.hash).toHaveBeenLastCalledWith(good.password, 12);
      expect(mocks.accept).toHaveBeenLastCalledWith(pool, { tokenHash: createHash('sha256').update(token).digest('hex'),
        email: 'client@example.test', passwordHash: 'bcrypt12', keepStudioAccess: keep, session: prepared.record });
      expect(r.headers.get('set-cookie')).toBe(`n6b_session=${prepared.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`);
      expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(mocks.hash.mock.invocationCallOrder[0]!);
      expect(mocks.hash.mock.invocationCallOrder[0]).toBeLessThan(mocks.accept.mock.invocationCallOrder[0]!);
      expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
  });
  it('HAN-02 invalid media, bytes, malformed objects and credentials rejected before effects', async () => {
    for (const body of [null, [], 'too-large', {}, { ...good, email: 'bad' }, { ...good, password: 'short' },
      { ...good, password: 'я'.repeat(37) }, { ...good, email: `${'x'.repeat(250)}@example.test` },
      ...['false', null, 0, undefined].map((keep) => ({ ...good, keep_studio_access: keep }))]) {
      expect((await accept(request(body), token)).status).toBe(422);
    }
    for (const media of ['text/plain', 'application/jsonp', '']) {
      expect((await accept(request(good, { 'content-type': media }), token)).status).toBe(422);
    }
    expect((await accept(stream(['{'], { 'content-type': 'application/json' }), token)).status).toBe(422);
    expect((await accept(stream([], { 'content-type': 'application/json' }), token)).status).toBe(422);
    const raw = JSON.stringify({ ...good, padding: 'x'.repeat(4096) });
    expect((await accept(stream([raw], { 'content-type': 'application/json', 'content-length': '1' }), token)).status).toBe(413);
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
    const exact = JSON.stringify(good); expect((await accept(stream([exact, ' '.repeat(4096 - Buffer.byteLength(exact))],
      { 'content-type': 'application/json; charset=utf-8' }), token)).status).toBe(200);
  });
  it('SC-US-014-3 malformed token does not look up/hash credentials; 404/410 no cookie', async () => {
    for (const bad of ['bad', '', '../x', 'a'.repeat(42), 'a'.repeat(42) + 'B']) {
      expect((await accept(request(good), bad)).status).toBe(404);
    }
    expect(mocks.accept).not.toHaveBeenCalled(); expect(mocks.hash).not.toHaveBeenCalled();
    for (const [result, status] of [['missing', 404], ['gone', 410]] as const) {
      mocks.accept.mockResolvedValue(result); const r = await accept(request(good), token);
      expect(r.status).toBe(status); expect(r.headers.get('set-cookie')).toBeNull();
    }
  });
  it('SC-US-014-4 exact duplicate text, safe 503, no success audit/cookie on failure', async () => {
    mocks.accept.mockResolvedValue('email-taken'); const r = await accept(request(good), token);
    expect(r.status).toBe(409); expect((await r.json()).error.message).toBe(HANDOVER_EMAIL_TAKEN);
    mocks.accept.mockRejectedValue(new Error(`secret ${token} ${good.password}`));
    const failed = await accept(request(good), token); expect(failed.status).toBe(503);
    expect(failed.headers.get('set-cookie')).toBeNull(); expect(await failed.text()).not.toContain(token);
    expect(mocks.log).not.toHaveBeenCalled();
  });
  it('HAN-02 limiter429/503 and absent proxy IP stop before bcrypt/claim', async () => {
    mocks.reserve.mockResolvedValue({ ok: false }); expect((await accept(request(good), token)).status).toBe(429);
    mocks.reserve.mockRejectedValue(new Error('db')); expect((await accept(request(good), token)).status).toBe(503);
    expect((await accept(request(good, { 'x-forwarded-for': '' }), token)).status).toBe(503);
    expect(mocks.hash).not.toHaveBeenCalled(); expect(mocks.accept).not.toHaveBeenCalled();
  });
});
