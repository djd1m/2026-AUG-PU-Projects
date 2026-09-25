import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src';
import { migrate } from '../packages/db/src/migrate';
import { VideoService, type UploadStorage } from '../apps/web/src/server/video';
import { VideoCtaService } from '../apps/web/src/server/video-cta';
import { ShortLinkService } from '../apps/web/src/server/short-link';
import { createShortLinkHandler } from '../apps/web/src/server/short-link-handler';
import { ScreenService } from '../apps/web/src/server/screen';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
// Фича 27a clip-cta на настоящем PostgreSQL 16: CHECK миграции 020, сохранение при создании, video.setCta, /c/.
const dbUrl = process.env.DATABASE_URL;
const YT = 'https://www.youtube.com/watch?v=ukZyNkgqVho';
describe.skipIf(!dbUrl)('clip-cta in real PostgreSQL', () => {
  let pool: Pool;
  const schema = `clip_cta_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Only *_test database');
    await ensureTestDatabase(dbUrl); pool = createPool(dbUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  const storage: UploadStorage = {
    initiate: async () => randomUUID(), list: async () => [], sign: async () => [], complete: async () => {},
    abort: async () => {}, delete: async () => {}, head: async () => 24n, bytes: async () => Buffer.alloc(24),
  };
  const body = { declared_bytes: 24, filename: 'a.mp3', source: 'upload' };
  const account = async () => (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'hash') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id as string;
  const video = async (owner: string) => (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status)
    VALUES ($1,$2,'upload',100,'done') RETURNING id`, [owner, randomUUID()])).rows[0].id as string;

  it('миграция 020: по умолчанию none; CHECK отвергает вид без адреса, none с адресом, чужой вид, http и 2049 символов', async () => {
    const owner = await account(), id = await video(owner);
    expect((await pool.query('SELECT cta_kind,cta_url FROM video WHERE id=$1', [id])).rows[0]).toEqual({ cta_kind: 'none', cta_url: null });
    for (const [kind, url] of [['watch_full', null], ['none', YT], ['phish', YT], ['open_link', 'http://example.com/x'],
      ['open_link', 'javascript:alert(1)'], ['open_link', `https://example.com/${'a'.repeat(2049 - 20)}`]] as const) {
      await expect(pool.query('UPDATE video SET cta_kind=$2,cta_url=$3 WHERE id=$1', [id, kind, url]), `${kind} ${url?.slice(0, 30)}`)
        .rejects.toMatchObject({ code: '23514' });
    }
    await pool.query('UPDATE video SET cta_kind=$2,cta_url=$3 WHERE id=$1', [id, 'watch_full', YT]);
    expect((await pool.query('SELECT cta_kind,cta_url FROM video WHERE id=$1', [id])).rows[0]).toEqual({ cta_kind: 'watch_full', cta_url: YT });
  });

  it('video.create сохраняет призыв; повтор ключа с другим призывом — 409 без второго списания; 422 не тратит слот', async () => {
    const id = await account(), service = new VideoService(pool, loadLimits(environment()), storage, async () => {});
    const key = randomUUID();
    const first = await service.create(id, key, { ...body, cta_kind: 'watch_full', cta_url: YT });
    expect((await pool.query('SELECT cta_kind,cta_url FROM video WHERE id=$1', [first.video_id])).rows[0]).toEqual({ cta_kind: 'watch_full', cta_url: YT });
    expect((await service.create(id, key, { ...body, cta_kind: 'watch_full', cta_url: YT })).video_id).toBe(first.video_id);
    await expect(service.create(id, key, { ...body, cta_kind: 'subscribe', cta_url: YT })).rejects.toMatchObject({ status: 409 });
    await expect(service.create(id, key, body)).rejects.toMatchObject({ status: 409 });
    await expect(service.create(id, randomUUID(), { ...body, cta_kind: 'watch_full', cta_url: 'http://example.com/' })).rejects.toMatchObject({ status: 422 });
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_uploads' AND scope_key=$1", [id])).rows[0].used).toBe(1);
    expect(Number((await pool.query('SELECT count(*) FROM video WHERE account_id=$1', [id])).rows[0].count)).toBe(1);
  });

  it('video.setCta: владелец меняет и снимает; чужой — 404 и строка не тронута; updated_at и квота не меняются', async () => {
    const owner = await account(), stranger = await account(), id = await video(owner);
    const before = (await pool.query('SELECT updated_at FROM video WHERE id=$1', [id])).rows[0].updated_at as Date;
    const cta = new VideoCtaService(pool);
    await expect(cta.setCta(stranger, { video_id: id, cta_kind: 'open_link', cta_url: 'https://evil.example/' })).rejects.toMatchObject({ status: 404 });
    await expect(cta.setCta(owner, { video_id: randomUUID(), cta_kind: 'none' })).rejects.toMatchObject({ status: 404 });
    expect((await pool.query('SELECT cta_kind FROM video WHERE id=$1', [id])).rows[0].cta_kind).toBe('none');
    await expect(cta.setCta(owner, { video_id: id, cta_kind: 'subscribe', cta_url: 'https://t.me/podcast' })).resolves.toMatchObject({ cta_kind: 'subscribe' });
    const screen = await new ScreenService(pool).get(owner, id);
    expect(screen).toMatchObject({ cta_kind: 'subscribe', cta_url: 'https://t.me/podcast' });
    await cta.setCta(owner, { video_id: id, cta_kind: 'none', cta_url: null });
    const after = (await pool.query('SELECT cta_kind,cta_url,updated_at FROM video WHERE id=$1', [id])).rows[0];
    expect(after).toMatchObject({ cta_kind: 'none', cta_url: null });
    expect((after.updated_at as Date).getTime()).toBe(before.getTime());
    expect(Number((await pool.query('SELECT count(*) FROM quota_counter WHERE scope_key=$1', [owner])).rows[0].count)).toBe(0);
    expect(Number((await pool.query('SELECT count(*) FROM job_attempt WHERE video_id=$1', [id])).rows[0].count)).toBe(0);
    await pool.query("UPDATE video SET deleted_at=now() WHERE id=$1", [id]);
    await expect(cta.setCta(owner, { video_id: id, cta_kind: 'none' })).rejects.toMatchObject({ status: 404 });
  });

  it('/c/{code} читает призыв записи из базы и показывает кнопку автора', async () => {
    const owner = await account(), id = await video(owner);
    await new VideoCtaService(pool).setCta(owner, { video_id: id, cta_kind: 'watch_full', cta_url: YT });
    const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
      VALUES ($1,1,0,20,'Клип','done',true) RETURNING id`, [id])).rows[0].id;
    await pool.query("INSERT INTO clip_link(clip_id,code) VALUES ($1,'CTDUUG')", [clip]);
    const handle = createShortLinkHandler({ referralSecret: 'test-secret', links: new ShortLinkService(pool), trustedProxyHops: 1,
      auth: { authenticate: vi.fn().mockResolvedValue(null) }, allowRead: async () => true, preview: async () => null });
    const html = await (await handle(new Request('https://app.example/c/CTDUUG', { headers: { 'x-forwarded-for': '192.0.2.7, 127.0.0.1' } }), 'CTDUUG')).text();
    expect(html).toContain(`<a class="cta" href="${YT}" rel="noopener noreferrer nofollow" target="_blank">Смотреть полный выпуск →</a>`);
    expect(html).toContain('<a class="secondary-link" href="/">Сделать свои клипы</a>');
  });
});
