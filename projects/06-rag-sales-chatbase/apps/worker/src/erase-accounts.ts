// Стирание аккаунтов — шаг сторожа worker-index (фича account-erasure; FR-AUTH-002, NFR-SEC-003; A-N6-054).
// Донор — N5 projects/05-podcast-clips-opus/apps/web/src/server/retention.ts (retentionTick) — АДАПТИРОВАНО: живёт в
// воркере (у N6 сторож — worker-index, канон §6), вместо S3 — том uploads с сырыми PDF (ADR-018); сессионная
// advisory-блокировка на весь проход (реплики воркера не стирают один аккаунт вдвоём); наблюдение просрочки ДО попыток;
// сбой одного аккаунта не останавливает остальных и сдвигает его в конец очереди (erase_attempted_at).
import { ERASURE_BATCH } from '@n6/rag';
import { eraseAccount, erasureUploadJobIds, listErasableAccounts, markErasureAttemptFailed, observeErasureOverdue, type Pool } from '@n6/db';
import { removeUpload } from './pdf/uploads';

export const ERASURE_LOCK_KEY = 60_921_017;
export interface ErasureTickResult { overdue: number; erased: number; waitingPayout: number; failed: number }
export interface ErasureDeps { removeUpload: (dir: string, indexJobId: string) => Promise<boolean>; log: (line: string) => void }
const DEFAULT_DEPS: ErasureDeps = { removeUpload, log: (line) => console.error(line) };

// null — другой процесс держит блокировку (проход уже идёт), это не ошибка и не «сделано».
export async function erasureTick(pool: Pool, uploadDir: string, now = new Date(), batch = ERASURE_BATCH, deps: ErasureDeps = DEFAULT_DEPS): Promise<ErasureTickResult | null> {
  const lease = await pool.connect();
  try {
    const locked = (await lease.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [ERASURE_LOCK_KEY])).rows[0]?.locked;
    if (!locked) return null;
    try {
      const result: ErasureTickResult = { overdue: 0, erased: 0, waitingPayout: 0, failed: 0 };
      result.overdue = await observeErasureOverdue(pool, now);
      if (result.overdue > 0) deps.log(`СИГНАЛ ОПЕРАТОРУ: удаление аккаунтов просрочено (срок 72 ч) — ${result.overdue}; npm run ops:erasure -- overdue`);
      for (const accountId of await listErasableAccounts(pool, now, batch)) {
        try {
          // Внешние объекты — ДО строк и ДО отметки deleted (N4 RV-02): после удаления задач имён файлов не найти.
          for (const job of await erasureUploadJobIds(pool, accountId)) await deps.removeUpload(uploadDir, job);
          const outcome = await eraseAccount(pool, accountId, now);
          if (outcome.kind === 'erased') result.erased++;
          else if (outcome.kind === 'waiting_payout') result.waitingPayout++;
        } catch {
          result.failed++;
          deps.log('Стирание аккаунта не завершено — повтор следующим проходом (npm run ops:erasure -- list)');
          try { await markErasureAttemptFailed(pool, accountId, now); } catch { deps.log('Очередь стирания: отметка неудачной попытки не записана'); }
        }
      }
      return result;
    } finally {
      await lease.query('SELECT pg_advisory_unlock($1)', [ERASURE_LOCK_KEY]);
    }
  } finally {
    lease.release();
  }
}
