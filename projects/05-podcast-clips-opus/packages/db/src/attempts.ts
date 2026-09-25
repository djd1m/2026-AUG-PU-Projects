import type { Pool, PoolClient } from 'pg';
import type { JobStage } from '@clipmaker/shared/enums';
import { transaction } from './quota.js';
export interface Attempt {
  rerender?: boolean;
  video_id: string; stage: JobStage; clip_id: string | null; series_no: number;
  fence: number; attempt_no: number; status: 'running' | 'deferred' | 'succeeded' | 'failed';
}
export type Audit = (event: 'stale_attempt_result', data: { video_id: string; fence: number }) => void;
export const auditAttempt: Audit = (event, data) => console.info(JSON.stringify({ event, ...data }));
// Caller holds video FOR UPDATE. This also serializes eight independent render leases.
export async function leaseAttemptTx(tx: PoolClient, videoId: string, stage: JobStage,
  series: number, clipId: string | null = null, now = new Date(), rerender = false): Promise<Attempt | null> {
  if (rerender && stage !== 'render') throw new Error('Пересборка требует render');
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
    const clip = await tx.query(rerender
      ? `UPDATE clip SET render_fence=$3 WHERE id=$1 AND video_id=$2 AND status='done' RETURNING id`
      : `UPDATE clip SET render_fence=$3, status='rendering', failure_reason=NULL
      WHERE id=$1 AND video_id=$2 AND status <> 'done' RETURNING id`, [clipId, videoId, fence]);
    if (!clip.rowCount) return null;
  }
  const result = await tx.query<Attempt>(`INSERT INTO job_attempt
    (video_id,stage,clip_id,series_no,attempt_no,fence,status,unit,unit_count,started_at,rerender)
    VALUES ($1,$2,$3,$4,$5,$6,'running',$7,0,$8,$9) RETURNING *`,
  [videoId, stage, clipId, series, prior.attempt_no + 1, fence, stage === 'stt' ? 'minutes' : stage === 'select' ? 'calls' : 'none', now, rerender]);
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
