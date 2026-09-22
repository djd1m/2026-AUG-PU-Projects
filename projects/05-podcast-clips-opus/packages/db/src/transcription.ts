import type { Pool, PoolClient } from 'pg';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason } from '@clipmaker/shared/enums';
import { parseTranscript, STT_JOB_TIMEOUT_MS, STT_MAX_ATTEMPTS, type TranscriptResult } from '@clipmaker/shared/transcript';
import { transaction, checkAndConsumeQuota } from './quota.js';
import { auditAttempt, leaseAttemptTx, type Attempt } from './attempts.js';
interface Current { account_id: string; duration_seconds: string; minutes_charged: number; stt_calls: Record<string, number>; started_at: Date }
async function lockCurrent(tx: PoolClient, attempt: Attempt): Promise<Current | undefined> {
  const result = await tx.query<Current>(`SELECT v.account_id,v.duration_seconds,v.minutes_charged,j.stt_calls,j.started_at
    FROM video v JOIN account a ON a.id=v.account_id JOIN job_attempt j ON j.video_id=v.id AND j.fence=$2
    WHERE v.id=$1 AND v.fence=$2 AND v.status='transcribing' AND v.deleted_at IS NULL AND a.status='active'
      AND j.stage='stt' AND j.status IN ('running','deferred') FOR UPDATE OF v`, [attempt.video_id, attempt.fence]);
  return result.rows[0];
}
async function failTx(tx: PoolClient, attempt: Attempt, reason: VideoFailureReason, now: Date) {
  await tx.query(`UPDATE video SET status='failed',failure_reason=$3,updated_at=$4,finished_at=$4 WHERE id=$1 AND fence=$2`,
    [attempt.video_id, attempt.fence, reason, now]);
  await tx.query(`UPDATE job_attempt SET status='failed',failure_reason=$3,wait_reason=NULL,finished_at=$4 WHERE video_id=$1 AND fence=$2`,
    [attempt.video_id, attempt.fence, reason, now]);
}
export async function failTranscription(pool: Pool, attempt: Attempt, reason: VideoFailureReason, now = new Date()) {
  return transaction(pool, async tx => {
    if (!await lockCurrent(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return false; }
    await failTx(tx, attempt, reason, now); return true;
  });
}
export async function transcriptionDeadline(pool: Pool, attempt: Attempt): Promise<number | null> {
  return transaction(pool, async tx => {
    const row = await lockCurrent(tx, attempt);
    return row ? row.started_at.getTime() + STT_JOB_TIMEOUT_MS : null;
  });
}
// Initial full-file charge belongs to acceptProbe. Only first dispatch of each
// chunk can use it; every replay (including unknown/crashed outcomes) pays again.
export async function authorizeSttCall(pool: Pool, attempt: Attempt, limits: Limits, chunkIndex: number,
  duration: number, now = new Date()): Promise<number | null> {
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !Number.isFinite(duration) || duration <= 0 || duration > 5400) throw new Error('Непригодный чанк');
  return transaction(pool, async tx => {
    const row = await lockCurrent(tx, attempt);
    if (!row) { auditAttempt('stale_attempt_result', attempt); return null; }
    if (now.getTime() >= row.started_at.getTime() + STT_JOB_TIMEOUT_MS) { await failTx(tx, attempt, 'stalled', now); return null; }
    if (!(row.minutes_charged >= Math.ceil(Number(row.duration_seconds) / 60))) throw new Error('Первичная квота не списана');
    const previous = row.stt_calls[String(chunkIndex)] ?? 0;
    if (previous >= STT_MAX_ATTEMPTS) { await failTx(tx, attempt, 'stt_failed', now); return null; }
    const minutes = Math.ceil(duration / 60);
    if (previous > 0) {
      const quota = await checkAndConsumeQuota(tx, limits, row.account_id, 'minutes', minutes, now);
      if (!quota.granted) {
        await failTx(tx, attempt, quota.scope === 'user_minutes' ? 'refused_user_minutes' : 'refused_global_minutes', now);
        return null;
      }
      await tx.query('UPDATE video SET minutes_charged=minutes_charged+$3 WHERE id=$1 AND fence=$2', [attempt.video_id, attempt.fence, minutes]);
      await tx.query('UPDATE job_attempt SET unit_count=unit_count+$3 WHERE video_id=$1 AND fence=$2', [attempt.video_id, attempt.fence, minutes]);
    }
    await tx.query(`UPDATE job_attempt SET stt_calls=jsonb_set(stt_calls,ARRAY[$3::text],to_jsonb($4::int)),status='running',wait_reason=NULL
      WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, String(chunkIndex), previous + 1]);
    await tx.query('UPDATE video SET updated_at=$3 WHERE id=$1 AND fence=$2', [attempt.video_id, attempt.fence, now]);
    return previous + 1;
  });
}
export async function acceptTranscript(pool: Pool, attempt: Attempt, transcript: TranscriptResult, chunkCount: number,
  now = new Date()): Promise<Attempt | null> {
  return transaction(pool, async tx => {
    const row = await lockCurrent(tx, attempt);
    if (!row) { auditAttempt('stale_attempt_result', attempt); return null; }
    if (now.getTime() >= row.started_at.getTime() + STT_JOB_TIMEOUT_MS) { await failTx(tx, attempt, 'stalled', now); return null; }
    const validated = parseTranscript(transcript, Number(row.duration_seconds));
    const saved = await tx.query(`INSERT INTO transcript(video_id,language,duration_seconds,chunk_count,words,segments,fence)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(video_id) DO UPDATE SET language=EXCLUDED.language,
      duration_seconds=EXCLUDED.duration_seconds,chunk_count=EXCLUDED.chunk_count,words=EXCLUDED.words,segments=EXCLUDED.segments,fence=EXCLUDED.fence
      WHERE transcript.fence < EXCLUDED.fence RETURNING id`,
    [attempt.video_id, validated.language, row.duration_seconds, chunkCount, JSON.stringify(validated.words), JSON.stringify(validated.segments), attempt.fence]);
    if (!saved.rowCount) { auditAttempt('stale_attempt_result', attempt); return null; }
    await tx.query(`UPDATE job_attempt SET status='succeeded',finished_at=$3 WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, now]);
    await tx.query(`UPDATE video SET status='selecting',stage_progress=0,updated_at=$3 WHERE id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, now]);
    const next = await leaseAttemptTx(tx, attempt.video_id, 'select', attempt.series_no, null, now);
    if (!next) throw new Error('Не удалось создать попытку select');
    return next;
  });
}
