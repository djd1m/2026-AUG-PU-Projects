import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { ensureInitialAttempt, leaseAttempt } from '../packages/db/src/attempts';
import { acceptProbe } from '../packages/db/src/probe';
import { authorizeSttCall, acceptTranscript } from '../packages/db/src/transcription';
import { loadLimits } from '../packages/shared/src/config';
import { moscowDay } from '../packages/shared/src/upload';
import { transcribeSource } from '../apps/worker/src/workers/stt';
import { ProviderError } from '../apps/worker/src/stt/client';
import { watchdogTick } from '../apps/web/src/server/watchdog';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { environment } from './fixtures/environment';
const url = process.env.DATABASE_URL, limits = loadLimits(environment());
const valid = { language: 'ru', words: [{ word: 'Привет', start: 1, end: 2 }], segments: [] };
describe.skipIf(!url)('Transcription PostgreSQL 16 integration', () => {
  let pool: Pool;
  const schema = `stt_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна БД *_test');
    await ensureTestDatabase(url);
    pool = new Pool({ connectionString: url, max: 12, options: `-c search_path=${schema},public` });
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account,quota_counter CASCADE'); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture() {
    const account = (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'test') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id as string;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,upload_day)
      VALUES ($1,$2,'upload',100,100,'source','queued',$3) RETURNING id`, [account, randomUUID(), moscowDay(new Date())])).rows[0].id as string;
    await pool.query("INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('user_uploads',$1,$2,1)", [account, moscowDay(new Date())]);
    const attempt = (await ensureInitialAttempt(pool, video))!;
    expect(await acceptProbe(pool, attempt, limits, 120)).toBe('transcribing');
    return { account, video, attempt };
  }
  const used = async (account: string, scope = 'user_minutes') => (await pool.query('SELECT used FROM quota_counter WHERE scope_key=$1 AND scope=$2', [account, scope])).rows[0]?.used ?? 0;
  it('first dispatch uses committed probe charge; durable replay charges again, including timeout', async () => {
    const f = await fixture();
    expect(await used(f.account)).toBe(2);
    expect(await authorizeSttCall(pool, f.attempt, limits, 0, 120)).toBe(1);
    expect(await used(f.account)).toBe(2);
    expect(await authorizeSttCall(pool, f.attempt, limits, 0, 120)).toBe(2);
    expect(await used(f.account)).toBe(4);
    expect(await used('all', 'global_minutes')).toBe(4);
  });
  it.each(['user_minutes', 'global_minutes'])('refused retry %s has no additional call or refund', async scope => {
    const f = await fixture(); await authorizeSttCall(pool, f.attempt, limits, 0, 120);
    await pool.query('UPDATE quota_counter SET used=$2 WHERE scope=$1', [scope, scope === 'user_minutes' ? 90 : 600]);
    expect(await authorizeSttCall(pool, f.attempt, limits, 0, 120)).toBeNull();
    expect((await pool.query('SELECT failure_reason FROM video WHERE id=$1', [f.video])).rows[0].failure_reason).toBe(`refused_${scope}`);
    expect(await used(f.account, 'user_uploads')).toBe(1);
    expect(await used(f.account, 'user_upload_refunds')).toBe(0);
    if (scope === 'global_minutes') expect(await used(f.account)).toBe(2);
  });
  it('concurrent replays at the last two minutes never overrun either quota', async () => {
    const f = await fixture(); await authorizeSttCall(pool, f.attempt, limits, 0, 120);
    await pool.query("UPDATE quota_counter SET used=88 WHERE scope='user_minutes'");
    const calls = await Promise.all(Array.from({ length: 8 }, () => authorizeSttCall(pool, f.attempt, limits, 0, 120)));
    expect(calls.filter(n => n !== null)).toHaveLength(1);
    expect(await used(f.account)).toBe(90); expect(await used('all', 'global_minutes')).toBe(4);
  });
  it('ADR-003: missing words cannot persist or create a select attempt', async () => {
    const f = await fixture();
    await expect(acceptTranscript(pool, f.attempt, { ...valid, words: [] }, 1)).rejects.toThrow();
    expect((await pool.query('SELECT * FROM transcript')).rowCount).toBe(0);
    expect((await pool.query("SELECT * FROM job_attempt WHERE stage='select'")).rowCount).toBe(0);
  });
  it('concurrent results accept once; stale fence cannot overwrite; watchdog recovers publication', async () => {
    const f = await fixture();
    const old = f.attempt, current = (await leaseAttempt(pool, f.video, 'stt', 1))!;
    expect(await acceptTranscript(pool, old, valid, 1)).toBeNull();
    const accepted = await Promise.all([1, 2].map(() => acceptTranscript(pool, current, valid, 1)));
    expect(accepted.filter(Boolean)).toHaveLength(1);
    expect((await pool.query('SELECT fence FROM transcript WHERE video_id=$1', [f.video])).rows[0].fence).toBe(current.fence);
    const enqueue = vi.fn(); await watchdogTick(pool, enqueue);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ stage: 'select', video_id: f.video }), 0);
  });
  it('paid stage fake 5xx then success: quota before both calls; committed words before enqueue', async () => {
    const f = await fixture(), dir = await mkdtemp(join(tmpdir(), 'n5-stt-db-'));
    const spendPath = join(dir, 'model-spend.jsonl'); let calls = 0;
    const transcriber = { transcribe: vi.fn(async () => {
      expect(await used(f.account)).toBe(++calls === 1 ? 2 : 4);
      if (calls === 1) throw new ProviderError(true, 'provider_error'); return valid;
    }) };
    try {
      await transcribeSource(join(dir, 'source'), 120, f.attempt, { pool, limits, transcriber, spendPath,
        extract: async () => ({ path: join(dir, 'audio'), pauses: [] }),
        chunks: async function* () { const path = join(dir, 'chunk'); await writeFile(path, 'fake');
          yield { path, offsetSeconds: 0, durationSeconds: 120, hardCut: false, index: 0 }; },
        enqueue: async next => {
          expect(next.stage).toBe('select');
          expect((await pool.query('SELECT words FROM transcript WHERE video_id=$1', [f.video])).rows[0].words).toHaveLength(1);
          expect((await pool.query('SELECT status FROM video WHERE id=$1', [f.video])).rows[0].status).toBe('selecting');
        } });
      expect(transcriber.transcribe).toHaveBeenCalledTimes(2);
      const events = (await readFile(spendPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      expect(events.filter(e => e.phase === 'attempt')).toHaveLength(2);
      expect(events.filter(e => e.phase === 'outcome').map(e => e.result)).toEqual(['provider_error', 'success']);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('expired task cannot call supplier or transition to select', async () => {
    const f = await fixture(); await pool.query("UPDATE job_attempt SET started_at=now()-interval '31 minutes' WHERE video_id=$1", [f.video]);
    expect(await authorizeSttCall(pool, f.attempt, limits, 0, 120)).toBeNull();
    expect((await pool.query('SELECT failure_reason FROM video WHERE id=$1', [f.video])).rows[0].failure_reason).toBe('stalled');
  });
});
