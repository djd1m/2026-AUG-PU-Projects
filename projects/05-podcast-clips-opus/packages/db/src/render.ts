import type { Pool, PoolClient } from 'pg';
import { transaction } from './quota.js';
import { auditAttempt, leaseAttemptTx, type Attempt } from './attempts.js';
import { parseTranscript } from '@clipmaker/shared/transcript';
export interface RenderInput {
  object_key: string; actual_bytes: string; duration_seconds: string; plan: unknown;
  start_seconds: string; end_seconds: string; code: string; words: unknown; language: string; segments: unknown;
}
// Lock video first, as retry/watchdog do. Never compare the video fence for sibling clips.
export async function lockRender(tx: PoolClient, attempt: Attempt): Promise<boolean> {
  const video = await tx.query(`SELECT v.id FROM video v JOIN account a ON a.id=v.account_id
    WHERE v.id=$1 AND v.status='rendering' AND v.deleted_at IS NULL AND a.status='active' FOR UPDATE OF v`, [attempt.video_id]);
  if (!video.rowCount) return false;
  const result = await tx.query(`SELECT c.id FROM clip c JOIN job_attempt j ON j.clip_id=c.id
    WHERE c.id=$1 AND c.video_id=$2 AND c.render_fence=$3 AND c.status='rendering'
    AND j.video_id=$2 AND j.fence=$3 AND j.stage='render' AND j.status IN ('running','deferred') FOR UPDATE OF c,j`,
  [attempt.clip_id, attempt.video_id, attempt.fence]);
  return !!result.rowCount;
}
export async function getRenderInput(pool: Pool, attempt: Attempt) {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    const result = await tx.query<RenderInput>(`SELECT v.object_key,v.actual_bytes,v.duration_seconds,a.plan,
      c.start_seconds,c.end_seconds,l.code,t.words,t.language,t.segments FROM clip c
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
    await tx.query(`UPDATE job_attempt SET status=$3,wait_reason=$4 WHERE video_id=$1 AND fence=$2`,
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
export async function retryRender(pool: Pool, attempt: Attempt, reason: 'ffmpeg_failed' | 'ffmpeg_timeout'): Promise<Attempt | null> {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return null; }
    await tx.query(`UPDATE job_attempt SET status='failed',failure_reason=$3,finished_at=now() WHERE video_id=$1 AND fence=$2`,
      [attempt.video_id, attempt.fence, reason]);
    const next = await leaseAttemptTx(tx, attempt.video_id, 'render', attempt.series_no, attempt.clip_id);
    if (next) return next;
    await tx.query(`UPDATE clip SET status='failed',failure_reason=$3 WHERE id=$1 AND render_fence=$2`, [attempt.clip_id, attempt.fence, reason]);
    await updateRenderProgress(tx, attempt.video_id);
    return null;
  });
}
export interface RenderResult { object_key: string; thumbnail_key: string; bytes: number; watermarked: boolean }
// Serialize DB acceptance with retries. Storage must independently enforce create-only
// publication: a connection loss releases this row lock before an in-flight PUT stops.
// Never delete canonical objects here: after a DB error they may already be adopted
// by the next attempt. Matching immutable render contracts make that recovery safe.
export async function publishRenderResult(pool: Pool, attempt: Attempt, result: RenderResult,
  publish: () => Promise<number>): Promise<boolean> {
  return transaction(pool, async tx => {
    if (!await lockRender(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return false; }
    const bytes = await publish();
    const accepted = await tx.query(`UPDATE clip SET status='done',object_key=$4,thumbnail_key=$5,bytes=$6,watermarked=$7,failure_reason=NULL
      WHERE id=$1 AND video_id=$2 AND render_fence=$3 AND status='rendering' RETURNING id`,
    [attempt.clip_id, attempt.video_id, attempt.fence, result.object_key, result.thumbnail_key, bytes, result.watermarked]);
    if (!accepted.rowCount) { auditAttempt('stale_attempt_result', attempt); return false; }
    await tx.query(`UPDATE job_attempt SET status='succeeded',wait_reason=NULL,finished_at=now() WHERE video_id=$1 AND fence=$2`,
      [attempt.video_id, attempt.fence]);
    await updateRenderProgress(tx, attempt.video_id);
    return true;
  });
}
