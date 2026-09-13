// `SweepStuckScans` (FR-scan-pipeline-16, `02_pseudocode.md`). Три независимых, идемпотентных
// правила — ОТДЕЛЬНЫЙ шаг цикла опроса `recognizer`, не отдельный сервис. Правило В ОБЯЗАНО
// исключать задания с ЖИВОЙ арендой (`leased_until` в будущем) — живой воркер отслеживает
// свой бюджет сам (`RecognizeScanWithinScanPipeline` шаг 1а/AbortController); без этого
// условия sweeper мог бы перевести в `failed(timeout)` задание, которое ЕЩЁ обрабатывает
// живой воркер (PC2-02).

import type { DbPool } from '@n4/db';
import { CANON } from '@n4/shared';

const RULE_A_NEVER_LEASED = `
  UPDATE recognition
  SET status = 'failed', failure_reason = 'timeout', finished_at = now()
  WHERE status = 'queued' AND leased_until IS NULL AND created_at < now() - interval '${CANON.neverLeasedSweepMs} milliseconds'
`;

const RULE_B_LEASE_LIMIT_EXHAUSTED = `
  UPDATE recognition
  SET status = 'failed', failure_reason = 'timeout', finished_at = now()
  WHERE status = 'queued' AND lease_fence >= ${CANON.maxLeaseFence} AND leased_until IS NOT NULL AND leased_until < now()
`;

const RULE_C_TASK_BUDGET_EXPIRED_NO_LIVE_LEASE = `
  UPDATE recognition
  SET status = 'failed', failure_reason = 'timeout', finished_at = now()
  WHERE status = 'queued'
    AND lease_fence >= 1
    AND created_at < now() - interval '${CANON.scanTaskBudgetMs} milliseconds'
    AND (leased_until IS NULL OR leased_until < now())
`;

export interface SweepResult {
  readonly neverLeased: number;
  readonly leaseLimitExhausted: number;
  readonly taskBudgetExpired: number;
}

export async function sweepStuckScans(pool: DbPool): Promise<SweepResult> {
  const a = await pool.query(RULE_A_NEVER_LEASED);
  const b = await pool.query(RULE_B_LEASE_LIMIT_EXHAUSTED);
  const c = await pool.query(RULE_C_TASK_BUDGET_EXPIRED_NO_LIVE_LEASE);
  return {
    neverLeased: a.rowCount ?? 0,
    leaseLimitExhausted: b.rowCount ?? 0,
    taskBudgetExpired: c.rowCount ?? 0,
  };
}
