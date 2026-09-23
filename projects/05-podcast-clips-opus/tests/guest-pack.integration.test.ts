import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { CreateBucketCommand, DeleteBucketCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { loadS3Config } from '../packages/shared/src/config';
import { createS3Client, generateDownloadUrl } from '../packages/s3/src';
import { GuestPackService, consentHash } from '../apps/web/src/server/guest-pack';
import { GUEST_CONSENT_VERSION } from '../apps/web/src/lib/guest-contract';
import { createGuestPageHandler } from '../apps/web/src/server/guest-page';
import { createClipFileHandler } from '../apps/web/src/server/clip-file';
import { streamGuestFile } from '../apps/web/src/server/guest-file';
import { appRouter } from '../apps/web/src/server/trpc';
const dbUrl = process.env.DATABASE_URL;
describe.skipIf(!dbUrl)('PostgreSQL guest-pack', () => {
  let pool: Pool, guests: GuestPackService;
  const schema = `guest_${randomBytes(8).toString('hex')}`;
  const owner = randomUUID(), stranger = randomUUID(), video = randomUUID(), clip = randomUUID(), other = randomUUID();
  const input = { video_id: video, clip_ids: [clip], guest_name: 'Анна', consent_confirmed: true,
    consent_version: GUEST_CONSENT_VERSION, consent_text_hash: consentHash };
  const cookie = `__Host-n5_session=${'a'.repeat(43)}`;
  let now = new Date('2026-09-22T20:59:59.999Z');
  const auth = { authenticate: vi.fn().mockResolvedValue(null) };
  const request = (url = 'https://app.example/g/code', ip = '192.0.2.1', signedIn = false) => new Request(url, {
    headers: { 'x-forwarded-for': `${ip}, 127.0.0.1`, ...(signedIn ? { cookie } : {}) },
  });
  const page = () => createGuestPageHandler({ guests, auth, trustedProxyHops: 1, allowRead: async () => true });
  const eventCount = async (type = 'guest_opened') => (await pool.query('SELECT count(*)::int AS n FROM growth_event WHERE type=$1', [type])).rows[0].n;
  const created = async () => guests.create(owner, input);
  const sent = async () => { const p = await created(); return guests.send(owner, p.guest_pack_id); };
  beforeAll(async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Requires isolated *_test database');
    await ensureTestDatabase(dbUrl);
    pool = new Pool({ connectionString: dbUrl, max: 12, connectionTimeoutMillis: 3000, statement_timeout: 10000, options: `-c search_path=${schema},public` });
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
    guests = new GuestPackService(pool, () => now);
  });
  beforeEach(async () => {
    now = new Date('2026-09-22T20:59:59.999Z'); auth.authenticate.mockReset(); auth.authenticate.mockResolvedValue(null);
    await pool.query('TRUNCATE account CASCADE');
    for (const id of [owner, stranger]) await pool.query("INSERT INTO account(id,email,password_hash,plan,status) VALUES($1,$2,'test-only','free','active')", [id, `${id}@example.test`]);
    await pool.query(`INSERT INTO video(id,account_id,idempotency_key,source,declared_bytes,status,finished_at)
      VALUES($1,$2,$3,'upload',100,'done',$4)`, [video, owner, randomUUID(), now]);
    for (const [i, id] of [clip, other].entries()) await pool.query(`INSERT INTO clip(id,video_id,"index",start_seconds,end_seconds,title,status,watermarked,object_key,thumbnail_key)
      VALUES($1,$2,$3,0,25,'Момент','done',true,$4,'thumb')`, [id, video, i + 1, `guest/${id}.mp4`]);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  it('ADR-008 HTTP 422 without consent and with false creates ZERO rows', async () => {
    for (const consent of [undefined, false]) {
      const response = await fetchRequestHandler({ endpoint: '/api/trpc', req: new Request('https://app.example/api/trpc/guest.create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, consent_confirmed: consent }),
      }), router: appRouter, createContext: () => ({ account: owner, requestId: 'test', idempotencyKey: null, video: { create: vi.fn() }, guests }) });
      expect(response.status).toBe(422);
      expect((await pool.query('SELECT count(*)::int AS n FROM guest_pack')).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int AS n FROM guest_pack_clip')).rows[0].n).toBe(0);
    }
  });
  it('consent persisted with pack, crypto code, expiry starts at send not creation', async () => {
    const pack = await created(), code = pack.url.split('/').at(-1)!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/); expect(Buffer.from(code, 'base64url')).toHaveLength(24);
    const stored = (await pool.query('SELECT * FROM guest_pack WHERE id=$1', [pack.guest_pack_id])).rows[0];
    expect(stored).toMatchObject({ consent_confirmed: true, consent_version: GUEST_CONSENT_VERSION, consent_text_hash: consentHash, consent_at: now, expires_at: null, sent_at: null });
    expect((await page()(request(), code)).status).toBe(404);
    now = new Date(now.getTime() + 2 * 86400000);
    const result = await guests.send(owner, pack.guest_pack_id);
    expect(result.sent_at).toBe(now.toISOString()); expect(result.expires_at).toBe(new Date(now.getTime() + 14 * 86400000).toISOString());
    expect(await eventCount('guest_sent')).toBe(1);
    await expect(guests.send(owner, pack.guest_pack_id)).rejects.toMatchObject({ status: 409 });
    expect(await eventCount('guest_sent')).toBe(1);
    expect((await pool.query("SELECT day::text FROM growth_event WHERE type='guest_sent'")).rows[0].day).toBe('2026-09-24');
  });
  it('10 parallel guest openings from one prefix create EXACTLY 1 event', async () => {
    const pack = await sent(), code = pack.url.split('/').at(-1)!;
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => page()(request(undefined, `192.0.2.${i + 1}`), code)));
    expect(responses.map(r => r.status)).toEqual(Array(10).fill(200)); expect(await eventCount()).toBe(1);
    expect((await pool.query('SELECT first_opened_at FROM guest_pack')).rows[0].first_opened_at).toEqual(now);
    await expect(pool.query(`INSERT INTO growth_event (type,guest_pack_id,ip_prefix,day)
      VALUES ('guest_opened',$1,'192.0.2.0/24','2026-09-22')`, [pack.guest_pack_id])).rejects.toMatchObject({ code: '23505' });
  });
  it('Moscow midnight, IPv6 /64, owner self-open and separate guest keys', async () => {
    const pack = await sent(), code = pack.url.split('/').at(-1)!;
    auth.authenticate.mockResolvedValue({ account_id: owner });
    expect((await page()(request(undefined, '192.0.2.1', true), code)).status).toBe(200); expect(await eventCount()).toBe(0);
    await page()(request(undefined, '2001:db8:1:2::1'), code); await page()(request(undefined, '2001:db8:1:2::2'), code);
    expect(await eventCount()).toBe(1);
    now = new Date('2026-09-22T21:00:00Z');
    await page()(request(undefined, '2001:db8:1:2::3'), code); await page()(request(undefined, '2001:db8:1:3::1'), code);
    expect(await eventCount()).toBe(3);
    const second = await sent(); await page()(request(undefined, '2001:db8:1:3::1'), second.url.split('/').at(-1)!);
    expect(await eventCount()).toBe(4);
  });
  it('first_opened failure rolls event back in same transaction', async () => {
    const pack = await sent();
    await pool.query(`CREATE FUNCTION fail_open() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$`);
    await pool.query('CREATE TRIGGER fail_open BEFORE UPDATE ON guest_pack FOR EACH ROW EXECUTE FUNCTION fail_open()');
    try {
      expect((await page()(request(), pack.url.split('/').at(-1)!)).status).toBe(503); expect(await eventCount()).toBe(0);
    } finally { await pool.query('DROP TRIGGER fail_open ON guest_pack'); await pool.query('DROP FUNCTION fail_open()'); }
  });
  it('simultaneous sends create one event; revoke is irreversible and idempotent', async () => {
    const p = await created();
    const sends = await Promise.allSettled(Array.from({ length: 10 }, () => guests.send(owner, p.guest_pack_id)));
    expect(sends.filter(r => r.status === 'fulfilled')).toHaveLength(1); expect(await eventCount('guest_sent')).toBe(1);
    const revoked = await guests.revoke(owner, p.guest_pack_id); now = new Date(now.getTime() + 1000);
    expect(await guests.revoke(owner, p.guest_pack_id)).toEqual(revoked);
    await expect(guests.send(owner, p.guest_pack_id)).rejects.toMatchObject({ status: 409 });
    await expect(guests.revoke(stranger, p.guest_pack_id)).rejects.toMatchObject({ status: 404 });
    await expect(guests.send(stranger, p.guest_pack_id)).rejects.toMatchObject({ status: 404 });
  });
  it('revoked expired unsent and nonexistent pages have identical 404', async () => {
    const revoked = await sent(), expired = await sent(), unsent = await created();
    await guests.revoke(owner, revoked.guest_pack_id);
    now = new Date(Date.parse(expired.expires_at!));
    const responses = await Promise.all([revoked.url, expired.url, unsent.url, '/g/' + 'Z'.repeat(32)].map(url => page()(request(), url.split('/').at(-1)!)));
    expect(responses.map(r => r.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(await Promise.all(responses.map(r => r.text()))).size).toBe(1);
    for (const response of responses) response.headers.forEach((value, key) => expect(responses[0]!.headers.get(key)).toBe(value));
  });
  it('exactly two file paths: owner or live guest membership; all other access is 404', async () => {
    const pack = await sent(), code = pack.url.split('/').at(-1)!;
    const sign = vi.fn().mockResolvedValue('https://private.example/signed');
    const handler = createClipFileHandler({ pool, auth, sign, clock: () => now, guestSecret: 'test-only', stream: async () => new Response('bytes') });
    for (const query of ['', '?code=23456789AB', '?guest_pack_id=' + pack.guest_pack_id]) {
      expect((await handler(request(`https://app.example/api/clips/${clip}/file${query}`), clip)).status).toBe(404);
    }
    auth.authenticate.mockResolvedValue({ account_id: stranger });
    expect((await handler(request(`https://app.example/api/clips/${clip}/file`, undefined, true), clip)).status).toBe(404);
    auth.authenticate.mockResolvedValue({ account_id: owner });
    expect((await handler(request(`https://app.example/api/clips/${clip}/file`, undefined, true), clip)).status).toBe(302);
    expect((await handler(request(`https://app.example/api/clips/${clip}/file?g=${code}`), clip)).status).toBe(302);
    expect((await handler(request(`https://app.example/api/clips/${other}/file?g=${code}`), other)).status).toBe(404);
  });
  it('revocation closes previously issued signed file and thumbnail URLs, owner file survives', async () => {
    const pack = await sent(), code = pack.url.split('/').at(-1)!;
    const sign = vi.fn().mockResolvedValue('https://private.example/signed'), stream = vi.fn(async () => new Response('bytes'));
    const deps = { pool, auth, sign, stream, guestSecret: 'test-only', clock: () => now };
    const tickets = [];
    for (const kind of ['file', 'thumbnail'] as const) {
      const handler = createClipFileHandler(deps, kind);
      const issued = await handler(request(`https://app.example/api/clips/${clip}/${kind}?g=${code}`), clip);
      expect(issued.status).toBe(302); const url = new URL(issued.headers.get('location')!, 'https://app.example').href;
      expect((await handler(request(url), clip)).status).toBe(200); tickets.push({ handler, url });
    }
    await guests.revoke(owner, pack.guest_pack_id);
    for (const { handler, url } of tickets) expect((await handler(request(url), clip)).status).toBe(404);
    expect(stream).toHaveBeenCalledTimes(2);
    auth.authenticate.mockResolvedValue({ account_id: owner });
    expect((await createClipFileHandler(deps)(request(`https://app.example/api/clips/${clip}/file`, undefined, true), clip)).status).toBe(302);
  });
  it('clip expiry, video removal, inactive owner and foreign membership fail closed', async () => {
    await expect(guests.create(stranger, input)).rejects.toMatchObject({ status: 404 });
    await expect(guests.create(owner, { ...input, clip_ids: [randomUUID()] })).rejects.toMatchObject({ status: 422 });
    const pack = await sent(), code = pack.url.split('/').at(-1)!;
    const handler = createClipFileHandler({ pool, auth, sign: vi.fn(), guestSecret: 'test', stream: vi.fn(), clock: () => now });
    now = new Date(now.getTime() + 3 * 86400000);
    expect((await page()(request(), code)).status).toBe(200);
    expect((await handler(request(`https://app.example/api/clips/${clip}/file?g=${code}`), clip)).status).toBe(404);
    await pool.query('UPDATE video SET deleted_at=now()'); expect((await page()(request(), code)).status).toBe(404);
    await pool.query('UPDATE video SET deleted_at=NULL'); await pool.query("UPDATE account SET status='erasing' WHERE id=$1", [owner]);
    expect((await page()(request(), code)).status).toBe(404);
  });
  it.skipIf(!process.env.S3_ENDPOINT)('MinIO real bytes before revoke, same signed URL 404 afterwards', async () => {
    const config = loadS3Config(process.env), client = createS3Client({ ...config, publicEndpoint: config.endpoint });
    const bucket = `n5-guest-${randomBytes(8).toString('hex')}`, key = `guest/${clip}.mp4`;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'guest-clip-bytes', ContentType: 'video/mp4' }));
      const pack = await sent(), code = pack.url.split('/').at(-1)!;
      const handler = createClipFileHandler({ pool, auth, clock: () => now, guestSecret: 'test-only', stream: streamGuestFile,
        sign: (object, filename) => generateDownloadUrl({ client, bucket }, object, filename) });
      const issued = await handler(request(`https://app.example/api/clips/${clip}/file?g=${code}`), clip);
      expect(issued.status).toBe(302); const url = new URL(issued.headers.get('location')!, 'https://app.example').href;
      const response = await handler(request(url), clip); expect(response.status).toBe(200); expect(await response.text()).toBe('guest-clip-bytes');
      await guests.revoke(owner, pack.guest_pack_id);
      expect((await handler(request(url), clip)).status).toBe(404);
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      await client.send(new DeleteBucketCommand({ Bucket: bucket })); client.destroy();
    }
  });
});
