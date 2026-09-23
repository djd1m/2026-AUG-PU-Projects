import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, type Pool } from '../packages/db/src/index';
import { CreateBucketCommand, DeleteBucketCommand, GetBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { migrate } from '../packages/db/src/migrate';
import { transaction, checkAndConsumeQuota, refundUploadSlot } from '../packages/db/src/quota';
import { loadLimits, loadS3Config, loadS3PublicEndpoint } from '../packages/shared/src/config';
import { moscowDay } from '../packages/shared/src/upload';
import * as s3 from '../packages/s3/src';
import { VideoService, type UploadStorage, type UploadData } from '../apps/web/src/server/video';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';

const dbUrl = process.env.DATABASE_URL;
const limits = loadLimits(environment());
const now = new Date('2026-09-22T10:00:00Z');
const body = { declared_bytes: 24, filename: 'выпуск.mp4', source: 'upload' };
const goodFile = Buffer.alloc(24); goodFile.writeUInt32BE(24); goodFile.write('ftyp', 4); goodFile.write('isom', 8);

describe.skipIf(!dbUrl)('PostgreSQL: конкурентная квота', () => {
  let pool: Pool;
  const schema = `quota_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Нужна отдельная БД *_test');
    await ensureTestDatabase(dbUrl);
    pool = createPool(dbUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  const charge = (account: string, reason: 'upload' | 'minutes' | 'llm', n: number, date = now) =>
    transaction(pool, (tx) => checkAndConsumeQuota(tx, limits, account, reason, n, date));
  const used = async (account: string, scope = 'user_uploads', day = moscowDay(now)) =>
    (await pool.query('SELECT used FROM quota_counter WHERE scope=$1 AND scope_key=$2 AND day=$3', [scope, account, day])).rows[0]?.used ?? 0;
  it('N параллельных первых списаний: ровно два granted, used=2', async () => {
    const account = randomUUID();
    const results = await Promise.all(Array.from({ length: 12 }, () => charge(account, 'upload', 1)));
    expect(results.filter((r) => r.granted)).toHaveLength(2); expect(await used(account)).toBe(2);
  });
  it('V2-R01: первый за сутки n>limit отвергнут; старый UPSERT воспроизводит дефект', async () => {
    const account = randomUUID();
    expect(await charge(account, 'upload', 3)).toEqual({ granted: false, scope: 'user_uploads' });
    expect(await used(account)).toBe(0);
    const old = await pool.query(`INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('user_uploads',$1,$2,3)
      ON CONFLICT(scope,scope_key,day) DO UPDATE SET used=quota_counter.used+3
      WHERE quota_counter.used+3<=2 RETURNING used`, [randomUUID(), moscowDay(now)]);
    expect(old.rows[0].used).toBe(3); // Контрольная мутация действительно проходит потолок.
  });
  it('Два ключа minutes атомарны: общий отказ откатывает персональный', async () => {
    await pool.query("INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('global_minutes','all',$1,600)", [moscowDay(now)]);
    const account = randomUUID();
    expect(await charge(account, 'minutes', 1)).toEqual({ granted: false, scope: 'global_minutes' });
    expect(await used(account, 'user_minutes')).toBe(0);
  });
  it('user_llm и global_llm списываются вместе, третий вызов отказан', async () => {
    const account = randomUUID();
    expect((await charge(account, 'llm', 1)).granted).toBe(true);
    expect((await charge(account, 'llm', 1)).granted).toBe(true);
    expect(await charge(account, 'llm', 1)).toEqual({ granted: false, scope: 'user_llm' });
    expect(await used('all', 'global_llm')).toBe(2);
  });
  it('Два возврата при остатке 1: ровно один возвращает слот; refused_* не возвращает', async () => {
    const account = randomUUID(); await charge(account, 'upload', 2);
    await pool.query("INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('user_upload_refunds',$1,$2,1)", [account, moscowDay(now)]);
    const results = await Promise.all(Array.from({ length: 2 }, () => transaction(pool, (tx) => refundUploadSlot(tx, limits, account, moscowDay(now), 'not_media', now))));
    expect(results.filter(Boolean)).toHaveLength(1); expect(await used(account)).toBe(1);
    expect(await used(account, 'user_upload_refunds')).toBe(2);
    expect(await transaction(pool, (tx) => refundUploadSlot(tx, limits, account, moscowDay(now), 'refused_user_minutes', now))).toBe(false);
    expect(await used(account)).toBe(1);
  });
  it('Чужая квота не блокирует аккаунт; московская полночь даёт новые сутки', async () => {
    const a = randomUUID(), b = randomUUID(); await charge(a, 'upload', 2);
    const [denied, granted] = await Promise.all([charge(a, 'upload', 1), charge(b, 'upload', 1)]);
    expect(denied.granted).toBe(false); expect(granted.granted).toBe(true);
    expect((await charge(a, 'upload', 2, new Date('2026-09-22T21:01:00Z'))).granted).toBe(true);
    expect(await used(a, 'user_uploads', '2026-09-23')).toBe(2);
  });
});

describe.skipIf(!dbUrl || !process.env.S3_ENDPOINT)('PostgreSQL + MinIO: полный серверный upload', () => {
  let pool: Pool, ctx: s3.StorageContext, storage: UploadStorage, service: VideoService;
  const queue = vi.fn(async (_id: string, _fence: number) => {});
  const schema = `upload_${randomBytes(8).toString('hex')}`;
  const keys = new Set<string>(); const uploads: { key: string; id: string }[] = [];
  beforeAll(async () => {
    if (process.env.NODE_ENV !== 'test' || !dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Только тестовое окружение');
    const config = { ...loadS3Config(process.env), publicEndpoint: loadS3PublicEndpoint(process.env) };
    if (!config.bucket.endsWith('-test')) throw new Error('Только бакет *-test');
    await ensureTestDatabase(dbUrl);
    pool = createPool(dbUrl, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
    // Отдельный новый бакет гарантирует отсутствие lifecycle, не меняя общий бакет стенда.
    ctx = { client: s3.createS3Client(config), bucket: `n5-upload-${randomBytes(8).toString('hex')}-test` };
    await ctx.client.send(new CreateBucketCommand({ Bucket: ctx.bucket }));
    storage = {
      initiate: vi.fn(async (key) => { keys.add(key); const id = await s3.initiateMultipartUpload(ctx, key); uploads.push({ key, id }); return id; }),
      sign: (key, id, count, date) => s3.signParts(ctx, key, id, count, date),
      list: (key, id) => s3.listUploadedParts(ctx, key, id),
      complete: (key, id, parts) => s3.completeMultipartUpload(ctx, key, id, parts),
      head: (key) => s3.headObject(ctx, key), bytes: (key) => s3.getObjectBytes(ctx, key),
      abort: (key, id) => s3.abortMultipartUpload(ctx, key, id), delete: (key) => s3.deleteObject(ctx, key),
    };
    service = new VideoService(pool, limits, storage, queue); // Реальное время для SigV4.
  });
  afterAll(async () => {
    if (ctx) {
      for (const u of uploads) await s3.abortMultipartUpload(ctx, u.key, u.id);
      for (const key of keys) await s3.deleteObject(ctx, key);
      await ctx.client.send(new DeleteBucketCommand({ Bucket: ctx.bucket }));
      ctx.client.destroy();
    }
    if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
  });
  async function account() {
    return (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'test-hash') RETURNING id", [`${randomUUID()}@example.invalid`])).rows[0].id as string;
  }
  async function count(id: string, scope = 'user_uploads') {
    return (await pool.query('SELECT used FROM quota_counter WHERE scope=$1 AND scope_key=$2 AND day=$3', [scope, id, moscowDay(new Date())])).rows[0]?.used ?? 0;
  }
  async function put(upload: UploadData, bytes: Uint8Array = goodFile) {
    const response = await fetch(upload.parts[0]!.url, { method: 'PUT', body: Buffer.from(bytes) });
    expect(response.status, await response.clone().text()).toBe(200);
    const etag = response.headers.get('etag'); expect(etag).toBeTruthy();
    return { video_id: upload.video_id, parts: [{ part_number: 1, etag: etag! }] };
  }
  it('N concurrent video.create: 2 uploading, остальные failed/refused; S3 вызван только дважды', async () => {
    const id = await account(); const before = vi.mocked(storage.initiate).mock.calls.length;
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.create(id, randomUUID(), body)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'refused', details: { scope: 'user_uploads' } });
    expect(await count(id)).toBe(2); expect(vi.mocked(storage.initiate).mock.calls.length - before).toBe(2);
    expect((await pool.query("SELECT id FROM video WHERE account_id=$1 AND status='uploading'", [id])).rowCount).toBe(2);
  });
  it('Два одинаковых ключа: одна строка, одно списание, буквально одинаковые ссылки', async () => {
    const id = await account(), key = randomUUID();
    const [a, b] = await Promise.all([service.create(id, key, body), service.create(id, key, body)]);
    expect(a).toEqual(b); expect(await count(id)).toBe(1);
    expect((await pool.query('SELECT id FROM video WHERE account_id=$1', [id])).rowCount).toBe(1);
  });
  it('Отказ повторного ключа остаётся отказом без новых S3 вызовов', async () => {
    const id = await account(); await service.create(id, randomUUID(), body); await service.create(id, randomUUID(), body);
    const key = randomUUID(), before = vi.mocked(storage.initiate).mock.calls.length;
    for (let i = 0; i < 2; i++) await expect(service.create(id, key, body)).rejects.toMatchObject({ code: 'refused' });
    expect(vi.mocked(storage.initiate).mock.calls.length).toBe(before); expect(await count(id)).toBe(2);
  });
  it('RI-001: бакет без lifecycle → подписанный PUT → Complete → HEAD → Range → queued', async () => {
    await expect(ctx.client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: ctx.bucket })))
      .rejects.toMatchObject({ name: 'NoSuchLifecycleConfiguration' });
    const id = await account(), upload = await service.create(id, randomUUID(), body);
    queue.mockImplementationOnce(async (videoId) => {
      expect((await pool.query('SELECT status FROM video WHERE id=$1', [videoId])).rows[0].status).toBe('queued');
    });
    expect(await service.complete(id, await put(upload))).toEqual({ video_id: upload.video_id, status: 'queued' });
    expect(await count(id, 'user_minutes')).toBe(0);
    expect(queue).toHaveBeenCalledWith(upload.video_id, 1);
  });
  it('HEAD повторно ловит превышение и удаляет реальный объект; failed+refund сохранены', async () => {
    const id = await account(), upload = await service.create(id, randomUUID(), body), input = await put(upload);
    // Подменён только размер HEAD: 2 ГБ тестовых данных не выделяем. S3 complete/delete настоящие.
    const oversized = new VideoService(pool, limits, { ...storage, head: async () => 2_000_000_001n }, queue);
    await expect(oversized.complete(id, input)).rejects.toMatchObject({ status: 422, details: { reason: 'too_large' } });
    expect(await count(id)).toBe(0); expect(await count(id, 'user_upload_refunds')).toBe(1);
    const row = (await pool.query('SELECT status, failure_reason, object_key FROM video WHERE id=$1', [upload.video_id])).rows[0];
    expect(row).toMatchObject({ status: 'failed', failure_reason: 'too_large' });
    await expect(storage.head(row.object_key)).rejects.toMatchObject({ name: 'NotFound' });
  });
  it('Файл больше 10 MiB идёт двумя прямыми частями; размер после HEAD совпадает', async () => {
    const id = await account(), file = Buffer.alloc(11 * 1024 * 1024); goodFile.copy(file);
    const upload = await service.create(id, randomUUID(), { ...body, declared_bytes: file.length });
    expect(upload.parts).toHaveLength(2);
    const parts = [];
    for (const part of upload.parts) {
      const start = (part.part_number - 1) * upload.part_size;
      const response = await fetch(part.url, { method: 'PUT', body: file.subarray(start, start + upload.part_size) });
      expect(response.status).toBe(200); parts.push({ part_number: part.part_number, etag: response.headers.get('etag')! });
    }
    expect(await service.complete(id, { video_id: upload.video_id, parts })).toMatchObject({ status: 'queued' });
    expect(Number((await pool.query('SELECT actual_bytes FROM video WHERE id=$1', [upload.video_id])).rows[0].actual_bytes)).toBe(file.length);
  });
  it('Чужой и отсутствующий id дают одинаковый 404, без S3', async () => {
    const owner = await account(), stranger = await account(), upload = await service.create(owner, randomUUID(), body);
    for (const video_id of [upload.video_id, randomUUID()]) {
      await expect(service.complete(stranger, { video_id, parts: [{ part_number: 1, etag: 'x' }] })).rejects.toMatchObject({ code: 'not_found', status: 404, message: 'Запись не найдена' });
    }
  });
  it('Два concurrent not_media при остатке возвратов 1: один возврат, две failed; повтор не возвращает снова', async () => {
    const id = await account();
    const [a, b] = await Promise.all([service.create(id, randomUUID(), body), service.create(id, randomUUID(), body)]);
    await pool.query("INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('user_upload_refunds',$1,$2,1)", [id, moscowDay(new Date())]);
    const inputs = await Promise.all([put(a, Buffer.from('not media')), put(b, Buffer.from('not media'))]);
    const results = await Promise.allSettled(inputs.map((input) => service.complete(id, input)));
    for (const r of results) { expect(r.status).toBe('rejected'); if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 422, details: { reason: 'not_media' } }); }
    expect(await count(id)).toBe(1); expect(await count(id, 'user_upload_refunds')).toBe(2);
    expect((await pool.query("SELECT id FROM video WHERE account_id=$1 AND status='failed' AND failure_reason='not_media'", [id])).rowCount).toBe(2);
    await expect(service.complete(id, inputs[0])).rejects.toMatchObject({ status: 422 }); expect(await count(id)).toBe(1);
  });
  it('Разные аккаунты concurrent: чужое исчерпание не закрывает добросовестного', async () => {
    const a = await account(), b = await account();
    await service.create(a, randomUUID(), body); await service.create(a, randomUUID(), body);
    const results = await Promise.allSettled([service.create(a, randomUUID(), body), service.create(b, randomUUID(), body)]);
    expect(results[0]!.status).toBe('rejected'); expect(results[1]!.status).toBe('fulfilled');
  });
  it('Redis failure after commit: повтор завершает постановку без второго S3 complete', async () => {
    const id = await account(), upload = await service.create(id, randomUUID(), body), input = await put(upload);
    queue.mockRejectedValueOnce(new Error('Redis offline'));
    await expect(service.complete(id, input)).rejects.toThrow('Redis offline');
    expect((await pool.query('SELECT status FROM video WHERE id=$1', [upload.video_id])).rows[0].status).toBe('queued');
    expect(await service.complete(id, input)).toMatchObject({ status: 'queued' }); expect(await count(id)).toBe(1);
  });
  it('Отказ подписания сохраняет upload_id и квоту для повтора без второго initiate', async () => {
    const id = await account(), abort = vi.fn(storage.abort);
    const broken = new VideoService(pool, limits, { ...storage, abort, sign: async () => { throw new Error('sign failure'); } }, queue);
    const key = randomUUID(), before = vi.mocked(storage.initiate).mock.calls.length;
    await expect(broken.create(id, key, body)).rejects.toThrow('sign failure');
    expect(await count(id)).toBe(1); expect((await pool.query('SELECT id FROM video WHERE account_id=$1', [id])).rowCount).toBe(1);
    expect(abort).not.toHaveBeenCalled();
    await expect(service.create(id, key, body)).resolves.toHaveProperty('upload_id');
    expect(vi.mocked(storage.initiate).mock.calls.length - before).toBe(1);
  });
});
