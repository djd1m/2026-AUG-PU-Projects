import type { Pool, PoolClient } from 'pg';
import type { JobStage } from '@clipmaker/shared/enums';
import { transaction } from './quota.js';
export interface Attempt {
  video_id: string; stage: JobStage; clip_id: string | null; series_no: number;
  fence: number; attempt_no: number; status: 'running' | 'deferred' | 'succeeded' | 'failed';
}
export type Audit = (event: 'stale_attempt_result', data: { video_id: string; fence: number }) => void;
export const auditAttempt: Audit = (event, data) => console.info(JSON.stringify({ event, ...data }));
// Caller holds video FOR UPDATE. This also serializes eight independent render leases.
export async function leaseAttemptTx(tx: PoolClient, videoId: string, stage: JobStage,
  series: number, clipId: string | null = null, now = new Date()): Promise<Attempt | null> {
  if (!Number.isSafeInteger(series) || series < 1 || (stage === 'render') !== (clipId !== null)) throw new Error('Непригодная попытка');
  const video = await tx.query('SELECT fence FROM video WHERE id=$1 FOR UPDATE', [videoId]);
  if (!video.rowCount) return null;
  const counts = await tx.query<{ fence: number; attempt_no: number }>(`SELECT COALESCE(max(fence),0)::int AS fence,
    COALESCE(max(attempt_no) FILTER (WHERE stage=$2 AND clip_id IS NOT DISTINCT FROM $3::uuid AND series_no=$4),0)::int AS attempt_no
    FROM job_attempt WHERE video_id=$1`, [videoId, stage, clipId, series]);
  const prior = counts.rows[0]!;
  if (prior.attempt_no >= 2) return null;
  const fence = Math.max(prior.fence, video.rows[0].fence) + 1;
  if (stage === 'render') {
    const clip = await tx.query(`UPDATE clip SET render_fence=$3, status='rendering', failure_reason=NULL
      WHERE id=$1 AND video_id=$2 AND status <> 'done' RETURNING id`, [clipId, videoId, fence]);
    if (!clip.rowCount) return null;
  }
  const result = await tx.query<Attempt>(`INSERT INTO job_attempt
    (video_id,stage,clip_id,series_no,attempt_no,fence,status,unit,unit_count,started_at)
    VALUES ($1,$2,$3,$4,$5,$6,'running',$7,0,$8) RETURNING *`,
  [videoId, stage, clipId, series, prior.attempt_no + 1, fence, stage === 'stt' ? 'minutes' : stage === 'select' ? 'calls' : 'none', now]);
  await tx.query('UPDATE video SET fence=$2, updated_at=$3 WHERE id=$1', [videoId, fence, now]);
  return result.rows[0]!;
}
export const leaseAttempt = (pool: Pool, video: string, stage: JobStage, series: number, clip: string | null = null) =>
  transaction(pool, tx => leaseAttemptTx(tx, video, stage, series, clip));
// Bridge feature 2's enqueue(videoId, 1) without changing its owned video.ts.
export async function ensureInitialAttempt(pool: Pool, videoId: string): Promise<Attempt | null> {
  return transaction(pool, async tx => {
    const video = await tx.query(`SELECT v.id FROM video v JOIN account a ON a.id=v.account_id
      WHERE v.id=$1 AND v.status='queued' AND v.object_key IS NOT NULL AND v.actual_bytes > 0
      AND v.deleted_at IS NULL AND a.status='active' FOR UPDATE OF v`, [videoId]);
    if (!video.rowCount) return null;
    const existing = await tx.query<Attempt>('SELECT * FROM job_attempt WHERE video_id=$1 ORDER BY fence DESC LIMIT 1', [videoId]);
    const prior = existing.rows[0];
    if (prior) return prior.stage === 'stt' && ['running', 'deferred'].includes(prior.status) ? prior : null;
    return leaseAttemptTx(tx, videoId, 'stt', 1);
  });
}
export async function acceptRenderResult(pool: Pool, attempt: Attempt,
  result: { object_key: string; thumbnail_key: string; bytes: number }, audit: Audit = auditAttempt): Promise<boolean> {
  const accepted = await transaction(pool, async tx => {
    // Same lock order as retry/watchdog; status makes duplicate delivery one-shot.
    await tx.query('SELECT id FROM video WHERE id=$1 FOR UPDATE', [attempt.video_id]);
    const changed = await tx.query(`UPDATE clip SET status='done', object_key=$4, thumbnail_key=$5, bytes=$6
      WHERE id=$1 AND video_id=$2 AND render_fence=$3 AND status='rendering'
      AND EXISTS (SELECT 1 FROM job_attempt WHERE video_id=$2 AND fence=$3 AND stage='render' AND status='running')
      RETURNING id`, [attempt.clip_id, attempt.video_id, attempt.fence, result.object_key, result.thumbnail_key, result.bytes]);
    if (!changed.rowCount) return false;
    await tx.query("UPDATE job_attempt SET status='succeeded', finished_at=now() WHERE video_id=$1 AND fence=$2", [attempt.video_id, attempt.fence]);
    return true;
  });
  if (!accepted) audit('stale_attempt_result', attempt);
  return accepted;
}
