import type { Pool, PoolClient } from 'pg';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason } from '@clipmaker/shared/enums';
import { transaction, checkAndConsumeQuota, refundUploadSlot } from './quota.js';
import { auditAttempt, type Attempt, type Audit } from './attempts.js';
export interface ProbeSourceRow { id: string; account_id: string; object_key: string; actual_bytes: string; upload_day: string;
  status: string; fence: number; duration_seconds: string | null }
export async function getProbeSource(pool: Pool, attempt: Attempt): Promise<ProbeSourceRow | null> {
  const rows = await pool.query<ProbeSourceRow>(`SELECT v.*, v.upload_day::text FROM video v JOIN account a ON a.id=v.account_id
    JOIN job_attempt j ON j.video_id=v.id AND j.fence=$2
    WHERE v.id=$1 AND v.fence=$2 AND v.status IN ('queued','transcribing') AND v.deleted_at IS NULL
    AND a.status='active' AND j.stage='stt' AND j.status IN ('running','deferred')`, [attempt.video_id, attempt.fence]);
  return rows.rows[0] ?? null;
}
async function lockProbe(tx: PoolClient, attempt: Attempt, allowTranscribing = false): Promise<ProbeSourceRow | null> {
  const rows = await tx.query<ProbeSourceRow>(`SELECT v.*, v.upload_day::text FROM video v JOIN account a ON a.id=v.account_id
    JOIN job_attempt j ON j.video_id=v.id AND j.fence=$2
    WHERE v.id=$1 AND v.fence=$2 AND v.status = ANY($3::text[]) AND v.deleted_at IS NULL AND a.status='active'
    AND j.stage='stt' AND j.status IN ('running','deferred') FOR UPDATE OF v`, [attempt.video_id, attempt.fence, allowTranscribing ? ['queued', 'transcribing'] : ['queued']]);
  return rows.rows[0] ?? null;
}
async function failProbeTx(tx: PoolClient, attempt: Attempt, row: ProbeSourceRow, limits: Limits,
  reason: VideoFailureReason, now: Date): Promise<void> {
  await tx.query(`UPDATE video SET status='failed', failure_reason=$3, updated_at=$4, finished_at=$4
    WHERE id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, reason, now]);
  await tx.query(`UPDATE job_attempt SET status='failed', wait_reason=NULL, failure_reason=$3, finished_at=$4
    WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, reason, now]);
  await refundUploadSlot(tx, limits, row.account_id, row.upload_day, reason, now);
}
export async function failProbe(pool: Pool, attempt: Attempt, limits: Limits, reason: VideoFailureReason,
  now = new Date(), audit: Audit = auditAttempt): Promise<boolean> {
  const result = await transaction(pool, async tx => {
    const row = await lockProbe(tx, attempt); if (!row) return false;
    await failProbeTx(tx, attempt, row, limits, reason, now); return true;
  });
  if (!result) audit('stale_attempt_result', attempt);
  return result;
}
export async function deferProbe(pool: Pool, attempt: Attempt, now = new Date(), audit: Audit = auditAttempt): Promise<boolean> {
  const result = await transaction(pool, async tx => {
    if (!await lockProbe(tx, attempt, true)) return false;
    await tx.query("UPDATE video SET updated_at=$3 WHERE id=$1 AND fence=$2", [attempt.video_id, attempt.fence, now]);
    await tx.query(`UPDATE job_attempt SET status='deferred', wait_reason='no_disk'
      WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence]);
    return true;
  });
  if (!result) audit('stale_attempt_result', attempt);
  return result;
}
export async function acceptProbe(pool: Pool, attempt: Attempt, limits: Limits, duration: number, now = new Date(),
  audit: Audit = auditAttempt): Promise<'transcribing' | 'failed' | 'stale'> {
  if (!Number.isFinite(duration) || duration < 120 || duration > 5400) throw new Error('Непригодная длительность');
  const result = await transaction(pool, async tx => {
    const row = await lockProbe(tx, attempt); if (!row) return 'stale' as const;
    const minutes = Math.ceil(duration / 60);
    const quota = await checkAndConsumeQuota(tx, limits, row.account_id, 'minutes', minutes, now);
    if (!quota.granted) {
      await failProbeTx(tx, attempt, row, limits,
        quota.scope === 'user_minutes' ? 'refused_user_minutes' : 'refused_global_minutes', now);
      return 'failed' as const;
    }
    await tx.query(`UPDATE video SET status='transcribing', duration_seconds=$3, minutes_charged=$4, updated_at=$5
      WHERE id=$1 AND fence=$2 AND status='queued'`, [attempt.video_id, attempt.fence, duration, minutes, now]);
    await tx.query(`UPDATE job_attempt SET status='running', wait_reason=NULL, unit_count=$3
      WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, minutes]);
    return 'transcribing' as const;
  });
  if (result === 'stale') audit('stale_attempt_result', attempt);
  return result;
}

// An explicitly pending continuation has a live consumer, not a silent failed worker.
export async function heartbeatTranscription(pool: Pool, attempt: Attempt, now = new Date()): Promise<boolean> {
  const result = await pool.query(`UPDATE video SET updated_at=$3 WHERE id=$1 AND fence=$2 AND status='transcribing'
    AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM job_attempt j WHERE j.video_id=$1 AND j.fence=$2 AND j.status='running')`,
  [attempt.video_id, attempt.fence, now]);
  return Boolean(result.rowCount);
}
