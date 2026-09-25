import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, transaction, type Pool, type Attempt } from '../packages/db/src';
import { migrate } from '../packages/db/src/migrate';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { loadLimits } from '../packages/shared/src/config';
import { MUSIC_CATALOG } from '../packages/shared/src/music-catalog';
import { environment } from './fixtures/environment';
import { ClipMusicService } from '../apps/web/src/server/clip-music';
import { ScreenService } from '../apps/web/src/server/screen';
import { watchdogTick } from '../apps/web/src/server/watchdog';
import { STALLED_AFTER_MS } from '../packages/queue/src';
import { lockRender, getRenderInput, publishRenderResult, retryRender, setRenderDeferred, saveCutPlan, saveLoudnessMedian } from '../packages/db/src/render';
const url = process.env.DATABASE_URL;
describe.skipIf(!url)('clip music choice / real PostgreSQL', () => {
  let pool: Pool;
  const schema = `music_choice_${randomBytes(8).toString('hex')}`;
  const now = new Date('2026-09-25T06:00:00Z'), track = MUSIC_CATALOG[1].id;
  const enqueue = vi.fn(async (_attempt: Attempt) => {});
  const limits = loadLimits(environment());
  const service = () => new ClipMusicService(pool, limits, enqueue, () => now);
  beforeAll(async () => {
    await ensureTestDatabase(url!); pool = createPool(url!, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account,quota_counter CASCADE'); enqueue.mockReset(); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture(accountId?: string) {
    const account = accountId ?? (await pool.query("INSERT INTO account(email,password_hash) VALUES($1,'test') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,
      duration_seconds,finished_at,clips_done,clips_total,music,compact) VALUES($1,$2,'upload',100,100,'source','done',120,$3,1,1,false,true) RETURNING id`,
    [account, randomUUID(), now])).rows[0].id;
    const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked,object_key,thumbnail_key,
      rendered_music_track_id,cut_plan) VALUES($1,1,0,20,'Клип','done',true,'old-paid-key','old-thumb','none','[[0,20]]') RETURNING id`, [video])).rows[0].id;
    await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2)', [clip, randomBytes(5).toString('hex')]);
    await pool.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments)
      VALUES($1,'ru',120,1,'[{"word":"Привет","start":0,"end":1}]','[]')`, [video]);
    return { account: account as string, video: video as string, clip: clip as string };
  }
  const chosen = (clip: string) => ({ clip_id: clip, track });
  async function job(clip: string) { return (await pool.query<Attempt>('SELECT * FROM job_attempt WHERE clip_id=$1 ORDER BY fence DESC LIMIT 1', [clip])).rows[0]!; }
  async function charge() { return Number((await pool.query("SELECT COALESCE(sum(used),0) AS used FROM quota_counter WHERE scope='user_rerenders'")).rows[0].used); }
  it('ownership, active account, state, expiry and equality reject before quota', async () => {
    const f = await fixture(), other = await fixture();
    for (const clip of [f.clip, randomUUID()]) await expect(service().setMusic(other.account, chosen(clip))).rejects.toMatchObject({ status: 404 });
    for (const choice of ['auto', 'none']) await expect(service().setMusic(f.account, { clip_id: f.clip, track: choice })).rejects.toMatchObject({ status: 409 });
    for (const bad of [{ ...chosen(f.clip), track: 'bogus' }, { ...chosen(f.clip), extra: true }]) await expect(service().setMusic(f.account, bad)).rejects.toMatchObject({ status: 422 });
    await pool.query("UPDATE clip SET status='rendering' WHERE id=$1", [f.clip]);
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE clip SET status='done',expires_at=$2 WHERE id=$1", [f.clip, now]);
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    await pool.query('UPDATE clip SET expires_at=NULL,object_key=NULL WHERE id=$1', [f.clip]);
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE clip SET object_key='old' WHERE id=$1", [f.clip]);
    await pool.query("UPDATE video SET status='failed' WHERE id=$1", [f.video]);
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE video SET status='done',finished_at=$2 WHERE id=$1", [f.video, new Date(now.getTime() - 72 * 3600_000)]);
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE account SET status='erasing' WHERE id=$1", [f.account]);
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 404 });
    expect(await charge()).toBe(0);
  });
  it('lease and all render gates accept done rerender, reject other fence; old file available', async () => {
    const f = await fixture(); await service().setMusic(f.account, chosen(f.clip)); const attempt = await job(f.clip);
    expect(attempt).toMatchObject({ rerender: true, attempt_no: 1 });
    expect(await transaction(pool, tx => lockRender(tx, attempt))).toBe(true);
    expect(await transaction(pool, tx => lockRender(tx, { ...attempt, fence: attempt.fence + 1 }))).toBe(false);
    expect(await transaction(pool, tx => lockRender(tx, { ...attempt, rerender: false }))).toBe(false);
    await pool.query('UPDATE clip SET render_fence=render_fence+10 WHERE id=$1', [f.clip]);
    expect(await transaction(pool, tx => lockRender(tx, attempt))).toBe(false);
    await pool.query('UPDATE clip SET render_fence=$2 WHERE id=$1', [f.clip, attempt.fence]);
    expect(await getRenderInput(pool, attempt)).toMatchObject({ music_track_id: track, render_version: 2, cut_plan: [[0, 20]] });
    await pool.query("UPDATE video SET status='failed' WHERE id=$1", [f.video]);
    expect(await setRenderDeferred(pool, attempt, true)).toBe(true);
    await pool.query("UPDATE video SET status='done' WHERE id=$1", [f.video]);
    expect(await saveCutPlan(pool, attempt, [[0, 5], [10, 20]])).toEqual([[0, 20]]);
    expect(await saveLoudnessMedian(pool, attempt, -22)).toBe(-22);
    expect((await new ScreenService(pool, () => now).clips(f.account, f.video)).clips[0]).toMatchObject({ status: 'done', available: true, rerendering: true });
    expect((await pool.query('SELECT object_key FROM clip WHERE id=$1', [f.clip])).rows[0].object_key).toBe('old-paid-key');
    await expect(service().setMusic(f.account, { clip_id: f.clip, track: MUSIC_CATALOG[2].id })).rejects.toMatchObject({ status: 409 });
    expect(await charge()).toBe(1);
  });
  it('two failed attempts preserve video/file and allow same choice again without quota refund', async () => {
    const f = await fixture(); await service().setMusic(f.account, chosen(f.clip));
    const first = await job(f.clip), second = await retryRender(pool, first, 'ffmpeg_failed');
    expect(second).toMatchObject({ rerender: true, attempt_no: 2 });
    expect(await retryRender(pool, second!, 'ffmpeg_timeout')).toBeNull();
    expect((await pool.query('SELECT status,object_key,music_track_id FROM clip WHERE id=$1', [f.clip])).rows[0]).toEqual({ status: 'done', object_key: 'old-paid-key', music_track_id: 'none' });
    expect((await pool.query('SELECT status,finished_at,clips_done FROM video WHERE id=$1', [f.video])).rows[0]).toEqual({ status: 'done', finished_at: now, clips_done: 1 });
    expect((await new ScreenService(pool, () => now).clips(f.account, f.video)).clips[0]).toMatchObject({ available: true, rerendering: false, rerender_failure: 'ffmpeg_timeout' });
    await service().setMusic(f.account, chosen(f.clip));
    expect((await job(f.clip)).series_no).toBe(first.series_no + 1); expect(await charge()).toBe(2);
  });
  it('concurrent choices for one clip lease only once and consume one slot', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([1, 2].map(() => service().setMusic(f.account, chosen(f.clip))));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await charge()).toBe(1);
    expect((await pool.query('SELECT count(*)::int n FROM job_attempt WHERE clip_id=$1', [f.clip])).rows[0].n).toBe(1);
  });
  it('publication cleans actual old keys after commit; failure is best effort; retention does not extend', async () => {
    const f = await fixture(); await service().setMusic(f.account, chosen(f.clip)); const attempt = await job(f.clip);
    const remove = vi.fn(async () => {
      expect((await pool.query('SELECT object_key FROM clip WHERE id=$1', [f.clip])).rows[0].object_key).toBe('new-v2');
      throw new Error('storage offline');
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await publishRenderResult(pool, attempt, { object_key: 'new-v2', thumbnail_key: 'thumb-v2', bytes: 5,
        watermarked: true, duration_seconds: 20, rendered_music_track_id: track }, async () => 5, remove)).toBe(true);
      expect(remove.mock.calls).toHaveLength(2); expect(remove).toHaveBeenCalledWith('old-paid-key'); expect(remove).toHaveBeenCalledWith('old-thumb');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('rerender_cleanup_failed'));
      expect((await pool.query('SELECT status,finished_at,clips_done FROM video WHERE id=$1', [f.video])).rows[0]).toEqual({ status: 'done', finished_at: now, clips_done: 1 });
      await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    } finally { log.mockRestore(); }
  });
  it('watchdog restores lost delivery and closes stalled rerender without touching video', async () => {
    const f = await fixture(); enqueue.mockRejectedValueOnce(new Error('queue offline'));
    await service().setMusic(f.account, chosen(f.clip)); const attempt = await job(f.clip);
    const recover = vi.fn(async () => {});
    expect((await watchdogTick(pool, recover, now))?.published).toBe(1);
    expect(recover).toHaveBeenCalledWith(expect.objectContaining({ fence: attempt.fence, rerender: true }), 0);
    await watchdogTick(pool, recover, new Date(now.getTime() + STALLED_AFTER_MS + 1));
    expect(await job(f.clip)).toMatchObject({ status: 'failed', failure_reason: 'stalled' });
    expect((await pool.query('SELECT status,object_key,music_track_id FROM clip WHERE id=$1', [f.clip])).rows[0]).toEqual({ status: 'done', object_key: 'old-paid-key', music_track_id: 'none' });
    expect((await pool.query('SELECT status,finished_at FROM video WHERE id=$1', [f.video])).rows[0]).toEqual({ status: 'done', finished_at: now });
  });
  it('queued 25 minutes then running 10 minutes remains alive; deferred refreshes attempt clock', async () => {
    const f = await fixture(); await service().setMusic(f.account, chosen(f.clip)); const attempt = await job(f.clip);
    await pool.query("UPDATE job_attempt SET started_at=now()-interval '25 minutes' WHERE clip_id=$1", [f.clip]);
    expect(await setRenderDeferred(pool, attempt, false)).toBe(true);
    const started = (await pool.query('SELECT started_at FROM job_attempt WHERE clip_id=$1', [f.clip])).rows[0].started_at;
    expect(Date.now() - started.getTime()).toBeLessThan(5000);
    await watchdogTick(pool, async () => {}, new Date(started.getTime() + 10 * 60_000));
    expect(await job(f.clip)).toMatchObject({ status: 'running' });
    await pool.query("UPDATE job_attempt SET started_at=now()-interval '25 minutes' WHERE clip_id=$1", [f.clip]);
    expect(await setRenderDeferred(pool, attempt, true)).toBe(true);
    await watchdogTick(pool, async () => {}, new Date(Date.now() + 10 * 60_000));
    expect(await job(f.clip)).toMatchObject({ status: 'deferred' });
  });
  it('published loudness skip persists and repeat refuses without charging quota', async () => {
    const f = await fixture(); await service().setMusic(f.account, chosen(f.clip)); const attempt = await job(f.clip);
    await publishRenderResult(pool, attempt, { object_key: 'new-v2.mp4', thumbnail_key: 'new-v2.jpg', bytes: 5,
      watermarked: true, duration_seconds: 20, rendered_music_track_id: 'none', music_skip_reason: 'gain_out_of_range' }, async () => 5);
    expect((await new ScreenService(pool, () => now).clips(f.account, f.video)).clips[0]).toMatchObject({
      rendered_music_track_id: 'none', music_skip_reason: 'gain_out_of_range', published_render_version: 2 });
    await expect(service().setMusic(f.account, chosen(f.clip))).rejects.toMatchObject({ status: 409 });
    expect(await charge()).toBe(1);
  });
  it('rejected version removes orphans but duplicate success and active retry keep their files', async () => {
    const f = await fixture(); await service().setMusic(f.account, chosen(f.clip)); const first = await job(f.clip);
    const output = { object_key: `clips/free/${f.video}/${f.clip}-v2.mp4`, thumbnail_key: `thumbs/${f.video}/${f.clip}-v2.jpg`, bytes: 5,
      watermarked: true, duration_seconds: 20, rendered_music_track_id: track };
    const remove = vi.fn(async () => {}), next = (await retryRender(pool, first, 'ffmpeg_failed'))!;
    expect(await publishRenderResult(pool, first, output, async () => 5, remove)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    expect(await publishRenderResult(pool, next, output, async () => 5, remove)).toBe(true);
    remove.mockClear();
    expect(await publishRenderResult(pool, first, output, async () => 5, remove)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    await service().setMusic(f.account, { clip_id: f.clip, track: 'none' }); const third = await job(f.clip);
    await retryRender(pool, third, 'watermark_geometry');
    const rejected = { ...output, object_key: output.object_key.replace('-v2', '-v3'), thumbnail_key: output.thumbnail_key.replace('-v2', '-v3') };
    expect(await publishRenderResult(pool, third, rejected, async () => 5, remove)).toBe(false);
    expect(remove.mock.calls).toEqual([[rejected.object_key], [rejected.thumbnail_key]]);
  });
  it.each([1, 2, 3, 4, 5])('25 concurrent clips consume exactly 20; run %s', async () => {
    const first = await fixture(), fixtures = [first];
    for (let i = 1; i < 25; i++) fixtures.push(await fixture(first.account));
    const result = await Promise.allSettled(fixtures.map(f => service().setMusic(f.account, chosen(f.clip))));
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(20);
    for (const failure of result.filter(r => r.status === 'rejected')) expect(failure.reason).toMatchObject({ status: 429 });
    expect(await charge()).toBe(20);
  });
});
