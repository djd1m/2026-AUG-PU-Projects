import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { transaction, checkAndConsumeQuota, refundUploadSlot } from '../packages/db/src/quota';
import { loadLimits } from '../packages/shared/src/config';
import { moscowDay } from '../packages/shared/src/upload';
import { VideoService, type UploadStorage } from '../apps/web/src/server/video';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
const dbUrl = process.env.DATABASE_URL;
const limits = loadLimits(environment()), now = new Date('2026-09-22T20:59:00Z');
const input = { declared_bytes: 24, filename: 'a.mp4', source: 'upload' };
const valid = Buffer.alloc(24); valid.writeUInt32BE(24); valid.write('ftyp', 4); valid.write('isom', 8);
function storage(): UploadStorage {
  return { initiate: vi.fn(async () => randomUUID()), list: vi.fn(async () => []),
    sign: vi.fn(async (_key, _id, numbers, time) => (typeof numbers === 'number' ? Array.from({ length: numbers }, (_, i) => i + 1) : numbers)
      .map((part_number: number) => ({ part_number, url: `https://test.invalid/${part_number}`, expires_at: new Date(time.getTime() + 900000).toISOString() }))),
    complete: vi.fn(async () => {}), head: vi.fn(async () => 24n), bytes: vi.fn(async () => valid),
    abort: vi.fn(async () => {}), delete: vi.fn(async () => {}) };
}
function barrier(count: number) {
  let entered = 0, ready!: () => void, release!: () => void;
  const all = new Promise<void>((resolve) => { ready = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { all, release, hold: async () => { if (++entered === count) ready(); await wait; } };
}
describe.skipIf(!dbUrl)('RU fixes: real PostgreSQL', () => {
  let pool: Pool, inspector: Pool;
  const schema = `fix_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!dbUrl || !new URL(dbUrl).pathname.endsWith('_test')) throw new Error('Only *_test database');
    await ensureTestDatabase(dbUrl);
    pool = new Pool({ connectionString: dbUrl, max: 10, connectionTimeoutMillis: 1000,
      application_name: schema, options: `-c search_path=${schema},public` });
    inspector = new Pool({ connectionString: dbUrl, max: 1 });
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  afterAll(async () => {
    if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); }
    if (inspector) await inspector.end();
  });
  const account = async () => (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'hash') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id as string;
  const used = async (id: string, scope = 'user_uploads', day = moscowDay(now)) =>
    (await pool.query('SELECT used FROM quota_counter WHERE scope=$1 AND scope_key=$2 AND day=$3', [scope, id, day])).rows[0]?.used ?? 0;
  const service = (s = storage()) => new VideoService(pool, limits, s, async () => {}, () => now);
  const completion = (video_id: string) => ({ video_id, parts: [{ part_number: 1, etag: 'a' }] });

  it.each(['initiate', 'sign', 'complete', 'head', 'bytes'] as const)('RU-002: 1 and 10 pending %s leave pool max:10 free', async (operation) => {
    for (const n of [1, 10]) {
      const s = storage(), run = service(s), ids = await Promise.all(Array.from({ length: n }, account));
      const uploads = ['complete', 'head', 'bytes'].includes(operation) ? await Promise.all(ids.map((id) => run.create(id, randomUUID(), input))) : [];
      const gate = barrier(n), original = s[operation];
      const held = vi.spyOn(s, operation).mockImplementation((async (...args: never[]) => {
        await gate.hold(); return (original as (...args: never[]) => Promise<unknown>)(...args);
      }) as never);
      const calls = ids.map((id, i) => uploads.length ? run.complete(id, completion(uploads[i]!.video_id)) : run.create(id, randomUUID(), input));
      const done = Promise.allSettled(calls);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([gate.all, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Storage calls did not start')), 2500); })]);
        const states = await inspector.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction'", [schema]);
        expect(states.rows[0].n).toBe(0);
        const start = performance.now(); expect((await pool.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
        const elapsed = performance.now() - start;
        console.log(JSON.stringify({ operation, pending: n, idle_in_transaction: states.rows[0].n, unrelated_select_ms: elapsed }));
        expect(elapsed).toBeLessThan(500);
      } finally { clearTimeout(timer); gate.release(); await done; held.mockRestore(); }
      expect((await done).every((result) => result.status === 'fulfilled')).toBe(true);
    }
  });
  it('RU-001: storage failure preserves file and same-key retry reaches queued', async () => {
    const s = storage(), run = service(s), id = await account(), key = randomUUID();
    const upload = await run.create(id, key, input);
    vi.mocked(s.complete).mockRejectedValueOnce(new Error('timeout'));
    vi.mocked(s.head).mockRejectedValueOnce(new Error('not yet assembled'));
    await expect(run.complete(id, completion(upload.video_id))).rejects.toMatchObject({ status: 503 });
    expect((await pool.query('SELECT status,failure_reason FROM video WHERE id=$1', [upload.video_id])).rows[0]).toEqual({ status: 'uploading', failure_reason: null });
    expect(s.abort).not.toHaveBeenCalled(); expect(s.delete).not.toHaveBeenCalled();
    expect((await run.create(id, key, input)).video_id).toBe(upload.video_id);
    expect(await run.complete(id, completion(upload.video_id))).toMatchObject({ status: 'queued' });
    expect(await used(id)).toBe(1);
  });
  it('RU-002: concurrent finalizers refund one time, and cleanup errors retain 422', async () => {
    const s = storage(), run = service(s), id = await account();
    const upload = await run.create(id, randomUUID(), input);
    vi.mocked(s.bytes).mockResolvedValue(Buffer.from('garbage'));
    vi.mocked(s.abort).mockRejectedValue(new Error('offline'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const outcomes = await Promise.allSettled(Array.from({ length: 10 }, () => run.complete(id, completion(upload.video_id))));
      for (const r of outcomes) { expect(r.status).toBe('rejected'); if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 422, details: { reason: 'not_media' } }); }
      expect(s.delete).toHaveBeenCalledTimes(10); expect(log).toHaveBeenCalled();
      expect(await used(id)).toBe(0); expect(await used(id, 'user_upload_refunds')).toBe(1);
    } finally { log.mockRestore(); }
  });
  it('RU-003: resume lists completed ETags and signs only missing numbers', async () => {
    const s = storage(), run = service(s), id = await account(), key = randomUUID();
    const body = { ...input, declared_bytes: 30_000_000 };
    const first = await run.create(id, key, body);
    vi.mocked(s.list).mockResolvedValue([{ part_number: 1, etag: 'saved' }]);
    await pool.query("UPDATE video SET upload_parts='[]' WHERE id=$1", [first.video_id]);
    const resumed = await run.create(id, key, body);
    expect(resumed.completed_parts).toEqual([{ part_number: 1, etag: 'saved' }]);
    expect(resumed.parts.map((p) => p.part_number)).toEqual([2, 3]);
    expect(vi.mocked(s.sign).mock.calls.at(-1)?.[2]).toEqual([2, 3]);
    expect(s.initiate).toHaveBeenCalledTimes(1); expect(await used(id)).toBe(1);
  });
  it('RU-004: midnight refund uses upload day; empty decrement consumes no allowance', async () => {
    const id = await account(), tomorrow = new Date('2026-09-22T21:01:00Z');
    await transaction(pool, (tx) => checkAndConsumeQuota(tx, limits, id, 'upload', 1, now));
    await transaction(pool, (tx) => checkAndConsumeQuota(tx, limits, id, 'upload', 2, tomorrow));
    expect(await transaction(pool, (tx) => refundUploadSlot(tx, limits, id, moscowDay(now), 'not_media', tomorrow))).toBe(true);
    expect(await used(id)).toBe(0); expect(await used(id, 'user_upload_refunds')).toBe(1);
    expect(await used(id, 'user_upload_refunds', moscowDay(tomorrow))).toBe(0);
    expect(await used(id, 'user_uploads', moscowDay(tomorrow))).toBe(2);
    const empty = await account();
    expect(await transaction(pool, (tx) => refundUploadSlot(tx, limits, empty, moscowDay(now), 'not_media', now))).toBe(false);
    expect(await used(empty, 'user_upload_refunds')).toBe(0);
  });
  it('RU-009: lost initiation response keeps a durable key and retries without charging twice', async () => {
    const s = storage(), run = service(s), id = await account(), key = randomUUID();
    vi.mocked(s.initiate).mockRejectedValueOnce(new Error('lost UploadId'));
    await expect(run.create(id, key, input)).rejects.toThrow('lost UploadId');
    expect((await pool.query('SELECT status,upload_id,object_key FROM video WHERE account_id=$1', [id])).rows[0])
      .toMatchObject({ status: 'uploading', upload_id: null, object_key: expect.stringContaining(`videos/${id}/`) });
    expect(s.abort).not.toHaveBeenCalled(); // Нельзя выдумать неизвестный UploadId.
    await expect(run.create(id, key, input)).resolves.toHaveProperty('upload_id');
    expect(await used(id)).toBe(1);
  });
});
