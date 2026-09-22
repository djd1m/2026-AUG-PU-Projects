import { createClipLink } from './clip-link.js';
import type { Pool, PoolClient } from 'pg';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason } from '@clipmaker/shared/enums';
import { validateFragments, type Fragment } from '@clipmaker/shared/fragments';
import { parseTranscript, type TranscriptResult } from '@clipmaker/shared/transcript';
import { transaction, checkAndConsumeQuota } from './quota.js';
import { auditAttempt, leaseAttemptTx, type Attempt } from './attempts.js';
interface Current { account_id: string; plan: string; duration_seconds: string; unit_count: number; llm_dispatched: boolean; started_at: Date }
async function lockCurrent(tx: PoolClient, attempt: Attempt): Promise<Current | undefined> {
  const result = await tx.query<Current>(`SELECT v.account_id,a.plan,v.duration_seconds,j.unit_count,j.llm_dispatched,j.started_at
    FROM video v JOIN account a ON a.id=v.account_id JOIN job_attempt j ON j.video_id=v.id AND j.fence=$2
    WHERE v.id=$1 AND v.fence=$2 AND v.status='selecting' AND v.deleted_at IS NULL AND a.status='active'
      AND j.stage='select' AND j.status='running' FOR UPDATE OF v`, [attempt.video_id, attempt.fence]);
  return result.rows[0];
}
async function failTx(tx: PoolClient, attempt: Attempt, reason: VideoFailureReason, now: Date) {
  await tx.query(`UPDATE video SET status='failed',failure_reason=$3,updated_at=$4,finished_at=$4 WHERE id=$1 AND fence=$2`,
    [attempt.video_id, attempt.fence, reason, now]);
  await tx.query(`UPDATE job_attempt SET status='failed',failure_reason=$3,finished_at=$4 WHERE video_id=$1 AND fence=$2`,
    [attempt.video_id, attempt.fence, reason, now]);
}
export async function failSelection(pool: Pool, attempt: Attempt, reason: VideoFailureReason, now = new Date()) {
  return transaction(pool, async tx => {
    if (!await lockCurrent(tx, attempt)) { auditAttempt('stale_attempt_result', attempt); return false; }
    await failTx(tx, attempt, reason, now); return true;
  });
}
async function readTranscript(tx: PoolClient, video: string, duration: number): Promise<TranscriptResult> {
  const result = await tx.query('SELECT language,words,segments FROM transcript WHERE video_id=$1', [video]);
  return parseTranscript(result.rows[0], duration);
}
// A committed dispatch claim cannot be replayed for free after a crash or a
// duplicate queue delivery. Owner retry opens a new series; no automatic LLM retry.
export async function authorizeSelection(pool: Pool, attempt: Attempt, limits: Limits, model: string, now = new Date()) {
  return transaction(pool, async tx => {
    const row = await lockCurrent(tx, attempt);
    if (!row) { auditAttempt('stale_attempt_result', attempt); return null; }
    if (now.getTime() - row.started_at.getTime() >= 30 * 60_000) { await failTx(tx, attempt, 'stalled', now); return null; }
    const duration = Number(row.duration_seconds);
    let transcript: TranscriptResult;
    try { transcript = await readTranscript(tx, attempt.video_id, duration); }
    catch { await failTx(tx, attempt, 'no_timestamps', now); return null; }
    // The joined SELECT can carry an older job_attempt snapshot while waiting
    // for video. Only this conditional UPDATE grants the right to spend.
    const claimed = await tx.query<{ unit_count: number }>(`UPDATE job_attempt SET llm_dispatched=true
      WHERE video_id=$1 AND fence=$2 AND stage='select' AND status='running' AND llm_dispatched=false
      RETURNING unit_count`, [attempt.video_id, attempt.fence]);
    const claim = claimed.rows[0];
    if (!claim) return null;
    // RetryVideo reserves exactly one call in its transaction, before enqueue.
    if (claim.unit_count === 0) {
      const quota = await checkAndConsumeQuota(tx, limits, row.account_id, 'llm', 1, now);
      if (!quota.granted) {
        await failTx(tx, attempt, quota.scope === 'user_llm' ? 'refused_user_llm' : 'refused_global_llm', now); return null;
      }
    } else if (claim.unit_count !== 1) throw new Error('Непригодный резерв вызова');
    await tx.query(`UPDATE job_attempt SET unit_count=1,provider='openrouter',model=$3
      WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, model]);
    await tx.query('UPDATE video SET updated_at=$3 WHERE id=$1 AND fence=$2', [attempt.video_id, attempt.fence, now]);
    return { transcript, duration };
  });
}
export async function acceptSelection(pool: Pool, attempt: Attempt, fragments: Fragment[], now = new Date()): Promise<Attempt[] | null> {
  return transaction(pool, async tx => {
    const row = await lockCurrent(tx, attempt);
    if (!row) { auditAttempt('stale_attempt_result', attempt); return null; }
    if (!row.llm_dispatched || row.unit_count !== 1) throw new Error('Вызов не авторизован');
    const duration = Number(row.duration_seconds), transcript = await readTranscript(tx, attempt.video_id, duration);
    const valid = validateFragments({ fragments }, transcript, duration);
    if (!valid.length) { await failTx(tx, attempt, 'no_fragments', now); return []; }
    if (JSON.stringify(valid) !== JSON.stringify(fragments)) throw new Error('Непроверенные фрагменты на границе БД');
    const jobs: Attempt[] = [];
    for (const [index, f] of valid.entries()) {
      const clip = await tx.query<{ id: string }>(`INSERT INTO clip(video_id,"index",start_seconds,end_seconds,title,score,
        score_hook,score_completeness,score_length,explain_hook,explain_completeness,explain_length,status,watermarked)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'queued',$13) RETURNING id`,
      [attempt.video_id, index + 1, f.start_seconds, f.end_seconds, f.title, f.score, f.score_hook,
        f.score_completeness, f.score_length, f.explain_hook, f.explain_completeness, f.explain_length, row.plan !== 'paid']);
      const id = clip.rows[0]!.id;
      await createClipLink(tx, id);
      const next = await leaseAttemptTx(tx, attempt.video_id, 'render', attempt.series_no, id, now);
      if (!next) throw new Error('Не удалось создать попытку рендера');
      jobs.push(next);
    }
    await tx.query(`UPDATE job_attempt SET status='succeeded',finished_at=$3 WHERE video_id=$1 AND fence=$2`, [attempt.video_id, attempt.fence, now]);
    // Video row remains locked throughout; render leases have advanced its fence.
    await tx.query(`UPDATE video SET status='rendering',clips_total=$2,clips_done=0,stage_progress=0,
      failure_reason=NULL,finished_at=NULL,updated_at=$3 WHERE id=$1`, [attempt.video_id, jobs.length, now]);
    return jobs;
  });
}
