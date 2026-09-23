import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { GuestPackService, consentHash } from '../apps/web/src/server/guest-pack';
import { GUEST_CONSENT_VERSION } from '../apps/web/src/lib/guest-contract';
import { createGuestPageHandler } from '../apps/web/src/server/guest-page';
import { createClipFileHandler } from '../apps/web/src/server/clip-file';
import { guestFileTicket, validGuestFileTicket, streamGuestFile } from '../apps/web/src/server/guest-file';
import { appRouter } from '../apps/web/src/server/trpc';
import { UploadError } from '../apps/web/src/server/upload-contract';
const owner = randomUUID(), video = randomUUID(), clip = randomUUID(), packId = randomUUID();
const code = 'A'.repeat(32), now = new Date('2026-09-22T20:59:59.999Z');
const input = { video_id: video, clip_ids: [clip], guest_name: 'Анна', consent_confirmed: true,
  consent_version: GUEST_CONSENT_VERSION, consent_text_hash: consentHash };
const row = { status: 'done', object_key: 'clip-file', thumbnail_key: 'thumb', title: 'Момент', expires_at: null, finished_at: null, plan: 'free' };
const cookie = `__Host-n5_session=${'a'.repeat(43)}`;
function request(url = `https://app.example/g/${code}`, extra: Record<string, string> = {}) {
  return new Request(url, { headers: { 'x-forwarded-for': '192.0.2.1, 127.0.0.1', ...extra } });
}
function fakeDb() {
  const query = vi.fn(async (sql: string) => ({ rowCount: 1, rows: sql.includes('RETURNING *')
    ? [{ id: packId, code, guest_name: 'Анна', sent_at: null, expires_at: null, revoked_at: null }]
    : [{ id: video }] }));
  const release = vi.fn(), connect = vi.fn().mockResolvedValue({ query, release });
  return { query, connect, release, pool: { query, connect } as unknown as Pool };
}
async function createRpc(guests: GuestPackService, body: unknown) {
  return fetchRequestHandler({ endpoint: '/api/trpc', req: new Request('https://app.example/api/trpc/guest.create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), router: appRouter, createContext: () => ({ account: owner, requestId: 'test', idempotencyKey: null, video: { create: vi.fn() }, guests }) });
}
afterEach(() => vi.unstubAllGlobals());
describe('guest consent boundary', () => {
  it.each([undefined, false, 'true', 1, null])('ADR-008 consent %s returns 422 before any database operation', async consent => {
    const db = fakeDb(), service = new GuestPackService(db.pool);
    const response = await createRpc(service, { ...input, consent_confirmed: consent });
    expect(response.status).toBe(422); expect(db.connect).not.toHaveBeenCalled(); expect(db.query).not.toHaveBeenCalled();
  });
  it.each([{ consent_version: 'future' }, { consent_text_hash: 'unknown' }, { clip_ids: [] }, { guest_name: ' ' }])('rejects invalid input %j', async extra => {
    const db = fakeDb();
    await expect(new GuestPackService(db.pool).create(owner, { ...input, ...extra })).rejects.toMatchObject({ status: 422 });
    expect(db.connect).not.toHaveBeenCalled();
  });
  it('records consent in pack INSERT, membership after it, commits before returning a 192-bit code', async () => {
    const db = fakeDb(), result = await new GuestPackService(db.pool, () => now).create(owner, input);
    const statements = db.query.mock.calls.map(c => c[0]);
    const insert = statements.findIndex(s => s.includes('INSERT INTO guest_pack\n'));
    expect(insert).toBeGreaterThan(0); expect(statements[insert]).toContain('consent_confirmed,consent_version,consent_text_hash,consent_at');
    expect(statements[insert + 1]).toContain('INSERT INTO guest_pack_clip');
    expect(statements.at(-1)).toBe('COMMIT'); expect(result.expires_at).toBeNull(); expect(db.release).toHaveBeenCalledOnce();
    const values = (db.query.mock.calls as unknown as [string, unknown[]][])[insert]![1];
    expect(values[2]).toMatch(/^[A-Za-z0-9_-]{32}$/); expect(Buffer.from(values[2] as string, 'base64url')).toHaveLength(24);
    expect(values.slice(4)).toEqual([GUEST_CONSENT_VERSION, consentHash, now]);
  });
  it('membership failure rolls back the whole pack', async () => {
    const db = fakeDb(); db.query.mockImplementation(async sql => {
      if (sql.includes('INSERT INTO guest_pack_clip')) throw new Error('injected failure');
      return { rowCount: 1, rows: [{ id: packId, code, guest_name: 'Анна', sent_at: null, expires_at: null, revoked_at: null }] };
    });
    await expect(new GuestPackService(db.pool).create(owner, input)).rejects.toThrow('injected');
    expect(db.query).toHaveBeenLastCalledWith('ROLLBACK'); expect(db.release).toHaveBeenCalledOnce();
  });
});
describe('guest page', () => {
  function fixture() {
    const pack = { id: packId, code, guest_name: '<script>Анна</script>', video_id: video, account_id: owner,
      sent_at: now, expires_at: new Date(now.getTime() + 14 * 86400000), revoked_at: null, plan: 'free', finished_at: now,
      clips: [{ clip_id: clip, title: '<img src=x onerror=alert(1)>', available: true, index: 1, start: 0, end: 25, status: 'done' as const, watermarked: true, expires_at: null }] };
    const guests = { find: vi.fn().mockResolvedValue(pack), recordOpen: vi.fn().mockResolvedValue(undefined) };
    const auth = { authenticate: vi.fn().mockResolvedValue(null) }, allowRead = vi.fn().mockResolvedValue(true);
    return { guests, auth, allowRead, handler: createGuestPageHandler({ guests, auth, allowRead, trustedProxyHops: 1 }) };
  }
  it('noindex guest page is anonymous, mobile, escaped and serves only member file routes', async () => {
    const f = fixture(), response = await f.handler(request(), code), html = await response.text();
    expect(response.status).toBe(200); expect(f.auth.authenticate).not.toHaveBeenCalled();
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(html).toContain('name="viewport"'); expect(html).toContain('@media(max-width:600px)');
    expect(html).toContain('&lt;script&gt;Анна'); expect(html).not.toContain('<img src=x');
    expect(html).toContain('Скачать все'); expect(html).toContain(`/api/clips/${clip}/file?g=${code}`);
    expect(html).not.toContain('object_key'); expect(html).not.toContain('X-Amz');
    expect(f.guests.recordOpen).toHaveBeenCalledWith(expect.objectContaining({ id: packId }), null, '192.0.2.0/24');
  });
  it('same 404 for unavailable packs and malformed codes', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const guests = new GuestPackService({ query } as unknown as Pool, () => now);
    const get = createGuestPageHandler({ guests, auth: { authenticate: vi.fn() }, trustedProxyHops: 1, allowRead: async () => true });
    const absent = await get(request(), code), malformed = await get(request(), 'bad');
    expect([absent.status, malformed.status]).toEqual([404, 404]); expect(await absent.text()).toBe(await malformed.text());
    absent.headers.forEach((value, key) => expect(malformed.headers.get(key)).toBe(value));
    expect(query.mock.calls[0]![0]).toContain('p.revoked_at IS NULL');
    expect(query.mock.calls[0]![0]).toContain('p.expires_at>$2');
  });
  it('rate limit precedes lookup; unavailable DB is 503, not an empty successful page', async () => {
    const f = fixture(); f.allowRead.mockResolvedValue(false);
    expect((await f.handler(request(), code)).status).toBe(429); expect(f.guests.find).not.toHaveBeenCalled();
    f.allowRead.mockResolvedValue(true); f.guests.find.mockRejectedValue(new Error('secret'));
    const failed = await f.handler(request(), code); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('secret');
  });
  it('owner self-open never writes growth events', async () => {
    const db = fakeDb(); await new GuestPackService(db.pool).recordOpen({ id: packId, account_id: owner }, owner, '192.0.2.0/24');
    expect(db.connect).not.toHaveBeenCalled(); expect(db.query).not.toHaveBeenCalled();
  });
});
describe('guest file capability', () => {
  function fixture() {
    const query = vi.fn().mockResolvedValue({ rows: [row] }), auth = { authenticate: vi.fn().mockResolvedValue({ account_id: owner }) };
    const sign = vi.fn().mockResolvedValue('https://private.example/internal-signature');
    const stream = vi.fn().mockImplementation(async () => new Response('bytes', { headers: { 'Cache-Control': 'no-store' } }));
    const deps = { pool: { query } as unknown as Pool, auth, sign, stream, guestSecret: 'test-only-secret', clock: () => now };
    return { ...deps, query, handler: createClipFileHandler(deps) };
  }
  it('guest gets signed app URL, not S3; every followup repeats DB authorization', async () => {
    const f = fixture(), response = await f.handler(request(`https://app.example/api/clips/${clip}/file?g=${code}&download=1`), clip);
    expect(response.status).toBe(302); expect(f.sign).not.toHaveBeenCalled();
    const location = response.headers.get('location')!; expect(location).toContain(`/api/clips/${clip}/file?g=`); expect(location).not.toContain('private.example');
    const downloaded = await f.handler(request(new URL(location, 'https://app.example').href), clip);
    expect(downloaded.status).toBe(200); expect(await downloaded.text()).toBe('bytes'); expect(f.query).toHaveBeenCalledTimes(2);
    expect(f.stream).toHaveBeenCalledOnce(); expect(f.sign).toHaveBeenCalledWith('clip-file', 'Момент.mp4');
    f.query.mockResolvedValue({ rows: [] });
    expect((await f.handler(request(new URL(location, 'https://app.example').href), clip)).status).toBe(404);
    expect(f.stream).toHaveBeenCalledOnce();
  });
  it('exactly two credentials: owner or guest code; short link, user header and bare signature fail', async () => {
    const f = fixture();
    for (const query of ['', '?code=23456789AB', '?sig=abc&until=9999999999999', '?guest_pack_id=' + packId]) {
      expect((await f.handler(request(`https://app.example/api/clips/${clip}/file${query}`, { 'x-user-id': owner }), clip)).status).toBe(404);
    }
    expect(f.query).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled();
    expect((await f.handler(request(`https://app.example/api/clips/${clip}/file`, { cookie }), clip)).status).toBe(302);
  });
  it('signed ticket binds clip, kind, code, download flag and TTL <= 15 minutes', () => {
    const until = String(now.getTime() + 900000), signature = guestFileTicket('secret', clip, 'file', code, true, until);
    expect(validGuestFileTicket(signature, signature, until, now)).toBe(true);
    expect(validGuestFileTicket(signature, signature, until, new Date(Number(until)))).toBe(false);
    expect(validGuestFileTicket(signature, signature, String(Number(until) + 1), now)).toBe(false);
    for (const changed of [guestFileTicket('secret', video, 'file', code, true, until), guestFileTicket('secret', clip, 'thumbnail', code, true, until),
      guestFileTicket('secret', clip, 'file', 'B'.repeat(32), true, until), guestFileTicket('secret', clip, 'file', code, false, until)]) {
      expect(validGuestFileTicket(signature, changed, until, now)).toBe(false);
    }
  });
  it('bad ticket fails before signing; DB or storage outage is fail closed', async () => {
    const f = fixture();
    expect((await f.handler(request(`https://app.example/api/clips/${clip}/file?g=${code}&sig=bad`), clip)).status).toBe(404);
    expect(f.sign).not.toHaveBeenCalled(); f.query.mockRejectedValue(new Error('secret'));
    expect((await f.handler(request(`https://app.example/api/clips/${clip}/file?g=${code}`), clip)).status).toBe(503);
    expect(f.sign).not.toHaveBeenCalled();
  });
  it('proxy forwards a single Range and bytes, excludes Location/cookies, refuses redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('part', { status: 206, headers: {
      'Content-Range': 'bytes 0-3/100', 'Content-Type': 'video/mp4', Location: 'https://secret', 'Set-Cookie': 'private',
    } })); vi.stubGlobal('fetch', fetch);
    const response = await streamGuestFile('https://private.example/signed', request('https://app.example/file', { range: 'bytes=0-3' }));
    expect(response.status).toBe(206); expect(await response.text()).toBe('part'); expect(response.headers.get('content-range')).toBe('bytes 0-3/100');
    expect(response.headers.get('location')).toBeNull(); expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toContain('no-store'); expect(fetch).toHaveBeenCalledWith('https://private.example/signed', expect.objectContaining({ redirect: 'error', headers: { Range: 'bytes=0-3' } }));
    expect((await streamGuestFile('https://private.example/signed', request('https://app.example/file', { range: 'bytes=0-3,9-11' }))).status).toBe(416);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
