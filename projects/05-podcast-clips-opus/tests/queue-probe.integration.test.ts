import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { leaseAttempt, ensureInitialAttempt, acceptRenderResult, type Attempt } from '../packages/db/src/attempts';
import { acceptProbe, deferProbe, failProbe } from '../packages/db/src/probe';
import { checkAndConsumeQuota, transaction } from '../packages/db/src/quota';
import { loadLimits } from '../packages/shared/src/config';
import { moscowDay } from '../packages/shared/src/upload';
import { VideoRetryService } from '../apps/web/src/server/video-retry';
import { watchdogTick } from '../apps/web/src/server/watchdog';
import { retryProbe } from '../apps/worker/src/retry';
import { probeSource } from '../apps/worker/src/workers/stt';
import { ProbeError } from '../apps/worker/src/media/probe';
import { environment } from './fixtures/environment';
import { ensureTestDatabase } from '../scripts/test-db.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const url = process.env.DATABASE_URL, limits = loadLimits(environment());
const now = new Date('2026-09-22T10:00:00Z');

describe.skipIf(!url)('Queue/probe on PostgreSQL 16', () => {
  let pool: Pool;
  const schema = `probe_${randomBytes(8).toString('hex')}`;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Нужна отдельная БД *_test');
    await ensureTestDatabase(url);
    pool = new Pool({ connectionString: url, max: 12, options: `-c search_path=${schema},public` });
    await pool.query(`CREATE SCHEMA ${schema}`); await migrate(pool);
  });
  beforeEach(async () => { await pool.query('TRUNCATE account,quota_counter CASCADE'); });
  afterAll(async () => { if (pool) { await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end(); } });
  async function fixture() {
    const account = (await pool.query("INSERT INTO account(email,password_hash) VALUES ($1,'test') RETURNING id", [`${randomUUID()}@test.invalid`])).rows[0].id as string;
    const video = (await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,upload_day,updated_at)
      VALUES ($1,$2,'upload',100,100,'object','queued',$3,$4) RETURNING id`, [account, randomUUID(), moscowDay(now), now])).rows[0].id as string;
    await transaction(pool, tx => checkAndConsumeQuota(tx, limits, account, 'upload', 1, now));
    return { account, video, attempt: (await ensureInitialAttempt(pool, video))! };
  }
  const videoRow = async (id: string) => (await pool.query('SELECT * FROM video WHERE id=$1', [id])).rows[0];
  const used = async (account: string, scope: string) => (await pool.query('SELECT used FROM quota_counter WHERE scope_key=$1 AND scope=$2', [account, scope])).rows[0]?.used ?? 0;
  async function clip(video: string) {
    return (await pool.query(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,status,watermarked)
      VALUES ($1,1,0,30,'clip','queued',true) RETURNING id`, [video])).rows[0].id as string;
  }
  it('two initial publishers reuse one lease; eight clips each get their own first attempt', async () => {
    const f = await fixture();
    const initial = await Promise.all(Array.from({ length: 10 }, () => ensureInitialAttempt(pool, f.video)));
    expect(new Set(initial.map(j => j!.fence))).toEqual(new Set([1]));
    const clips = await Promise.all(Array.from({ length: 8 }, () => clip(f.video)));
    const attempts = await Promise.all(clips.map(id => leaseAttempt(pool, f.video, 'render', 1, id)));
    expect(attempts.map(a => a!.fence).sort((a,b) => a-b)).toEqual([2,3,4,5,6,7,8,9]);
    expect(attempts.every(a => a!.attempt_no === 1)).toBe(true);
  });
  it('ADR-001: late old render is rejected before a current result is accepted', async () => {
    const { video } = await fixture(), id = await clip(video);
    const old = (await leaseAttempt(pool, video, 'render', 1, id))!;
    const current = (await leaseAttempt(pool, video, 'render', 1, id))!;
    const audit = vi.fn();
    // Old result arrives while the new clip is still rendering: removing the fence must break this.
    expect(await acceptRenderResult(pool, old, { object_key:'old',thumbnail_key:'old',bytes:1 }, audit)).toBe(false);
    expect(audit).toHaveBeenCalledWith('stale_attempt_result', expect.objectContaining({ fence: old.fence }));
    expect(await acceptRenderResult(pool, current, { object_key:'new',thumbnail_key:'new',bytes:2 })).toBe(true);
    expect(await acceptRenderResult(pool, old, { object_key:'old',thumbnail_key:'old',bytes:1 }, audit)).toBe(false);
    expect((await pool.query('SELECT object_key FROM clip WHERE id=$1',[id])).rows[0].object_key).toBe('new');
  });
  it('MANDATORY concurrency: render(fence=N) delivered twice accepts exactly one UPDATE', async () => {
    const { video } = await fixture(), id = await clip(video);
    const attempt = (await leaseAttempt(pool, video, 'render', 1, id))!, audit = vi.fn();
    const results = await Promise.all([1,2].map(bytes => acceptRenderResult(pool, attempt, { object_key:'result',thumbnail_key:'thumb',bytes }, audit)));
    expect(results.filter(Boolean)).toHaveLength(1); expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]![0]).toBe('stale_attempt_result');
  });
  it('automatic retries stop at two, owner retry opens a new series/fence', async () => {
    const f = await fixture();
    const second = (await retryProbe(pool, f.attempt))!;
    expect(second.attempt_no).toBe(2); expect(await retryProbe(pool, second)).toBeNull();
    const enqueue = vi.fn(), service = new VideoRetryService(pool, limits, enqueue, () => now);
    expect(await service.retry(f.account, f.video)).toMatchObject({ status:'queued' });
    expect(enqueue.mock.calls[0]![0]).toMatchObject({ series_no:2,attempt_no:1,fence:3 });
  });
  it('same probe delivery charges minutes once and stale result cannot fail/refund it', async () => {
    const f = await fixture(), audit = vi.fn();
    expect((await Promise.all([1,2].map(() => acceptProbe(pool,f.attempt,limits,120,now,audit)))).sort()).toEqual(['stale','transcribing']);
    expect(await used(f.account,'user_minutes')).toBe(2); expect(await used('all','global_minutes')).toBe(2);
    expect(await failProbe(pool,f.attempt,limits,'too_long',now,audit)).toBe(false);
    expect(await used(f.account,'user_uploads')).toBe(1);
  });
  it.each(['no_audio','too_short','too_long','probe_timeout'] as const)('%s atomically returns upload slot once', async reason => {
    const f = await fixture();
    expect(await failProbe(pool,f.attempt,limits,reason,now)).toBe(true);
    expect(await failProbe(pool,f.attempt,limits,reason,now,vi.fn())).toBe(false);
    expect((await videoRow(f.video)).failure_reason).toBe(reason);
    expect(await used(f.account,'user_uploads')).toBe(0); expect(await used(f.account,'user_upload_refunds')).toBe(1);
    expect(await used(f.account,'user_minutes')).toBe(0);
  });
  it('refund cap prevents the third file refund', async () => {
    const f = await fixture();
    await pool.query("INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ('user_upload_refunds',$1,$2,2)",[f.account,moscowDay(now)]);
    await failProbe(pool,f.attempt,limits,'too_long',now);
    expect(await used(f.account,'user_uploads')).toBe(1);
  });
  it.each(['user_minutes','global_minutes'])('%s refusal keeps upload slot and rolls back the other counter', async scope => {
    const f = await fixture();
    await pool.query('INSERT INTO quota_counter(scope,scope_key,day,used) VALUES ($1,$2,$3,$4)',
      [scope,scope==='global_minutes'?'all':f.account,moscowDay(now),scope==='global_minutes'?600:90]);
    expect(await acceptProbe(pool,f.attempt,limits,120,now)).toBe('failed');
    expect((await videoRow(f.video)).failure_reason).toBe(`refused_${scope}`);
    expect(await used(f.account,'user_uploads')).toBe(1); expect(await used(f.account,'user_upload_refunds')).toBe(0);
    if (scope==='global_minutes') expect(await used(f.account,'user_minutes')).toBe(0);
  });
  it('deferred refreshes updated_at; watchdog preserves it but expires silent attempt and unfinished clips', async () => {
    const f = await fixture(), id = await clip(f.video), enqueue = vi.fn();
    await pool.query('UPDATE video SET updated_at=$2 WHERE id=$1',[f.video,new Date(now.getTime()-31*60_000)]);
    expect(await deferProbe(pool,f.attempt,now)).toBe(true);
    await watchdogTick(pool,enqueue,now);
    expect((await videoRow(f.video)).status).toBe('queued');
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ status:'deferred' }),300_000);
    await watchdogTick(pool,enqueue,new Date(now.getTime()+31*60_000));
    expect((await videoRow(f.video)).failure_reason).toBe('stalled');
    expect((await pool.query('SELECT status FROM clip WHERE id=$1',[id])).rows[0].status).toBe('failed');
    expect((await pool.query('SELECT status FROM job_attempt WHERE video_id=$1',[f.video])).rows[0].status).toBe('failed');
  });
  it('watchdog restores committed-but-not-published initial attempt', async () => {
    const f = await fixture(); await pool.query('DELETE FROM job_attempt WHERE video_id=$1',[f.video]);
    await pool.query('UPDATE video SET fence=0,updated_at=$2 WHERE id=$1',[f.video,now]);
    const enqueue = vi.fn(); await watchdogTick(pool,enqueue,now);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ video_id:f.video,fence:1,stage:'stt' }),0);
  });
  it('retry rejects missing file and foreign resource; minute refusals resume probe in new series', async () => {
    const f = await fixture(), enqueue = vi.fn(), service = new VideoRetryService(pool,limits,enqueue,()=>now);
    await pool.query("UPDATE video SET status='failed',failure_reason='refused_user_uploads',object_key=NULL WHERE id=$1",[f.video]);
    await expect(service.retry(f.account,f.video)).rejects.toMatchObject({status:409}); expect(enqueue).not.toHaveBeenCalled();
    await expect(service.retry(randomUUID(),f.video)).rejects.toMatchObject({status:404});
    await pool.query("UPDATE video SET failure_reason='refused_user_minutes',object_key='source' WHERE id=$1",[f.video]);
    await Promise.allSettled([service.retry(f.account,f.video),service.retry(f.account,f.video)]);
    expect(enqueue).toHaveBeenCalledTimes(1); expect(enqueue.mock.calls[0]![0]).toMatchObject({stage:'stt',series_no:2,fence:2});
  });
  it('probe orchestration checks disk before GET and timeout refunds without minutes', async () => {
    const f = await fixture(), directory = await mkdtemp(join(tmpdir(),'n5-probe-db-')), download = vi.fn();
    try {
      const deps = {pool,limits,directory,download,clock:()=>now,probe:vi.fn(async()=>{throw new ProbeError('probe_timeout');})};
      expect(await probeSource(f.attempt,{...deps,available:async()=>299n})).toBe('deferred');
      expect(download).not.toHaveBeenCalled(); expect(deps.probe).not.toHaveBeenCalled();
      expect(await probeSource(f.attempt,{...deps,available:async()=>300n})).toBe('failed');
      expect(download).toHaveBeenCalledTimes(1); expect(await used(f.account,'user_uploads')).toBe(0);
    } finally { await rm(directory,{recursive:true,force:true}); }
  });
  async function addTranscript(video: string) {
    await pool.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments)
      VALUES ($1,'ru',120,1,'[]','[]')`,[video]);
    await pool.query("UPDATE video SET status='failed',failure_reason='stalled' WHERE id=$1",[video]);
  }
  it('select retry consumes both LLM keys; two videos compete for last personal call', async () => {
    const f=await fixture(); await addTranscript(f.video);
    const other=(await pool.query(`INSERT INTO video(account_id,idempotency_key,source,declared_bytes,actual_bytes,object_key,status,upload_day)
      VALUES ($1,$2,'upload',100,100,'other','failed',$3) RETURNING id`,[f.account,randomUUID(),moscowDay(now)])).rows[0].id as string;
    await addTranscript(other);
    await transaction(pool,tx=>checkAndConsumeQuota(tx,limits,f.account,'llm',1,now));
    const enqueue=vi.fn(),service=new VideoRetryService(pool,limits,enqueue,()=>now);
    const results=await Promise.allSettled([service.retry(f.account,f.video),service.retry(f.account,other)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await used(f.account,'user_llm')).toBe(2); expect(await used('all','global_llm')).toBe(2);
    expect(enqueue).toHaveBeenCalledTimes(1); expect(enqueue.mock.calls[0]![0].stage).toBe('select');
    expect(await used(f.account,'user_minutes')).toBe(0);
  });
  it('render retry leases only unfinished clips in one new series', async () => {
    const f=await fixture(); await addTranscript(f.video);
    const done=await clip(f.video),pending=await clip(f.video);
    await pool.query("UPDATE clip SET status='done',object_key='already' WHERE id=$1",[done]);
    const enqueue=vi.fn();
    await new VideoRetryService(pool,limits,enqueue,()=>now).retry(f.account,f.video);
    expect(enqueue).toHaveBeenCalledTimes(1); expect(enqueue.mock.calls[0]![0]).toMatchObject({stage:'render',clip_id:pending,series_no:2});
    expect((await pool.query('SELECT object_key FROM clip WHERE id=$1',[done])).rows[0].object_key).toBe('already');
    expect(await used(f.account,'user_llm')).toBe(0); expect(await used(f.account,'user_minutes')).toBe(0);
  });

  it('selection quota refusal persists correct reason and enqueues nothing', async () => {
    const f=await fixture(); await addTranscript(f.video);
    await transaction(pool,tx=>checkAndConsumeQuota(tx,limits,f.account,'llm',2,now));
    const enqueue=vi.fn();
    await expect(new VideoRetryService(pool,limits,enqueue,()=>now).retry(f.account,f.video)).rejects.toMatchObject({status:429});
    expect((await videoRow(f.video)).failure_reason).toBe('refused_user_llm'); expect(enqueue).not.toHaveBeenCalled();
  });
  it('transcription handoff stays live, recovers input without charging again, expires if worker dies', async () => {
    const f=await fixture(), directory=await mkdtemp(join(tmpdir(),'n5-handoff-')),download=vi.fn();
    const continuation=vi.fn(async(_file: string,_duration: number,_attempt: Attempt)=>{}),probe=vi.fn(async()=>({durationSec:120,hasAudio:true}));
    try {
      const deps={pool,limits,directory,download,available:async()=>300n,clock:()=>now,probe};
      expect(await probeSource(f.attempt,deps)).toBe('transcribing');
      const later=new Date(now.getTime()+31*60_000);
      expect(await probeSource(f.attempt,{...deps,clock:()=>later})).toBe('transcribing');
      await watchdogTick(pool,vi.fn(),later); expect((await videoRow(f.video)).status).toBe('transcribing');
      expect(download).toHaveBeenCalledTimes(1);
      expect(await probeSource(f.attempt,{...deps,continueTranscription:continuation})).toBe('continued');
      expect(continuation).toHaveBeenCalledTimes(1); expect(probe).toHaveBeenCalledTimes(1);
      expect(await used(f.account,'user_minutes')).toBe(2);
      await watchdogTick(pool,vi.fn(),new Date(later.getTime()+31*60_000));
      expect((await videoRow(f.video)).failure_reason).toBe('stalled');
    } finally {await rm(directory,{recursive:true,force:true});}
  });
  it('initial continuation uses the same single downloaded file', async () => {
    const f=await fixture(),directory=await mkdtemp(join(tmpdir(),'n5-continuation-')),download=vi.fn(async(_key: string,_file: string,_bytes: bigint)=>{});
    const continuation=vi.fn(async(_file: string,_duration: number,_attempt: Attempt)=>{});
    try {
      expect(await probeSource(f.attempt,{pool,limits,directory,download,available:async()=>300n,clock:()=>now,
        probe:async()=>({durationSec:120,hasAudio:true}),continueTranscription:continuation})).toBe('continued');
      expect(download).toHaveBeenCalledTimes(1); expect(continuation.mock.calls[0]?.[0]).toBe(download.mock.calls[0]?.[1]);
    } finally {await rm(directory,{recursive:true,force:true});}
  });

  it('watchdog rotates beyond batch even when the first jobs remain queued', async () => {
    const fixtures=await Promise.all([fixture(),fixture(),fixture()]);
    const enqueue=vi.fn();
    await watchdogTick(pool,enqueue,now,2); await watchdogTick(pool,enqueue,now,2);
    expect(new Set(enqueue.mock.calls.map(call=>(call[0] as Attempt).video_id)))
      .toEqual(new Set(fixtures.map(f=>f.video)));
  });

});
