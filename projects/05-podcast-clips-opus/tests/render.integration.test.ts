import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { leaseAttempt, type Attempt } from '../packages/db/src/attempts';
import { getRenderInput, publishRenderResult, retryRender, setRenderDeferred } from '../packages/db/src/render';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
const url = process.env.DATABASE_URL;
describe.skipIf(!url)('Render PostgreSQL fences, publication and completion', () => {
  let pool: Pool;
  const schema = `render_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна БД *_test');
    await ensureTestDatabase(url);
    pool = new Pool({ connectionString: url, max: 12, options: `-c search_path=${schema},public` });
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account CASCADE'); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture(count = 1) {
    const account = (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'test') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id as string;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,duration_seconds,clips_total)
      VALUES ($1,$2,'upload',100,100,'source','rendering',120,$3) RETURNING id`, [account, randomUUID(), count])).rows[0].id as string;
    await pool.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments)
      VALUES ($1,'ru',120,1,'[{"word":"Привет","start":0,"end":1}]','[]')`, [video]);
    const attempts: Attempt[] = [];
    for (let i = 1; i <= count; i++) {
      const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
        VALUES ($1,$2,0,20,'Клип','queued',true) RETURNING id`, [video, i])).rows[0].id as string;
      await pool.query('INSERT INTO clip_link(clip_id,code) VALUES ($1,$2)', [clip, randomBytes(5).toString('hex')]);
      attempts.push((await leaseAttempt(pool, video, 'render', 1, clip))!);
    }
    return { account, video, attempts, attempt: attempts[0]! };
  }
  const output = { object_key: 'clip', thumbnail_key: 'thumb', bytes: 10, watermarked: true };
  it('MANDATORY same fence delivered concurrently: exactly one result UPDATE, one publish, stale audit', async () => {
    const { attempt } = await fixture(); const publish = vi.fn(async () => 10);
    const audit = vi.spyOn(console, 'info');
    try {
      const results = await Promise.all([1, 2].map(() => publishRenderResult(pool, attempt, output, publish)));
      expect(results.sort()).toEqual([false, true]); expect(publish).toHaveBeenCalledTimes(1);
      expect(audit).toHaveBeenCalledWith(expect.stringContaining('stale_attempt_result'));
      expect((await pool.query('SELECT status FROM clip WHERE id=$1', [attempt.clip_id])).rows[0].status).toBe('done');
    } finally { audit.mockRestore(); }
  });
  it('old fence cannot overwrite/delete canonical objects or resurrect terminal video', async () => {
    const { attempt } = await fixture(); const next = (await retryRender(pool, attempt, 'ffmpeg_failed'))!;
    const publish = vi.fn(async () => 10);
    expect(await publishRenderResult(pool, attempt, output, publish)).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(await publishRenderResult(pool, next, output, publish)).toBe(true);
    expect(await publishRenderResult(pool, attempt, output, publish)).toBe(false);
  });
  it('publication locks out retry until its acceptance; next lease cannot replace done clip', async () => {
    const { attempt } = await fixture();
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { entered = r; });
    const publication = publishRenderResult(pool, attempt, output, async () => { entered(); await blocked; return 10; });
    await started;
    const retry = retryRender(pool, attempt, 'ffmpeg_timeout'); release();
    expect(await publication).toBe(true); expect(await retry).toBeNull();
  });
  it('siblings use clip fence, mixed terminal outcome finishes video with available clips', async () => {
    const f = await fixture(2);
    expect(await getRenderInput(pool, f.attempt)).not.toBeNull();
    expect(await publishRenderResult(pool, f.attempt, output, async () => 10)).toBe(true);
    expect((await pool.query('SELECT status,clips_done FROM video WHERE id=$1', [f.video])).rows[0]).toMatchObject({ status: 'rendering', clips_done: 1 });
    const retry = (await retryRender(pool, f.attempts[1]!, 'ffmpeg_failed'))!;
    expect(await retryRender(pool, retry, 'ffmpeg_failed')).toBeNull();
    expect((await pool.query('SELECT status,clips_done FROM video WHERE id=$1', [f.video])).rows[0]).toMatchObject({ status: 'done', clips_done: 1 });
  });
  it('disk deferral heartbeats and can resume, all failed is render_failed', async () => {
    const f = await fixture(); await pool.query("UPDATE video SET updated_at=now()-interval '1 hour' WHERE id=$1", [f.video]);
    expect(await setRenderDeferred(pool, f.attempt, true)).toBe(true);
    expect((await pool.query('SELECT status,wait_reason FROM job_attempt WHERE video_id=$1', [f.video])).rows[0]).toMatchObject({ status: 'deferred', wait_reason: 'no_disk' });
    expect((await pool.query("SELECT updated_at > now()-interval '1 minute' fresh FROM video WHERE id=$1", [f.video])).rows[0].fresh).toBe(true);
    expect(await setRenderDeferred(pool, f.attempt, false)).toBe(true);
    const next = (await retryRender(pool, f.attempt, 'ffmpeg_timeout'))!;
    expect(await retryRender(pool, next, 'ffmpeg_timeout')).toBeNull();
    expect((await pool.query('SELECT status,failure_reason FROM video WHERE id=$1', [f.video])).rows[0]).toMatchObject({ status: 'failed', failure_reason: 'render_failed' });
  });
  it('link inserted after render attempt is rejected by the database', async () => {
    const f = await fixture();
    await pool.query('DELETE FROM clip_link WHERE clip_id=$1', [f.attempt.clip_id]);
    await expect(leaseAttempt(pool, f.video, 'render', 1, f.attempt.clip_id)).rejects.toThrow(/clip_link/);
  });
  it('upload failure does not accept clip or delete canonical objects', async () => {
    const { attempt } = await fixture();
    await expect(publishRenderResult(pool, attempt, output, async () => { throw new Error('upload'); })).rejects.toThrow('upload');
    expect((await pool.query('SELECT status FROM clip WHERE id=$1', [attempt.clip_id])).rows[0].status).toBe('rendering');
  });
});
