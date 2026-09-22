import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { ShortLinkService } from '../apps/web/src/server/short-link';
import { createShortLinkHandler } from '../apps/web/src/server/short-link-handler';
const dbUrl = process.env.DATABASE_URL;
describe.skipIf(!dbUrl)('PostgreSQL short-link', () => {
  let pool: Pool, links: ShortLinkService;
  const schema = `short_link_${randomBytes(8).toString('hex')}`;
  const owner = randomUUID(), stranger = randomUUID(), video = randomUUID(), clip = randomUUID(), linkId = randomUUID();
  const code = '23456789AB';
  let now = new Date('2026-09-22T20:59:59.999Z');
  const preview = vi.fn().mockResolvedValue('https://storage.example/thumb?signature=test');
  const auth = { authenticate: vi.fn().mockResolvedValue(null) };
  const request = (ip = '192.0.2.10', cookie = '') => new Request(`https://app.example/c/${code}`, {
    headers: { 'x-forwarded-for': `${ip}, 127.0.0.1`, cookie },
  });
  const handler = () => createShortLinkHandler({ links, auth, preview, trustedProxyHops: 1,
    allowRead: async () => true, clock: () => now });
  const totals = async () => ({
    count: (await pool.query('SELECT unique_view_count FROM clip_link WHERE id=$1', [linkId])).rows[0].unique_view_count,
    events: Number((await pool.query("SELECT count(*) FROM growth_event WHERE type='link_view'")).rows[0].count),
  });
  beforeAll(async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Requires isolated *_test database');
    await ensureTestDatabase(dbUrl);
    pool = new Pool({ connectionString: dbUrl, max: 24, options: `-c search_path=${schema},public` });
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
    links = new ShortLinkService(pool, () => now);
  });
  beforeEach(async () => {
    now = new Date('2026-09-22T20:59:59.999Z');
    preview.mockClear(); preview.mockResolvedValue('https://storage.example/thumb?signature=test');
    auth.authenticate.mockReset(); auth.authenticate.mockResolvedValue(null);
    await pool.query('TRUNCATE account CASCADE');
    for (const id of [owner, stranger]) await pool.query("INSERT INTO account(id,email,password_hash,plan,status) VALUES($1,$2,'test-only','free','active')", [id, `${id}@example.test`]);
    await pool.query(`INSERT INTO video(id,account_id,idempotency_key,source,declared_bytes,status)
      VALUES($1,$2,$3,'upload',100,'done')`, [video, owner, randomUUID()]);
    await pool.query(`INSERT INTO clip(id,video_id,"index",start_seconds,end_seconds,title,status,watermarked,object_key,thumbnail_key)
      VALUES($1,$2,1,0,25,'Короткий момент','done',true,'private-file','thumb')`, [clip, video]);
    await pool.query('INSERT INTO clip_link(id,clip_id,code) VALUES($1,$2,$3)', [linkId, clip, code]);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });

  it('20 parallel visits from one prefix count EXACTLY 1 event and 1 view', async () => {
    const get = handler();
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => get(request(`192.0.2.${i + 1}`), code)));
    expect(responses.map(r => r.status)).toEqual(Array(20).fill(200));
    expect(await totals()).toEqual({ count: 1, events: 1 });
    const event = (await pool.query('SELECT ip_prefix::text,day::text FROM growth_event')).rows[0];
    expect(event).toEqual({ ip_prefix: '192.0.2.0/24', day: '2026-09-22' });
  });
  it('database itself rejects duplicate link_view, without an application precheck', async () => {
    await handler()(request(), code);
    await expect(pool.query(`INSERT INTO growth_event (type,clip_link_id,ip_prefix,day)
      VALUES ('link_view',$1,'192.0.2.0/24','2026-09-22')`, [linkId])).rejects.toMatchObject({ code: '23505' });
  });
  it('counter failure rolls event back in the SAME transaction', async () => {
    await pool.query(`CREATE FUNCTION fail_count() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'injected counter failure'; END $$`);
    await pool.query('CREATE TRIGGER fail_count BEFORE UPDATE ON clip_link FOR EACH ROW EXECUTE FUNCTION fail_count()');
    try {
      expect((await handler()(request(), code)).status).toBe(503);
      expect(await totals()).toEqual({ count: 0, events: 0 });
    } finally { await pool.query('DROP TRIGGER fail_count ON clip_link'); await pool.query('DROP FUNCTION fail_count()'); }
    expect((await handler()(request(), code)).status).toBe(200);
    expect(await totals()).toEqual({ count: 1, events: 1 });
  });
  it('expired and removed file keeps landing alive and counts external visits', async () => {
    await pool.query("UPDATE clip SET expires_at='2026-09-20',object_key=NULL,thumbnail_key=NULL WHERE id=$1", [clip]);
    const response = await handler()(request(), code);
    expect(response.status).toBe(200); expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    const html = await response.text();
    expect(html).toContain('Срок хранения клипа истёк'); expect(html).toContain('Сделать свои клипы');
    expect(preview).not.toHaveBeenCalled(); expect(await totals()).toEqual({ count: 1, events: 1 });
  });
  it('unknown and revoked code have identical 404 responses', async () => {
    await pool.query('UPDATE clip_link SET revoked_at=now() WHERE id=$1', [linkId]);
    const revoked = await handler()(request(), code), unknown = await handler()(request(), 'ZZZZZZZZZZ');
    expect([revoked.status, unknown.status]).toEqual([404, 404]);
    expect(await revoked.text()).toBe(await unknown.text());
    revoked.headers.forEach((value, key) => expect(unknown.headers.get(key)).toBe(value));
    expect(await totals()).toEqual({ count: 0, events: 0 }); expect(preview).not.toHaveBeenCalled();
  });
  it('owner self-visit records NOTHING; another signed-in account counts', async () => {
    auth.authenticate.mockResolvedValue({ account_id: owner });
    const cookie = `__Host-n5_session=${'a'.repeat(43)}`;
    expect((await handler()(request('192.0.2.1', cookie), code)).status).toBe(200);
    expect(await totals()).toEqual({ count: 0, events: 0 });
    auth.authenticate.mockResolvedValue({ account_id: stranger });
    expect((await handler()(request('192.0.2.1', cookie), code)).status).toBe(200);
    expect(await totals()).toEqual({ count: 1, events: 1 });
  });
  it('Moscow midnight and another IPv6 /64 each add a view', async () => {
    const get = handler();
    await get(request('2001:db8:1:2::1'), code);
    await get(request('2001:db8:1:2::2'), code);
    expect(await totals()).toEqual({ count: 1, events: 1 });
    now = new Date('2026-09-22T21:00:00.000Z');
    await get(request('2001:db8:1:2::3'), code);
    await get(request('2001:db8:1:3::1'), code);
    expect(await totals()).toEqual({ count: 3, events: 3 });
    expect((await pool.query('SELECT DISTINCT day::text FROM growth_event ORDER BY day')).rows)
      .toEqual([{ day: '2026-09-22' }, { day: '2026-09-23' }]);
  });
  it('link_copy reuses code, only owner, even after expiry; explicit Moscow day', async () => {
    await expect(links.copy(stranger, clip)).rejects.toMatchObject({ status: 404 });
    await expect(links.copy(owner, randomUUID())).rejects.toMatchObject({ status: 404 });
    await pool.query("UPDATE clip SET expires_at='2026-09-20',object_key=NULL,thumbnail_key=NULL WHERE id=$1", [clip]);
    expect(await links.copy(owner, clip)).toEqual({ code, url: `/c/${code}` });
    now = new Date('2026-09-22T21:00:00.000Z');
    await links.copy(owner, clip);
    expect((await pool.query('SELECT type,account_id,clip_link_id,day::text FROM growth_event ORDER BY day')).rows).toEqual([
      { type: 'link_copy', account_id: owner, clip_link_id: linkId, day: '2026-09-22' },
      { type: 'link_copy', account_id: owner, clip_link_id: linkId, day: '2026-09-23' },
    ]);
    expect((await pool.query('SELECT count(*)::int AS n FROM clip_link')).rows[0].n).toBe(1);
    expect(await totals()).toEqual({ count: 0, events: 0 });
    await pool.query('UPDATE clip_link SET revoked_at=now()');
    await expect(links.copy(owner, clip)).rejects.toMatchObject({ status: 404 });
  });
  it('deleted video and inactive account do not expose a landing', async () => {
    await pool.query('UPDATE video SET deleted_at=now()');
    expect((await handler()(request(), code)).status).toBe(404);
    await pool.query('UPDATE video SET deleted_at=NULL');
    await pool.query("UPDATE account SET status='erasing' WHERE id=$1", [owner]);
    expect((await handler()(request(), code)).status).toBe(404);
    expect(await totals()).toEqual({ count: 0, events: 0 });
  });
});
