import { retentionTick, RETENTION_INTERVAL_MS, type RetentionStorage } from './retention';
const retentionLastRun = new WeakMap<Pool, number>();
import { transaction, ensureInitialAttempt, type Attempt, type Pool } from '@clipmaker/db';
import { DEFER_DELAY_MS, STALLED_AFTER_MS, WATCHDOG_INTERVAL_MS } from '@clipmaker/queue';
// Per-process cursor keeps retained jobs from starving attempts beyond the batch boundary.
const recoveryCursor = new WeakMap<Pool, string>();
export async function watchdogTick(pool: Pool, enqueue: (job: Attempt, delay?: number) => Promise<void>, now = new Date(), batch = 100, storage?: RetentionStorage) {
  let step = 'закрытие зависших задач';
  try {
  const failed = await transaction(pool, async tx => {
    const stale = await tx.query<{ id: string }>(`SELECT id FROM video
      WHERE status IN ('queued','transcribing','selecting','rendering') AND deleted_at IS NULL AND updated_at < $1
      ORDER BY updated_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [new Date(now.getTime() - STALLED_AFTER_MS), batch]);
    for (const { id } of stale.rows) {
      await tx.query("UPDATE video SET status='failed', failure_reason='stalled', finished_at=$2, updated_at=$2 WHERE id=$1", [id, now]);
      await tx.query("UPDATE clip SET status='failed', failure_reason='ffmpeg_timeout' WHERE video_id=$1 AND status <> 'done'", [id]);
      await tx.query(`UPDATE job_attempt SET status='failed', failure_reason='stalled', finished_at=$2
        WHERE video_id=$1 AND status IN ('running','deferred')`, [id, now]);
    }
    return stale.rowCount;
  });
  step = 'создание отсутствующих попыток';
  const missing = await pool.query<{ id: string }>(`SELECT v.id FROM video v JOIN account a ON a.id=v.account_id
    WHERE v.status='queued' AND v.deleted_at IS NULL AND a.status='active'
    AND NOT EXISTS (SELECT 1 FROM job_attempt j WHERE j.video_id=v.id) ORDER BY v.updated_at LIMIT $1`, [batch]);
  for (const { id } of missing.rows) await ensureInitialAttempt(pool, id);
  step = 'восстановление доставки заданий';
  // Also recover publish failures after retries into select/render (not only queued).
  const readPending = (cursor: string | null) => pool.query<Attempt & { id: string; updated_at: Date; video_status: string }>(`SELECT j.*, v.updated_at, v.status AS video_status FROM job_attempt j
    JOIN video v ON v.id=j.video_id JOIN account a ON a.id=v.account_id
    WHERE j.status IN ('running','deferred') AND v.status IN ('queued','transcribing','selecting','rendering')
    AND v.deleted_at IS NULL AND a.status='active'
    AND ((j.stage <> 'render' AND j.fence=v.fence) OR (j.stage='render' AND EXISTS
      (SELECT 1 FROM clip c WHERE c.id=j.clip_id AND c.render_fence=j.fence AND c.status='rendering')))
    AND ($2::uuid IS NULL OR j.id > $2::uuid)
    ORDER BY j.id LIMIT $1`, [batch, cursor]);
  let pending = await readPending(recoveryCursor.get(pool) ?? null);
  if (!pending.rows.length && recoveryCursor.has(pool)) pending = await readPending(null);
  const last = pending.rows.at(-1);
  if (last) recoveryCursor.set(pool, last.id); else recoveryCursor.delete(pool);
  let published = 0;
  for (const job of pending.rows) {
    const delay = job.status === 'deferred' ? Math.max(0, job.updated_at.getTime() + DEFER_DELAY_MS - now.getTime()) : 0;
    try { await enqueue(job, delay); published++; } catch (error) { console.error('Сторож: транспорт заданий недоступен', error); }
  }
  if (storage && now.getTime() - (retentionLastRun.get(pool) ?? -Infinity) >= RETENTION_INTERVAL_MS) {
    step = 'retention';
    const result = await retentionTick(pool, storage, now, batch);
    if (result && !result.backlog) retentionLastRun.set(pool, now.getTime());
  }
  return { failed, published };
  } catch (error) {
    console.error(`Сторож: шаг «${step}» не завершён`, error);
    throw error;
  }
}
export function startWatchdog(tick: () => Promise<unknown>, onError: (error: unknown) => void = (error) => console.error('Сторож: проход не завершён', error)) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (error) { onError(error); } finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, WATCHDOG_INTERVAL_MS);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
