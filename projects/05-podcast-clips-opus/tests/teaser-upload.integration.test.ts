import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { getRenderInput, leaseAttempt, createPool, type Pool } from '../packages/db/src';
import { migrate } from '../packages/db/src/migrate';
import { VideoService, type UploadStorage } from '../apps/web/src/server/video';
import { loadLimits } from '../packages/shared/src/config';
import { environment } from './fixtures/environment';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
const dbUrl = process.env.DATABASE_URL;
describe.skipIf(!dbUrl)('teaser upload in real PostgreSQL', () => {
  let pool: Pool;
  const schema = `teaser_${randomBytes(8).toString('hex')}`;
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
  it('omitted=false; true persists; same key changed flag conflicts without extra charge', async () => {
    const id = await account(), service = new VideoService(pool, loadLimits(environment()), storage, async () => {});
    const key = randomUUID(), first = await service.create(id, key, body);
    expect((await pool.query('SELECT teaser FROM video WHERE id=$1', [first.video_id])).rows[0].teaser).toBe(false);
    expect((await service.create(id, key, { ...body, teaser: false })).video_id).toBe(first.video_id);
    await expect(service.create(id, key, { ...body, teaser: true })).rejects.toMatchObject({ status: 409 });
    const second = await service.create(id, randomUUID(), { ...body, teaser: true });
    expect((await pool.query('SELECT teaser FROM video WHERE id=$1', [second.video_id])).rows[0].teaser).toBe(true);
    await expect(service.create(id, randomUUID(), { ...body, extra: 1 })).rejects.toMatchObject({ status: 422 });
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_uploads' AND scope_key=$1", [id])).rows[0].used).toBe(2);
  });
  it('render input reads persisted teaser and clip title', async () => {
    const id = await account();
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,
      object_key,status,duration_seconds,teaser) VALUES ($1,$2,'upload',100,100,'source','rendering',120,true) RETURNING id`,
      [id, randomUUID()])).rows[0].id;
    await pool.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments)
      VALUES ($1,'ru',120,1,'[{"word":"Привет","start":0,"end":1}]','[]')`, [video]);
    const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
      VALUES ($1,1,0,20,'Заголовок из БД','queued',true) RETURNING id`, [video])).rows[0].id;
    await pool.query('INSERT INTO clip_link(clip_id,code) VALUES ($1,$2)', [clip, randomBytes(5).toString('hex')]);
    const attempt = (await leaseAttempt(pool, video, 'render', 1, clip))!;
    expect(await getRenderInput(pool, attempt)).toMatchObject({ teaser: true, title: 'Заголовок из БД' });
  });
  it('concurrent opposite flags produce one winner and one 409', async () => {
    const id = await account(), key = randomUUID();
    const service = new VideoService(pool, loadLimits(environment()), storage, async () => {});
    const results = await Promise.allSettled([false, true].map(teaser => service.create(id, key, { ...body, teaser })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect((await pool.query("SELECT used FROM quota_counter WHERE scope='user_uploads' AND scope_key=$1", [id])).rows[0].used).toBe(1);
  });
});
