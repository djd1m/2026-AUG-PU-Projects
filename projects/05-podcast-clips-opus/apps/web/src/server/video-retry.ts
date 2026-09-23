import { transaction, leaseAttemptTx, checkAndConsumeQuota, FILE_FAILURES, type Attempt, type Pool } from '@clipmaker/db';
import type { Limits } from '@clipmaker/shared/config';
import type { VideoFailureReason } from '@clipmaker/shared/enums';
import { UploadError, quotaError } from './upload-contract';
export function assertRetryable(row: { status: string; failure_reason: VideoFailureReason | null; object_key: string | null; actual_bytes: string | null }) {
  if (row.status !== 'failed') throw new UploadError('conflict', 'Повторять нечего', 409);
  if (row.failure_reason && FILE_FAILURES.includes(row.failure_reason)) throw new UploadError('conflict', 'Загрузите другой файл', 409);
  if (!row.object_key || row.actual_bytes === null || BigInt(row.actual_bytes) <= 0n) {
    throw new UploadError('conflict', 'Загрузка не завершилась, начните заново', 409);
  }
}
export class VideoRetryService {
  constructor(private readonly pool: Pool, private readonly limits: Limits,
    private readonly enqueue: (attempt: Attempt) => Promise<void>, private readonly clock = () => new Date()) {}
  async retry(account: string, videoId: string): Promise<{ video_id: string; status: string }> {
    const result = await transaction(this.pool, async tx => {
      const video = await tx.query(`SELECT v.* FROM video v JOIN account a ON a.id=v.account_id
        WHERE v.id=$1 AND v.account_id=$2 AND v.deleted_at IS NULL AND a.status='active' FOR UPDATE OF v`, [videoId, account]);
      if (!video.rowCount) throw new UploadError('not_found', 'Запись не найдена', 404);
      assertRetryable(video.rows[0]);
      const transcript = await tx.query('SELECT id FROM transcript WHERE video_id=$1', [videoId]);
      const clips = await tx.query<{ id: string; status: string }>('SELECT id,status FROM clip WHERE video_id=$1 ORDER BY id', [videoId]);
      const stage = !transcript.rowCount ? 'stt' : !clips.rowCount ? 'select' : 'render';
      const pending = clips.rows.filter(c => c.status !== 'done');
      if (stage === 'render' && !pending.length) throw new UploadError('conflict', 'Все клипы уже готовы', 409);
      const now = this.clock();
      if (stage === 'select') {
        const quota = await checkAndConsumeQuota(tx, this.limits, account, 'llm', 1, now);
        if (!quota.granted) {
          await tx.query('UPDATE video SET failure_reason=$2, updated_at=$3 WHERE id=$1',
            [videoId, quota.scope === 'user_llm' ? 'refused_user_llm' : 'refused_global_llm', now]);
          return { refused: quota.scope, refusedAt: now, status: 'failed', jobs: [] };
        }
      }
      const series = (await tx.query<{ series: number }>('SELECT COALESCE(max(series_no),0)+1 AS series FROM job_attempt WHERE video_id=$1', [videoId])).rows[0]!.series;
      await tx.query(`UPDATE job_attempt SET status='failed', failure_reason='stale_attempt_result', finished_at=$2
        WHERE video_id=$1 AND status IN ('running','deferred')`, [videoId, now]);
      const jobs: Attempt[] = [];
      for (const clip of stage === 'render' ? pending : [{ id: null }]) {
        const job = await leaseAttemptTx(tx, videoId, stage, series, clip.id, now);
        if (!job) throw new Error('Новая серия не получила попытку');
        jobs.push(job);
      }
      const status = stage === 'stt' ? 'queued' : stage === 'select' ? 'selecting' : 'rendering';
      await tx.query(`UPDATE video SET status=$2, failure_reason=NULL, updated_at=$3, finished_at=NULL WHERE id=$1`, [videoId, status, now]);
      if (stage === 'select') await tx.query('UPDATE job_attempt SET unit_count=1 WHERE video_id=$1 AND series_no=$2', [videoId, series]);
      return { status, jobs, refused: null };
    });
    if (result.refused) throw quotaError(result.refused, result.refusedAt!);
    // Commit is authoritative. A failed Redis publish is recovered by watchdog.
    for (const job of result.jobs) {
      try { await this.enqueue(job); } catch (error) { console.error('Повтор сохранён; сторож восстановит доставку задания', error); }
    }
    return { video_id: videoId, status: result.status };
  }
}
