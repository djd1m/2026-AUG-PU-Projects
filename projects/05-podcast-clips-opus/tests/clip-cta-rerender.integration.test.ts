import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, type Pool, type Attempt } from '../packages/db/src';
import { migrate } from '../packages/db/src/migrate';
import { getRenderInput, retryRender } from '../packages/db/src/render';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { loadLimits } from '../packages/shared/src/config';
import { MUSIC_CATALOG } from '../packages/shared/src/music-catalog';
import { environment } from './fixtures/environment';
import { VideoCtaService } from '../apps/web/src/server/video-cta';
import { ClipMusicService } from '../apps/web/src/server/clip-music';
// Фича 27b clip-cta на настоящем PostgreSQL 16: пересборка ВСЕХ клипов записи при смене вида призыва —
// одна квота на N, отказ целиком при идущей сборке и при нехватке остатка, конкурентные прогоны.
const url = process.env.DATABASE_URL;
const YT = 'https://www.youtube.com/watch?v=ukZyNkgqVho';
describe.skipIf(!url)('video.setCta: пересборка клипов записи / real PostgreSQL', () => {
  let pool: Pool;
  const schema = `cta_rerender_${randomBytes(8).toString('hex')}`;
  const now = new Date('2026-09-25T06:00:00Z');
  const limits = loadLimits(environment()); // N5_LIMIT_USER_RERENDERS = 20
  const enqueue = vi.fn(async (_attempt: Attempt) => {});
  const cta = () => new VideoCtaService(pool, limits, enqueue, () => now);
  const music = () => new ClipMusicService(pool, limits, async () => {}, () => now);
  beforeAll(async () => {
    await ensureTestDatabase(url!); pool = createPool(url!, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account,quota_counter CASCADE'); enqueue.mockReset(); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture(clipCount: number, accountId?: string) {
    const account = accountId ?? (await pool.query("INSERT INTO account(email,password_hash) VALUES($1,'test') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,
      duration_seconds,finished_at,clips_done,clips_total,music) VALUES($1,$2,'upload',100,100,'source','done',120,$3,$4,$4,false) RETURNING id`,
    [account, randomUUID(), now, clipCount])).rows[0].id;
    const clips: string[] = [];
    for (let i = 1; i <= clipCount; i++) {
      const clip = (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked,object_key,thumbnail_key,
        rendered_music_track_id) VALUES($1,$2,0,20,'Клип','done',true,$3,'thumb','none') RETURNING id`, [video, i, `old-${i}`])).rows[0].id;
      await pool.query('INSERT INTO clip_link(clip_id,code) VALUES($1,$2)', [clip, randomBytes(5).toString('hex')]);
      clips.push(clip);
    }
    await pool.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments)
      VALUES($1,'ru',120,1,'[{"word":"Привет","start":0,"end":1}]','[]')`, [video]);
    return { account: account as string, video: video as string, clips };
  }
  const charge = async () => Number((await pool.query("SELECT COALESCE(sum(used),0) AS used FROM quota_counter WHERE scope='user_rerenders'")).rows[0].used);
  const attempts = async (video: string) => (await pool.query<Attempt & { rerender: boolean }>(
    "SELECT * FROM job_attempt WHERE video_id=$1 AND stage='render' ORDER BY fence", [video])).rows;
  const stored = async (video: string) => (await pool.query('SELECT cta_kind,cta_url FROM video WHERE id=$1', [video])).rows[0];
  const versions = async (video: string) => (await pool.query<{ render_version: number }>(
    'SELECT render_version FROM clip WHERE video_id=$1 ORDER BY "index"', [video])).rows.map(r => r.render_version);
  const setWatch = (f: { account: string; video: string }) => cta().setCta(f.account, { video_id: f.video, cta_kind: 'watch_full', cta_url: YT });
  const preconsume = (account: string, used: number) => pool.query(`INSERT INTO quota_counter(scope,scope_key,day,used)
    VALUES('user_rerenders',$1,'2026-09-25',$2)`, [account, used]);

  it('смена вида: все готовые клипы одной серией, квота одним списанием на N, воркер видит вид, но не адрес', async () => {
    const f = await fixture(3);
    await expect(setWatch(f)).resolves.toEqual({ video_id: f.video, cta_kind: 'watch_full', cta_url: YT, rerendering: 3 });
    expect(await charge()).toBe(3);
    const jobs = await attempts(f.video);
    expect(jobs).toHaveLength(3);
    expect(new Set(jobs.map(j => j.series_no)).size).toBe(1);
    expect(jobs.every(j => j.rerender && j.status === 'running' && j.attempt_no === 1)).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(await versions(f.video)).toEqual([2, 2, 2]);
    expect(await stored(f.video)).toEqual({ cta_kind: 'watch_full', cta_url: YT });
    const input = await getRenderInput(pool, jobs[0]!);
    expect(input).toMatchObject({ cta_kind: 'watch_full', render_version: 2 });
    expect(input).not.toHaveProperty('cta_url');
    // Клипы остаются done со старыми файлами до публикации новых.
    expect((await pool.query("SELECT count(*)::int n FROM clip WHERE video_id=$1 AND status='done' AND object_key LIKE 'old-%'", [f.video])).rows[0].n).toBe(3);
  });

  it('смена только адреса и повтор того же вида — без пересборки и без квоты', async () => {
    const f = await fixture(2);
    await setWatch(f); enqueue.mockReset();
    await pool.query("UPDATE job_attempt SET status='succeeded' WHERE video_id=$1", [f.video]);
    await expect(cta().setCta(f.account, { video_id: f.video, cta_kind: 'watch_full', cta_url: 'https://rutube.ru/video/1/' }))
      .resolves.toMatchObject({ rerendering: 0 });
    expect(await charge()).toBe(2); expect(await attempts(f.video)).toHaveLength(2); expect(enqueue).not.toHaveBeenCalled();
    expect(await stored(f.video)).toEqual({ cta_kind: 'watch_full', cta_url: 'https://rutube.ru/video/1/' });
  });

  it('уже идёт смена музыки у одного клипа — 409 целиком: ни призыва, ни квоты, ни попыток', async () => {
    const f = await fixture(3);
    await music().setMusic(f.account, { clip_id: f.clips[1], track: MUSIC_CATALOG[1].id });
    await expect(setWatch(f)).rejects.toMatchObject({ status: 409 });
    expect(await charge()).toBe(1);
    expect(await attempts(f.video)).toHaveLength(1);
    expect(await stored(f.video)).toEqual({ cta_kind: 'none', cta_url: null });
    expect(await versions(f.video)).toEqual([1, 2, 1]);
  });

  it('первичная сборка ещё идёт (клип rendering) — 409; истёкшие и упавшие клипы не пересобираются', async () => {
    const f = await fixture(3);
    await pool.query("UPDATE clip SET status='rendering' WHERE id=$1", [f.clips[0]]);
    await expect(setWatch(f)).rejects.toMatchObject({ status: 409 });
    await pool.query("UPDATE clip SET status='failed',object_key=NULL WHERE id=$1", [f.clips[0]]);
    await pool.query('UPDATE clip SET expires_at=$2 WHERE id=$1', [f.clips[1], now]);
    await expect(setWatch(f)).resolves.toMatchObject({ rerendering: 1 });
    expect((await attempts(f.video)).map(j => j.clip_id)).toEqual([f.clips[2]]);
    expect(await charge()).toBe(1);
  });

  it('остатка меньше числа клипов — 429 целиком, списано 0, призыв и версии прежние', async () => {
    const f = await fixture(3);
    await preconsume(f.account, 18);
    await expect(setWatch(f)).rejects.toMatchObject({ status: 429, message: expect.stringContaining('Пересборки на сегодня исчерпаны') });
    expect(await charge()).toBe(18);
    expect(await attempts(f.video)).toHaveLength(0);
    expect(await stored(f.video)).toEqual({ cta_kind: 'none', cta_url: null });
    expect(await versions(f.video)).toEqual([1, 1, 1]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('чужая и несуществующая запись — 404 без квоты', async () => {
    const f = await fixture(1), other = await fixture(1);
    for (const video of [f.video, randomUUID()]) {
      await expect(cta().setCta(other.account, { video_id: video, cta_kind: 'watch_full', cta_url: YT })).rejects.toMatchObject({ status: 404 });
    }
    expect(await charge()).toBe(0);
  });

  it('частичный отказ ПОСЛЕ постановки не откатывается (ADR-017): клип остаётся со старым файлом, квота не возвращается', async () => {
    const f = await fixture(2);
    await setWatch(f);
    const first = (await attempts(f.video))[0]!;
    const second = await retryRender(pool, first, 'ffmpeg_failed');
    expect(await retryRender(pool, second!, 'ffmpeg_failed')).toBeNull();
    expect((await pool.query('SELECT status,object_key FROM clip WHERE id=$1', [first.clip_id])).rows[0]).toEqual({ status: 'done', object_key: 'old-1' });
    expect(await stored(f.video)).toEqual({ cta_kind: 'watch_full', cta_url: YT });
    expect(await charge()).toBe(2);
  });

  it.each([1, 2, 3, 4, 5])('конкурентно: setCta во время смены музыки — ровно одно действие проходит; прогон %s', async () => {
    const f = await fixture(3);
    const [cr, mr] = await Promise.allSettled([setWatch(f), music().setMusic(f.account, { clip_id: f.clips[0], track: MUSIC_CATALOG[1].id })]);
    expect([cr, mr].filter(r => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of [cr, mr]) if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 409 });
    const active = (await pool.query(`SELECT clip_id,count(*)::int n FROM job_attempt WHERE video_id=$1 AND status IN ('running','deferred')
      GROUP BY clip_id HAVING count(*) > 1`, [f.video])).rows;
    expect(active).toEqual([]);
    expect(await charge()).toBe(cr.status === 'fulfilled' ? 3 : 1);
  });

  it.each([1, 2, 3])('конкурентно: два setCta одной записи — один проходит, второй 409, списано N; прогон %s', async () => {
    const f = await fixture(4);
    const results = await Promise.allSettled([setWatch(f), cta().setCta(f.account, { video_id: f.video, cta_kind: 'subscribe', cta_url: YT })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await charge()).toBe(4); expect(await attempts(f.video)).toHaveLength(4);
  });

  it.each([1, 2, 3])('конкурентно: остаток 4, две записи по 3 клипа — одна пересобирается, вторая 429 целиком; прогон %s', async () => {
    const a = await fixture(3), b = await fixture(3, a.account);
    await preconsume(a.account, 16);
    const results = await Promise.allSettled([setWatch(a), setWatch(b)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { status: 429 } });
    expect(await charge()).toBe(19);
    expect((await attempts(a.video)).length + (await attempts(b.video)).length).toBe(3);
  });

  it('конкурентно, дополнение к «25 смен при лимите 20» (фича 22): пакет на 6 и 16 одиночных смен делят один лимит', async () => {
    const batch = await fixture(6), singles = [];
    for (let i = 0; i < 16; i++) singles.push(await fixture(1, batch.account));
    const results = await Promise.allSettled([setWatch(batch),
      ...singles.map(s => music().setMusic(s.account, { clip_id: s.clips[0], track: MUSIC_CATALOG[1].id }))]);
    const batchOk = results[0]!.status === 'fulfilled', singlesOk = results.slice(1).filter(r => r.status === 'fulfilled').length;
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toMatchObject({ status: 429 });
    const used = await charge();
    expect(used).toBe((batchOk ? 6 : 0) + singlesOk);
    expect(used).toBeLessThanOrEqual(20);
    expect((await attempts(batch.video)).length).toBe(batchOk ? 6 : 0);
  });
});
