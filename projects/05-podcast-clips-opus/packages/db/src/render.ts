import type { Pool, PoolClient } from 'pg';
import { transaction } from './quota.js';
import { auditAttempt, leaseAttemptTx, type Attempt } from './attempts.js';
import { parseTranscript } from '@clipmaker/shared/transcript';
export interface RenderInput {
  music_track_id: string | null; render_version: number;
  compact: boolean; loudness_median_db: string | null; cut_plan: [number, number][] | null;
  object_key: string; actual_bytes: string; duration_seconds: string; music: boolean; teaser: boolean; title: string; plan: unknown;
  index: number; start_seconds: string; end_seconds: string; code: string; words: unknown; language: string; segments: unknown;
}
// Lock video first, as retry/watchdog do. Never compare the video fence for sibling clips.
export async function lockRender(tx: PoolClient, attempt: Attempt): Promise<boolean> {
  const video = await tx.query(`SELECT v.id FROM video v JOIN account a ON a.id=v.account_id
    WHERE v.id=$1 AND ($2::boolean OR v.status='rendering') AND v.deleted_at IS NULL AND a.status='active' FOR UPDATE OF v`, [attempt.video_id, !!attempt.rerender]);
  if (!video.rowCount) return false;
  const result = await tx.query(`SELECT c.id FROM clip c JOIN job_attempt j ON j.clip_id=c.id
    WHERE c.id=$1 AND c.video_id=$2 AND c.render_fence=$3 AND c.status=CASE WHEN j.rerender THEN 'done' ELSE 'rendering' END
    AND j.rerender=$4 AND j.video_id=$2 AND j.fence=$3 AND j.stage='render' AND j.status IN ('running','deferred') FOR UPDATE OF c,j`,
  [attempt.clip_id, attempt.video_id, attempt.fence, !!attempt.rerender]);
  return !!result.rowCount;
}
export async function getRenderInput(pool: Pool, attempt: Attempt) {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    const result = await tx.query<RenderInput>(`SELECT c.music_track_id,c.render_version,v.object_key,v.actual_bytes,v.duration_seconds,v.music,v.teaser,v.compact,v.loudness_median_db,c.cut_plan,c.title,a.plan,
      c.index,c.start_seconds,c.end_seconds,l.code,t.words,t.language,t.segments FROM clip c
      JOIN video v ON v.id=c.video_id JOIN account a ON a.id=v.account_id
      JOIN clip_link l ON l.clip_id=c.id JOIN transcript t ON t.video_id=v.id WHERE c.id=$1`, [attempt.clip_id]);
    const row = result.rows[0];
    if (!row) throw new Error('Рендер требует ссылку и транскрипт, созданные до задания');
    const transcript = parseTranscript(row, Number(row.duration_seconds));
    return { ...row, words: transcript.words };
  });
}
export async function setRenderDeferred(pool: Pool, attempt: Attempt, deferred: boolean) {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return false; }
    await tx.query(`UPDATE job_attempt SET status=$3,wait_reason=$4,started_at=now() WHERE video_id=$1 AND fence=$2`,
      [attempt.video_id, attempt.fence, deferred ? 'deferred' : 'running', deferred ? 'no_disk' : null]);
    await tx.query('UPDATE video SET updated_at=now() WHERE id=$1', [attempt.video_id]);
    return true;
  });
}
export async function updateRenderProgress(tx: PoolClient, videoId: string) {
  const counts = (await tx.query<{ total: number; done: number; terminal: number }>(`SELECT count(*)::int total,
    count(*) FILTER (WHERE status='done')::int done, count(*) FILTER (WHERE status IN ('done','failed'))::int terminal
    FROM clip WHERE video_id=$1`, [videoId])).rows[0]!;
  const terminal = counts.total > 0 && counts.total === counts.terminal;
  await tx.query(`UPDATE video SET clips_done=$2,stage_progress=$3,updated_at=now(),
    status=CASE WHEN $4 THEN CASE WHEN $2>0 THEN 'done' ELSE 'failed' END ELSE status END,
    failure_reason=CASE WHEN $4 AND $2=0 THEN 'render_failed' ELSE NULL END,
    finished_at=CASE WHEN $4 THEN now() ELSE NULL END WHERE id=$1`,
  [videoId, counts.done, Math.floor(100 * counts.terminal / Math.max(1, counts.total)), terminal]);
  if (terminal && counts.done > 0) await tx.query(`UPDATE attribution SET status='activated',activated_at=now()
    WHERE account_id=(SELECT account_id FROM video WHERE id=$1) AND status='pending'`, [videoId]);
}
export async function retryRender(pool: Pool, attempt: Attempt, reason: 'ffmpeg_failed' | 'ffmpeg_timeout' | 'watermark_geometry'): Promise<Attempt | null> {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    await tx.query(`UPDATE job_attempt SET status='failed',failure_reason=$3,finished_at=now() WHERE video_id=$1 AND fence=$2`,
      [attempt.video_id, attempt.fence, reason]);
    const next = reason === 'watermark_geometry' ? null
      : await leaseAttemptTx(tx, attempt.video_id, 'render', attempt.series_no, attempt.clip_id, new Date(), !!attempt.rerender);
    if (next) return next;
    if (attempt.rerender) {
      await tx.query('UPDATE clip SET music_track_id=rendered_music_track_id WHERE id=$1 AND render_fence=$2', [attempt.clip_id, attempt.fence]);
      return null;
    }
    await tx.query(`UPDATE clip SET status='failed',failure_reason=$3 WHERE id=$1 AND render_fence=$2`, [attempt.clip_id, attempt.fence, reason]);
    await updateRenderProgress(tx, attempt.video_id);
    return null;
  });
}
export interface RenderResult { music_skip_reason?: string | null; rendered_music_track_id?: string; object_key: string; thumbnail_key: string; bytes: number; watermarked: boolean; duration_seconds: number }
// Publish outside the transaction; storage must enforce create-only publication.
// Concurrent PUTs may adopt the same immutable contract; DB acceptance remains fenced.
// Rejected versioned objects are removed only when no delivery can still adopt them.
export async function publishRenderResult(pool: Pool, attempt: Attempt, result: RenderResult,
  publish: () => Promise<number>, remove?: (key: string) => Promise<void>): Promise<boolean> {
  const bytes = await publish();
  const accepted = await transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    // Read actual old keys while fenced, including a previous tariff's prefix.
    const previous = (await tx.query<{ object_key: string | null; thumbnail_key: string | null }>(
      'SELECT object_key,thumbnail_key FROM clip WHERE id=$1', [attempt.clip_id])).rows[0]!;
    const written = await tx.query(`UPDATE clip SET status='done',object_key=$4,thumbnail_key=$5,bytes=$6,watermarked=$7,
      duration_seconds=$8,failure_reason=NULL,rendered_music_track_id=$9,music_skip_reason=$11
      WHERE id=$1 AND video_id=$2 AND render_fence=$3 AND status=$10 RETURNING id`,
    [attempt.clip_id, attempt.video_id, attempt.fence, result.object_key, result.thumbnail_key, bytes,
      result.watermarked, result.duration_seconds, result.rendered_music_track_id ?? 'none', attempt.rerender ? 'done' : 'rendering', result.music_skip_reason ?? null]);
    if (!written.rowCount) { auditAttempt('stale_attempt_result', attempt); return null; }
    await tx.query(`UPDATE job_attempt SET status='succeeded',wait_reason=NULL,finished_at=now() WHERE video_id=$1 AND fence=$2`,
      [attempt.video_id, attempt.fence]);
    if (!attempt.rerender) await updateRenderProgress(tx, attempt.video_id);
    return previous;
  });
  if (!accepted) {
    if (attempt.rerender && remove) {
      const orphanKeys = await transaction(pool, async tx => {
      // Serialize with retries/new choices. A retry shares the version, so protect it,
      // as well as an already adopted duplicate. Never remove unversioned v1 keys.
      await tx.query('SELECT id FROM video WHERE id=$1 FOR UPDATE', [attempt.video_id]);
      const current = (await tx.query<{ object_key: string | null; thumbnail_key: string | null; render_version: number; active: boolean }>(`SELECT c.object_key,c.thumbnail_key,c.render_version,
        EXISTS (SELECT 1 FROM job_attempt j WHERE j.clip_id=c.id AND j.fence=c.render_fence
          AND j.status IN ('running','deferred')) AS active FROM clip c WHERE c.id=$1 FOR UPDATE OF c`, [attempt.clip_id])).rows[0];
      return [result.object_key, result.thumbnail_key].filter(key => {
        const version = key.match(/-v([1-9][0-9]*)\.(mp4|jpg)$/)?.[1];
        if (!version || key === current?.object_key || key === current?.thumbnail_key
          || (current?.active && current.render_version === Number(version))) return false;
        return true;
      });
      });
      for (const key of orphanKeys) {
        try { await remove(key); }
        catch (error) { console.error(JSON.stringify({ event: 'rerender_cleanup_failed', key,
          message: error instanceof Error ? error.message : String(error) })); }
      }
    }
    return false;
  }
  if (attempt.rerender && remove) {
    for (const key of [accepted.object_key, accepted.thumbnail_key]) {
      if (!key || key === result.object_key || key === result.thumbnail_key) continue;
      try { await remove(key); }
      catch (error) { console.error(JSON.stringify({ event: 'rerender_cleanup_failed', key,
        message: error instanceof Error ? error.message : String(error) })); }
    }
  }
  return true;
}

// Both conditional write and authoritative reread are protected by the attempt fence.
export async function saveCutPlan(pool: Pool, attempt: Attempt, plan: [number, number][], signal?: AbortSignal) {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    signal?.throwIfAborted();
    await tx.query('UPDATE clip SET cut_plan=$1 WHERE id=$2 AND cut_plan IS NULL', [JSON.stringify(plan), attempt.clip_id]);
    return (await tx.query<{ cut_plan: [number, number][] }>('SELECT cut_plan FROM clip WHERE id=$1', [attempt.clip_id])).rows[0]!.cut_plan;
  });
}
export async function saveLoudnessMedian(pool: Pool, attempt: Attempt, median: number, signal?: AbortSignal) {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    signal?.throwIfAborted();
    await tx.query('UPDATE video SET loudness_median_db=$1 WHERE id=$2 AND loudness_median_db IS NULL', [median, attempt.video_id]);
    return Number((await tx.query<{ loudness_median_db: string }>('SELECT loudness_median_db FROM video WHERE id=$1', [attempt.video_id])).rows[0]!.loudness_median_db);
  });
}
