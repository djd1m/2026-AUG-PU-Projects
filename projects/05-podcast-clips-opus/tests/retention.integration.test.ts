import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { CreateBucketCommand, DeleteBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { ErasureService } from '../apps/web/src/server/erasure';
import { retentionTick, ERASURE_QUIET_MS, type RetentionStorage } from '../apps/web/src/server/retention';
import { loadS3Config } from '../packages/shared/src/config';
import * as s3 from '../packages/s3/src';
const url = process.env.DATABASE_URL, endpoint = process.env.S3_ENDPOINT;
const now = new Date('2026-09-24T12:00:00Z');
describe.skipIf(!url)('retention PostgreSQL and MinIO', () => {
  let pool: Pool;
  const schema = `erase_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна отдельная БД *_test');
    await ensureTestDatabase(url);
    pool = createPool(url, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account,quota_counter CASCADE'); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture(plan = 'free', finished = new Date(now.getTime() - 4 * 86400_000)) {
    const account = (await pool.query("INSERT INTO account(email,password_hash,plan) VALUES($1,'private',$2) RETURNING id", [`${randomUUID()}@test.invalid`, plan])).rows[0].id as string;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status,finished_at)
      VALUES($1,$2,'upload',100,'done',$3) RETURNING id`, [account, randomUUID(), finished])).rows[0].id as string;
    const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
      VALUES($1,1,0,20,'Private title','done',true) RETURNING id`, [video])).rows[0].id as string;
    const keys = [`videos/${account}/${video}/source.mp4`, `clips/${plan}/${video}/${clip}.mp4`, `thumbs/${video}/${clip}.jpg`];
    await pool.query('UPDATE video SET object_key=$2 WHERE id=$1', [video, keys[0]]);
    await pool.query('UPDATE clip SET object_key=$2,thumbnail_key=$3 WHERE id=$1', [clip, keys[1], keys[2]]);
    await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2)', [clip, randomUUID()]);
    const pack = (await pool.query(`INSERT INTO guest_pack(video_id,account_id,code,guest_name,consent_confirmed,consent_version,consent_text_hash,consent_at,sent_at,expires_at)
      VALUES($1,$2,$3,'Private guest',true,'v1','hash',$4,$4,$4::timestamptz+interval '336 hours') RETURNING id`,
    [video, account, randomUUID(), new Date(now.getTime() - 15 * 86400_000)])).rows[0].id as string;
    await pool.query('INSERT INTO guest_pack_clip(guest_pack_id,clip_id) VALUES($1,$2)', [pack, clip]);
    await pool.query(`INSERT INTO growth_event(type,account_id,video_id,clip_id,guest_pack_id,ip_prefix,day)
      VALUES('download',$1,$2,$3,$4,'192.0.2.0/24','2026-09-24')`, [account, video, clip, pack]);
    await pool.query(`INSERT INTO session(account_id,cookie_token_hash,ip_prefix,expires_at)
      VALUES($1,$2,'192.0.2.0/24',$3)`, [account, randomUUID(), new Date(now.getTime() + 86400_000)]);
    return { account, video, clip, pack, keys };
  }
  const memoryStorage = (): RetentionStorage => ({ delete: vi.fn(async () => {}), erasePrefix: vi.fn(async () => {}) });
  it('immediate erasing, revoked guests and sessions; concurrent repeat cannot extend deadline', async () => {
    const f = await fixture(), service = new ErasureService(pool, () => now);
    const results = await Promise.allSettled([service.request(f.account, { confirm: true }), service.request(f.account, { confirm: true })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await pool.query('SELECT status,erase_deadline FROM account WHERE id=$1', [f.account])).rows[0]).toEqual({ status: 'erasing', erase_deadline: new Date(now.getTime() + 72 * 3600_000) });
    expect((await pool.query('SELECT revoked_at FROM guest_pack WHERE id=$1', [f.pack])).rows[0].revoked_at).toEqual(now);
    expect((await pool.query('SELECT revoked_at FROM session WHERE account_id=$1', [f.account])).rows[0].revoked_at).toEqual(now);
  });
  it('failure remains erasing with rows; retry completes and anonymizes events without losing counts', async () => {
    const f = await fixture(); await new ErasureService(pool, () => now).request(f.account, { confirm: true });
    const store = memoryStorage(); store.erasePrefix = vi.fn(async () => { throw new Error('S3 unavailable'); });
    const later = new Date(now.getTime() + ERASURE_QUIET_MS);
    await expect(retentionTick(pool, store, later)).rejects.toThrow();
    expect((await pool.query('SELECT status FROM account WHERE id=$1', [f.account])).rows[0].status).toBe('erasing');
    expect((await pool.query('SELECT id FROM video WHERE id=$1', [f.video])).rowCount).toBe(1);
    await pool.query("INSERT INTO account(email,password_hash) VALUES($1,'other')", [`${f.account}@deleted.invalid`]);
    await retentionTick(pool, memoryStorage(), later);
    expect((await pool.query('SELECT status,password_hash,email FROM account WHERE id=$1', [f.account])).rows[0]).toEqual({ status: 'deleted', password_hash: '', email: `deleted:${f.account}` });
    expect((await pool.query('SELECT id FROM video WHERE id=$1', [f.video])).rowCount).toBe(0);
    expect((await pool.query('SELECT account_id,video_id,clip_id,guest_pack_id,ip_prefix FROM growth_event')).rows).toEqual([
      { account_id: null, video_id: null, clip_id: null, guest_pack_id: null, ip_prefix: null },
    ]);
  });
  it('growth_event FK survives direct clip deletion with SET NULL', async () => {
    const f = await fixture();
    await pool.query('DELETE FROM guest_pack_clip WHERE clip_id=$1', [f.clip]);
    await pool.query('DELETE FROM clip_link WHERE clip_id=$1', [f.clip]);
    await pool.query('DELETE FROM clip WHERE id=$1', [f.clip]);
    expect((await pool.query('SELECT clip_id FROM growth_event')).rows).toEqual([{ clip_id: null }]);
  });
  it('free expiry, partial stalled video, paid and young exclusions; guest expiry and refused backlog', async () => {
    const free = await fixture(), stalled = await fixture(), paid = await fixture('paid'), young = await fixture('free', now);
    await pool.query("UPDATE video SET status='failed',failure_reason='stalled' WHERE id=$1", [stalled.video]);
    await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status,failure_reason,created_at)
      SELECT $1,gen_random_uuid()::text,'upload',100,'failed','refused_user_uploads',$2 FROM generate_series(1,205)`,
    [free.account, new Date(now.getTime() - 24 * 3600_000)]);
    await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,status,failure_reason,created_at)
      VALUES($1,'young-refusal','upload',100,'failed','refused_user_uploads',$2)`, [free.account, now]);
    const storage = memoryStorage(); await retentionTick(pool, storage, now, 100);
    expect(storage.delete).toHaveBeenCalledWith(free.keys[1]); expect(storage.delete).toHaveBeenCalledWith(stalled.keys[1]);
    expect(storage.delete).not.toHaveBeenCalledWith(paid.keys[1]); expect(storage.delete).not.toHaveBeenCalledWith(young.keys[1]);
    expect((await pool.query('SELECT object_key FROM clip WHERE id=$1', [free.clip])).rows[0].object_key).toBeNull();
    expect((await pool.query('SELECT revoked_at FROM guest_pack WHERE id=$1', [free.pack])).rows[0].revoked_at).toEqual(now);
    expect((await pool.query("SELECT count(*)::int n FROM video WHERE failure_reason='refused_user_uploads'")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname=$1 AND indexname='video_refused_upload_retention'", [schema])).rows[0].indexdef).toContain('created_at');
  });
  it.skipIf(!endpoint)('MinIO HEAD confirms all account objects absent; revoked guests precede first deletion', async () => {
    const f = await fixture();
    const bucket = `erasure-${randomBytes(8).toString('hex')}`;
    const ctx = { client: s3.createS3Client(loadS3Config(process.env)), bucket };
    const orphan = `clips/paid/${f.video}/${randomUUID()}.mp4`;
    const keys = [...f.keys, orphan];
    await ctx.client.send(new CreateBucketCommand({ Bucket: bucket }));
    try {
      for (const key of keys) await ctx.client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'private data' }));
      const uploadId = await s3.initiateMultipartUpload(ctx, `videos/${f.account}/${f.video}/unfinished.mp4`);
      expect(uploadId).toBeTruthy();
      for (const key of keys) expect(await s3.headObject(ctx, key)).toBe(12n);
      await new ErasureService(pool, () => now).request(f.account, { confirm: true });
      await retentionTick(pool, {
        delete: key => s3.deleteObject(ctx, key),
        erasePrefix: async prefix => {
          expect((await pool.query('SELECT revoked_at FROM guest_pack WHERE id=$1', [f.pack])).rows[0].revoked_at).toEqual(now);
          await s3.erasePrefix(ctx, prefix);
        },
      }, new Date(now.getTime() + ERASURE_QUIET_MS));
      for (const key of keys) await expect(s3.headObject(ctx, key)).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      expect((await pool.query('SELECT status FROM account WHERE id=$1', [f.account])).rows[0].status).toBe('deleted');
    } finally {
      for (const prefix of [`videos/${f.account}/`, `clips/free/${f.video}/`, `clips/paid/${f.video}/`, `thumbs/${f.video}/`]) await s3.erasePrefix(ctx, prefix);
      await ctx.client.send(new DeleteBucketCommand({ Bucket: bucket })); ctx.client.destroy();
    }
  });
});
