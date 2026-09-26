// из N5: projects/05-podcast-clips-opus/apps/web/src/server/watchdog.ts — адаптировано: живёт в worker-index
// (канон §6), шаги WatchdogTick N6: (1) running без updated_at 5 мин → failed(stalled) с подъёмом фенса;
// (2) предел задачи 15 мин от начала серии → failed(stalled) (A-N6-025); (3) queued без движения 2 мин →
// повторная доставка той же идентичности (BullMQ не дублирует живое задание); (4) draft старше 24 ч → удалить.
// FOR UPDATE SKIP LOCKED и пачки — из N5; startWatchdog — без изменений. Шаг 5 Pseudocode (152-ФЗ): текст вопроса
// «не знаю» старше 14 дней и история посетителя старше 30 минут стираются (visitor-ask-and-limits, sweepVisitorText);
// стирание аккаунтов — фича account-erasure.
import { closeFailedTx, sweepVisitorText, transaction, type Pool } from '@n6/db';
import { DRAFT_TTL_MS, JOB_DEADLINE_MS, REDELIVER_QUEUED_AFTER_MS, STALLED_AFTER_MS, WATCHDOG_BATCH, WATCHDOG_INTERVAL_MS,
  type IndexMessage } from '@n6/queue';

export interface WatchdogResult { stalled: number; overdue: number; redelivered: number; draftsDeleted: number; questionTexts: number; histories: number }

async function closeWhere(pool: Pool, select: string, params: unknown[], now: Date): Promise<number> {
  return transaction(pool, async (tx) => {
    const rows = await tx.query<{ id: string }>(select, params);
    for (const { id } of rows.rows) await closeFailedTx(tx, id, 'stalled', now);
    return rows.rowCount ?? 0;
  });
}

export async function watchdogTick(pool: Pool, enqueue: (message: IndexMessage) => Promise<void>, now = new Date(), batch = WATCHDOG_BATCH): Promise<WatchdogResult> {
  let step = 'зависшие задачи';
  try {
    // Молчание дольше 5 мин — отказ stalled, а не «выполняется» (SC-US-016-3).
    const stalled = await closeWhere(pool, `SELECT id FROM index_job WHERE status = 'running' AND updated_at < $1
      ORDER BY updated_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [new Date(now.getTime() - STALLED_AFTER_MS), batch], now);
    step = 'предел задачи';
    // Живая, но бесконечная задача: предел 15 мин от первой попытки ТЕКУЩЕЙ серии.
    const overdue = await closeWhere(pool, `SELECT j.id FROM index_job j WHERE j.status = 'running' AND (SELECT min(a.started_at)
      FROM job_attempt a WHERE a.index_job_id = j.id AND a.series_no = (SELECT max(series_no) FROM job_attempt WHERE index_job_id = j.id)) < $1
      ORDER BY j.updated_at LIMIT $2 FOR UPDATE OF j SKIP LOCKED`, [new Date(now.getTime() - JOB_DEADLINE_MS), batch], now);
    step = 'повторная доставка';
    const queued = await pool.query<{ id: string; current_fence: string }>(`SELECT id, current_fence FROM index_job
      WHERE status = 'queued' AND updated_at < $1 ORDER BY updated_at LIMIT $2`, [new Date(now.getTime() - REDELIVER_QUEUED_AFTER_MS), batch]);
    let redelivered = 0;
    for (const job of queued.rows) {
      try { await enqueue({ index_job_id: job.id, generation: Number(job.current_fence) }); redelivered++; }
      catch { console.error('Сторож: транспорт заданий недоступен, задача останется queued до следующего прохода'); }
    }
    step = 'просроченные черновики';
    // Предпросмотр без claim живёт 24 ч (канон §7); каскад удаляет источники, задачи, фрагменты, preview.
    const drafts = await pool.query(`DELETE FROM bot WHERE id IN (SELECT id FROM bot WHERE status = 'draft' AND created_at < $1
      ORDER BY created_at LIMIT $2)`, [new Date(now.getTime() - DRAFT_TTL_MS), batch]);
    step = 'персональные данные посетителей';
    const swept = await sweepVisitorText(pool, batch);
    return { stalled, overdue, redelivered, draftsDeleted: drafts.rowCount ?? 0, ...swept };
  } catch (error) {
    console.error(`Сторож: шаг «${step}» не завершён`);
    throw error;
  }
}

export function startWatchdog(tick: () => Promise<unknown>, onError: (error: unknown) => void = () => console.error('Сторож: проход не завершён')) {
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
