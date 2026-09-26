// Фича 28 landing-demo (ADR-018) на настоящем PostgreSQL: третий путь к файлу отдаёт ТОЛЬКО клип витрины.
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { createShowcaseFileHandler } from '../apps/web/src/server/showcase-file';
import { ShortLinkService, previewState } from '../apps/web/src/server/short-link';
import { SHOWCASE_CLIPS } from '../packages/shared/src/showcase';
const dbUrl = process.env.DATABASE_URL;
const SHOWCASE = SHOWCASE_CLIPS[0]!;
describe.skipIf(!dbUrl)('PostgreSQL showcase route', () => {
  let pool: Pool;
  const schema = `showcase_${randomBytes(8).toString('hex')}`;
  const account = randomUUID(), video = randomUUID(), neighbour = randomUUID();
  const now = new Date('2026-09-30T12:00:00Z'), finished = new Date('2026-09-24T10:24:31Z');
  const sign = vi.fn(async (key: string) => `https://storage.example/${key}?X-Amz-Expires=900`);
  const handler = (kind: 'file' | 'thumbnail' = 'file') => createShowcaseFileHandler({ pool, sign, trustedProxyHops: 1, allowRead: async () => true }, kind);
  const request = () => new Request('https://clipmkr.ru/api/showcase/x/file', { headers: { 'x-forwarded-for': '203.0.113.9, 127.0.0.1' } });
  beforeAll(async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Requires isolated *_test database');
    await ensureTestDatabase(dbUrl);
    pool = createPool(dbUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => {
    sign.mockClear();
    await pool.query('TRUNCATE account CASCADE');
    await pool.query("INSERT INTO account(id,email,password_hash,plan,status) VALUES($1,$2,'test-only','free','active')", [account, `${account}@example.test`]);
    await pool.query(`INSERT INTO video(id,account_id,idempotency_key,source,declared_bytes,status,finished_at)
      VALUES($1,$2,$3,'upload',100,'done',$4)`, [video, account, randomUUID(), finished]);
    for (const [id, index, code] of [[SHOWCASE.clipId, 1, SHOWCASE.code], [neighbour, 2, 'ABCDEF']] as const) {
      await pool.query(`INSERT INTO clip(id,video_id,"index",start_seconds,end_seconds,title,status,watermarked,object_key,thumbnail_key)
        VALUES($1,$2,$3,0,25,'Клип','done',true,$4,$5)`, [id, video, index, `clips/free/${video}/${id}-v2.mp4`, `thumbs/${video}/${id}.jpg`]);
      await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2)', [id, code]);
    }
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });

  it('клип витрины: 302 на подписанный ключ файла и превью', async () => {
    const file = await handler()(request(), SHOWCASE.code);
    expect(file.status).toBe(302);
    expect(file.headers.get('Location')).toBe(`https://storage.example/clips/free/${video}/${SHOWCASE.clipId}-v2.mp4?X-Amz-Expires=900`);
    expect((await handler('thumbnail')(request(), SHOWCASE.code)).headers.get('Location')).toContain(`thumbs/${video}/${SHOWCASE.clipId}.jpg`);
  });
  it('чужой настоящий клип с кодом того же формата → 404, подписи нет', async () => {
    expect((await handler()(request(), 'ABCDEF')).status).toBe(404);
    expect(sign).not.toHaveBeenCalled();
  });
  it('клип витрины не done → 404', async () => {
    await pool.query("UPDATE clip SET status='rendering' WHERE id=$1", [SHOWCASE.clipId]);
    expect((await handler()(request(), SHOWCASE.code)).status).toBe(404);
  });
  it('объект стёрт → 404 (файл), превью отдельно', async () => {
    await pool.query('UPDATE clip SET object_key=NULL WHERE id=$1', [SHOWCASE.clipId]);
    expect((await handler()(request(), SHOWCASE.code)).status).toBe(404);
    expect((await handler('thumbnail')(request(), SHOWCASE.code)).status).toBe(302);
  });
  it('отозванная ссылка, удалённая запись, аккаунт в стирании → 404', async () => {
    await pool.query('UPDATE clip_link SET revoked_at=now() WHERE clip_id=$1', [SHOWCASE.clipId]);
    expect((await handler()(request(), SHOWCASE.code)).status).toBe(404);
    await pool.query('UPDATE clip_link SET revoked_at=NULL WHERE clip_id=$1', [SHOWCASE.clipId]);
    await pool.query('UPDATE video SET deleted_at=now() WHERE id=$1', [video]);
    expect((await handler()(request(), SHOWCASE.code)).status).toBe(404);
    await pool.query('UPDATE video SET deleted_at=NULL WHERE id=$1', [video]);
    await pool.query("UPDATE account SET status='erasing' WHERE id=$1", [account]);
    expect((await handler()(request(), SHOWCASE.code)).status).toBe(404);
  });
  it('код витрины, привязанный в базе к ДРУГОМУ клипу, не открывает ни тот, ни этот → 404', async () => {
    // Набор и база разошлись: у клипа витрины живая ссылка с ДРУГИМ кодом, а код витрины висит на соседе.
    await pool.query('DELETE FROM clip_link WHERE clip_id=ANY($1::uuid[])', [[SHOWCASE.clipId, neighbour]]);
    await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2),($3,$4)', [SHOWCASE.clipId, 'HJKMNP', neighbour, SHOWCASE.code]);
    expect((await handler()(request(), SHOWCASE.code)).status).toBe(404);
  });
  it('/c/ через 6 дней: клип витрины «ready», соседний клип той же записи — «expired»', async () => {
    const links = new ShortLinkService(pool, () => now);
    const showcase = await links.find(SHOWCASE.code), other = await links.find('ABCDEF');
    expect(showcase.clip_id).toBe(SHOWCASE.clipId);
    expect(previewState(showcase, now)).toBe('ready');
    expect(previewState(other, now)).toBe('expired');
  });
});
