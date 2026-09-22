import { transaction, leaseAttemptTx, auditAttempt, type Pool, type Attempt } from '@clipmaker/db';
// Transport/download errors create a new fenced DB attempt, not BullMQ retries.
export async function retryProbe(pool: Pool, attempt: Attempt): Promise<Attempt | null> {
  return transaction(pool, async tx => {
    const current = await tx.query(`SELECT id FROM video WHERE id=$1 AND fence=$2 AND status='queued' FOR UPDATE`,
      [attempt.video_id, attempt.fence]);
    if (!current.rowCount) { auditAttempt('stale_attempt_result', attempt); return null; }
    const failed = await tx.query(`UPDATE job_attempt SET status='failed', failure_reason='stt_failed', finished_at=now()
      WHERE video_id=$1 AND fence=$2 AND status IN ('running','deferred') RETURNING id`, [attempt.video_id, attempt.fence]);
    if (!failed.rowCount) return null;
    const next = await leaseAttemptTx(tx, attempt.video_id, 'stt', attempt.series_no);
    if (!next) await tx.query(`UPDATE video SET status='failed', failure_reason='stt_failed', updated_at=now(), finished_at=now()
      WHERE id=$1 AND fence=$2`, [attempt.video_id, attempt.fence]);
    return next;
  });
}
