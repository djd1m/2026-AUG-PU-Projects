import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPool, type Pool } from '../packages/db/src/index';
import { migrate } from '../packages/db/src/migrate';
import { leaseAttempt } from '../packages/db/src/attempts';
import { authorizeSelection, acceptSelection } from '../packages/db/src/selection';
import { loadLimits } from '../packages/shared/src/config';
import { moscowDay } from '../packages/shared/src/upload';
import { validateFragments } from '../packages/shared/src/fragments';
import { selectFragments } from '../apps/worker/src/workers/select';
import { createFakeSelector, fakeFragment } from '../apps/worker/src/llm/fake';
import { VideoRetryService } from '../apps/web/src/server/video-retry';
import { watchdogTick } from '../apps/web/src/server/watchdog';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
const url = process.env.DATABASE_URL, limits = loadLimits(environment());
const model = 'anthropic/claude-sonnet-5';
const transcript = { language: 'ru', words: Array.from({ length: 360 }, (_, i) => ({ word: 'слово', start: i, end: i + 1 })), segments: [] };
describe.skipIf(!url)('Selection PostgreSQL concurrency and persistence', () => {
  let pool: Pool;
  const schema = `selection_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна БД *_test');
    await ensureTestDatabase(url);
    pool = createPool(url, schema);
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account,quota_counter CASCADE'); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture() {
    const account = (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'test') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id as string;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,duration_seconds,upload_day)
      VALUES ($1,$2,'upload',100,100,'source','selecting',360,$3) RETURNING id`, [account, randomUUID(), moscowDay(new Date())])).rows[0].id as string;
    await pool.query('INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments) VALUES ($1,$2,360,1,$3,$4)',
      [video, 'ru', JSON.stringify(transcript.words), '[]']);
    const attempt = (await leaseAttempt(pool, video, 'select', 1))!;
    return { account, video, attempt };
  }
  const used = async (account: string, scope = 'user_llm') => (await pool.query('SELECT used FROM quota_counter WHERE scope_key=$1 AND scope=$2', [account, scope])).rows[0]?.used ?? 0;
  it('two parallel repeat commands: exactly one new series and one charge, no double charge in worker', async () => {
    const f = await fixture(); await authorizeSelection(pool, f.attempt, limits, model);
    await pool.query("UPDATE video SET status='failed',failure_reason='no_fragments' WHERE id=$1", [f.video]);
    const retry = new VideoRetryService(pool, limits, vi.fn());
    const results = await Promise.allSettled([retry.retry(f.account, f.video), retry.retry(f.account, f.video)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await used(f.account)).toBe(2); expect(await used('all', 'global_llm')).toBe(2);
    const attempts = await pool.query('SELECT * FROM job_attempt WHERE video_id=$1 AND series_no=2', [f.video]);
    expect(attempts.rowCount).toBe(1);
    expect(await authorizeSelection(pool, attempts.rows[0], limits, model)).not.toBeNull();
    expect(await used(f.account)).toBe(2); expect(await used('all', 'global_llm')).toBe(2);
  });
  it('duplicate workers dispatch once, then accept once with stale-result fencing', async () => {
    const f = await fixture();
    const calls = await Promise.all([1, 2].map(() => authorizeSelection(pool, f.attempt, limits, model)));
    expect(calls.filter(Boolean)).toHaveLength(1); expect(await used(f.account)).toBe(1);
    const fragments = validateFragments({ fragments: [fakeFragment()] }, transcript, 360);
    const results = await Promise.all([1, 2].map(() => acceptSelection(pool, f.attempt, fragments)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await pool.query('SELECT * FROM clip')).rowCount).toBe(1);
    expect((await pool.query('SELECT * FROM clip_link')).rowCount).toBe(1);
  });
  it('one strong fragment is persisted as the honest count', async () => {
    const f = await fixture();
    await authorizeSelection(pool, f.attempt, limits, model);
    const fragments = validateFragments({ fragments: [fakeFragment()] }, transcript, 360);
    const jobs = await acceptSelection(pool, f.attempt, fragments);
    expect(jobs).toHaveLength(1);
    expect((await pool.query('SELECT clips_total,status FROM video WHERE id=$1', [f.video])).rows[0])
      .toEqual({ clips_total: 1, status: 'rendering' });
    expect((await pool.query('SELECT * FROM clip WHERE video_id=$1', [f.video])).rowCount).toBe(1);
  });
  // LV-4 (23.09.2026): негодный кандидат отбрасывается ОДИН, годные сохраняются.
  // Прежде один промах из восьми отбрасывал все, и владелец видел «самодостаточных фрагментов
  // не найдено» на записи, где модель нашла семь годных.
  // Отсеивает обработчик (validateFragments), база — вторая линия обороны: она перепроверяет и
  // НЕ ПУСКАЕТ набор, который расходится с проверенным. Поэтому сюда приходит уже отсеянное.
  it('DB boundary refuses fragments that were not pre-validated and saves nothing', async () => {
    const f = await fixture();
    await authorizeSelection(pool, f.attempt, limits, model);
    const raw = [fakeFragment(0), fakeFragment(1), { ...fakeFragment(2), score_hook: 34, score: 84 }];
    await expect(acceptSelection(pool, f.attempt, raw)).rejects.toThrow('Непроверенные фрагменты на границе БД');
    expect((await pool.query('SELECT count(*)::int AS n FROM clip WHERE video_id=$1', [f.video])).rows[0].n).toBe(0);
  });
  it('pre-validated survivors are saved after one candidate is dropped', async () => {
    const f = await fixture();
    await authorizeSelection(pool, f.attempt, limits, model);
    const fragments = [fakeFragment(0), fakeFragment(1)];
    const jobs = await acceptSelection(pool, f.attempt, fragments);
    expect(jobs).toHaveLength(2);
    expect((await pool.query('SELECT count(*)::int AS n FROM clip WHERE video_id=$1', [f.video])).rows[0].n).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS n FROM clip_link')).rows[0].n).toBe(2);
  });
  it('all candidates out of range still fail as no_fragments and save nothing', async () => {
    const f = await fixture();
    await authorizeSelection(pool, f.attempt, limits, model);
    const bad = [0, 1, 2].map(i => ({ ...fakeFragment(i), score_hook: 34, score: 84 }));
    expect(await acceptSelection(pool, f.attempt, bad)).toEqual([]);
    expect((await pool.query('SELECT status,failure_reason FROM video WHERE id=$1', [f.video])).rows[0])
      .toEqual({ status: 'failed', failure_reason: 'no_fragments' });
    expect((await pool.query('SELECT * FROM clip WHERE video_id=$1', [f.video])).rowCount).toBe(0);
  });
  it('old fence cannot spend or save after a new lease', async () => {
    const f = await fixture(); await leaseAttempt(pool, f.video, 'select', 2);
    expect(await authorizeSelection(pool, f.attempt, limits, model)).toBeNull();
    expect(await acceptSelection(pool, f.attempt, [fakeFragment()])).toBeNull(); expect(await used(f.account)).toBe(0);
  });
  it.each(['user_llm', 'global_llm'])('refused %s rolls back both quota keys', async scope => {
    const f = await fixture();
    await pool.query('INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ($1,$2,$3,$4)',
      [scope, scope === 'user_llm' ? f.account : 'all', moscowDay(new Date()), scope === 'user_llm' ? 2 : 20]);
    expect(await authorizeSelection(pool, f.attempt, limits, model)).toBeNull();
    expect((await pool.query('SELECT failure_reason FROM video WHERE id=$1', [f.video])).rows[0].failure_reason).toBe(`refused_${scope}`);
    expect(await used(scope === 'user_llm' ? 'all' : f.account, scope === 'user_llm' ? 'global_llm' : 'user_llm')).toBe(0);
  });
  it('global last call: two accounts race, exactly one succeeds', async () => {
    const a = await fixture(), b = await fixture();
    await pool.query("INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('global_llm','all',$1,19)", [moscowDay(new Date())]);
    const results = await Promise.all([a, b].map(f => authorizeSelection(pool, f.attempt, limits, model)));
    expect(results.filter(Boolean)).toHaveLength(1); expect(await used('all', 'global_llm')).toBe(20);
    expect(await used(a.account) + await used(b.account)).toBe(1);
  });
  it('fake end-to-stage: quota and spend before request; clips, links and rendering committed before enqueue', async () => {
    const f = await fixture(), dir = await mkdtemp(join(tmpdir(), 'n5-select-'));
    const spendPath = join(dir, 'model-spend.jsonl'), fake = createFakeSelector('few');
    try {
      const selector = { select: vi.fn(async (...args: Parameters<typeof fake.select>) => {
        expect(await used(f.account)).toBe(1);
        expect(JSON.parse((await readFile(spendPath, 'utf8')).trim()).phase).toBe('attempt');
        return fake.select(...args);
      }) };
      await selectFragments(f.attempt, { pool, limits, selector, model, spendPath, enqueue: async next => {
        expect(next.stage).toBe('render');
        expect((await pool.query('SELECT clips_total,status FROM video WHERE id=$1', [f.video])).rows[0]).toEqual({ clips_total: 2, status: 'rendering' });
        expect((await pool.query('SELECT * FROM clip_link')).rowCount).toBe(2);
      } });
      expect(selector.select).toHaveBeenCalledTimes(1);
      const enqueue = vi.fn(); await watchdogTick(pool, enqueue); expect(enqueue).toHaveBeenCalledTimes(2);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('RV-5 ledger outage immediately marks video and attempt failed without calling the provider', async () => {
    const f = await fixture(), original = new Error('attempt disk full');
    const selector = { select: vi.fn(createFakeSelector('valid').select) }, enqueue = vi.fn();
    const spend = vi.fn().mockRejectedValue(new Error('outcome disk full')).mockRejectedValueOnce(original);
    await expect(selectFragments(f.attempt, { pool, limits, selector, model, spendPath: '/unused', spend, enqueue }))
      .rejects.toBe(original);
    expect(selector.select).not.toHaveBeenCalled(); expect(enqueue).not.toHaveBeenCalled();
    expect(spend.mock.calls.map(call => call[1].phase)).toEqual(['attempt', 'outcome']);
    expect((await pool.query('SELECT status,failure_reason FROM video WHERE id=$1', [f.video])).rows[0])
      .toEqual({ status: 'failed', failure_reason: 'stalled' });
    expect((await pool.query('SELECT status,finished_at FROM job_attempt WHERE video_id=$1 AND fence=$2',
      [f.video, f.attempt.fence])).rows[0]).toEqual({ status: 'failed', finished_at: expect.any(Date) });
  });
  it('word precision survives PostgreSQL and SQL CHECK rejects invalid scores and length', async () => {
    const f = await fixture();
    const words = [{ word: 'начало', start: 0.1234, end: 1 }, { word: 'конец', start: 25, end: 25.4321 }];
    await pool.query('UPDATE transcript SET words=$2 WHERE video_id=$1', [f.video, JSON.stringify(words)]);
    await authorizeSelection(pool, f.attempt, limits, model);
    const fragments = validateFragments({ fragments: [fakeFragment()] }, { ...transcript, words }, 360);
    await acceptSelection(pool, f.attempt, fragments);
    expect((await pool.query('SELECT start_seconds,end_seconds FROM clip')).rows[0]).toEqual({ start_seconds: '0.1234', end_seconds: '25.4321' });
    for (const sql of ['score=99', 'score_hook=34', "explain_hook=' '", 'end_seconds=100', 'score_hook=NULL']) {
      await expect(pool.query(`UPDATE clip SET ${sql}`)).rejects.toMatchObject({ code: '23514' });
    }
  });
});
