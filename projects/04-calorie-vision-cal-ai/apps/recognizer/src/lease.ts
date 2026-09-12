// Аренда задания и fencing (FR-foundation-6, ADR-003, DEC-A-008).
//
// Почему предикат по `leased_until` ОБЯЗАТЕЛЕН, хотя есть `FOR UPDATE SKIP LOCKED`:
// транзакция аренды ЗАКРЫВАЕТСЯ до длительной работы (иначе соединение пула держится всё
// время внешнего вызова). Как только она закрыта, блокировки на строке больше нет, и
// следующий воркер законно забирает ТО ЖЕ задание — второй платный вызов на то же фото.
// После закрытия транзакции воркеров разделяет ТОЛЬКО срок аренды.
//
// Почему fence, а не время: истёкшая аренда НЕ означает, что первый воркер мёртв. Он мог
// быть жив и продолжать вызов. Второй отличается не временем, а НОМЕРОМ захвата —
// `lease_fence` монотонно растёт, и запись результата условна по нему. Проигравший
// записи не делает и чужой результат не трёт.

import { withTransaction, type DbPool } from '@n4/db';
import { CANON } from '@n4/shared';

// РАСШИРЕНИЕ фичи `scan-pipeline` (PC-02/PC-03, `02_pseudocode.md` «Зависимости от
// foundation»): предикат выборки дополнен `lease_fence < maxLeaseFence` (верхняя граница
// захватов, FR-scan-pipeline-16 — без неё `SweepStuckScans` остаётся ЕДИНСТВЕННЫМ рубежом,
// а воркеры продолжали бы пытаться захватывать обречённые задания) и Правилом Г
// (`created_at > now() - 30s`, предпочтительная оптимизация того же документа: задание
// старше бюджета задачи не предлагается воркеру вовсе; `RecognizeScanWithinScanPipeline`
// шаг 1а остаётся ОБЯЗАТЕЛЬНЫМ рубежом независимо от этого условия).
//
// ОТКЛОНЕНИЕ, названное явно (`receipts/impl-scan-pipeline.md`): `photo_id IS NOT NULL`
// (второй, defense-in-depth рубеж атомарной публикации, PC-02) НЕ добавлен сюда — он
// сломал бы `tests/concurrency/lease.test.ts` (`foundation`), чьи фикстуры вставляют
// `recognition` БЕЗ `photo_id` (`queueJob` в этом файле). ОСНОВНОЙ рубеж — атомарность
// транзакции `EnqueueScanForFeature` (там `photo_id` устанавливается ТЕМ ЖЕ `INSERT`,
// что и статус `queued`, промежуточного состояния не существует) — держится без этого
// условия. Координатор при слиянии решает: обновить фикстуры `foundation` (все `INSERT
// INTO recognition` тестов задают `photo_id`) и вернуть условие, либо оставить как есть.
export interface LeasedJob {
  readonly id: string;
  readonly fence: number;
  readonly photoId: string | null;
  readonly deviceSessionId: string;
  readonly createdAt: Date;
}

const SELECT_CANDIDATE = `
  SELECT id FROM recognition
  WHERE status = 'queued'
    AND (leased_until IS NULL OR leased_until < now())
    AND lease_fence < ${CANON.maxLeaseFence}
    AND created_at > now() - interval '${CANON.scanTaskBudgetMs} milliseconds'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
`;

const TAKE_LEASE = `
  UPDATE recognition
  SET leased_until = now() + ($2 || ' seconds')::interval,
      lease_owner  = $3,
      lease_fence  = lease_fence + 1
  WHERE id = $1
  RETURNING id, lease_fence, photo_id, device_session_id, created_at
`;

/**
 * Берёт аренду и ЗАКРЫВАЕТ транзакцию. Ничего длительного внутри не делается: соединение
 * пула во время внешнего вызова не удерживается (NFR-SCALE-001).
 */
export async function acquireLease(pool: DbPool, ownerId: string): Promise<LeasedJob | undefined> {
  return withTransaction(pool, async (client) => {
    const candidate = await client.query<{ id: string }>(SELECT_CANDIDATE);
    const row = candidate.rows[0];
    if (row === undefined) return undefined;

    const leased = await client.query<{
      id: string;
      lease_fence: number;
      photo_id: string | null;
      device_session_id: string;
      created_at: Date;
    }>(TAKE_LEASE, [row.id, String(CANON.leaseSeconds), ownerId]);
    const taken = leased.rows[0];
    if (taken === undefined) return undefined;
    return {
      id: taken.id,
      fence: taken.lease_fence,
      photoId: taken.photo_id,
      deviceSessionId: taken.device_session_id,
      createdAt: taken.created_at,
    };
  });
}

export interface ResultRecord {
  readonly status: 'done' | 'failed' | 'refused';
  readonly confidence: number | null;
  readonly items: unknown;
  readonly modelEstimateKcal: number | null;
  readonly modelUsed: 'haiku-4.5' | 'sonnet-5' | null;
  readonly failureReason: string | null;
}

const WRITE_RESULT = `
  UPDATE recognition
  SET status = $3::recognition_status,
      confidence = $4,
      items = $5::jsonb,
      model_estimate_kcal = $6,
      model_used = $7,
      failure_reason = $8::recognition_failure_reason,
      finished_at = now(),
      leased_until = NULL,
      lease_owner = NULL
  -- AND status = 'queued' (PC-03, RecognizeScanWithinScanPipeline шаг 9) взаимоисключает
  -- запись воркера со SweepStuckScans: sweeper не несёт fence и меняет ТОЛЬКО queued
  -- строки. Ноль затронутых строк здесь означает ЛИБО устаревший fence (другой воркер
  -- захватил задание позже), ЛИБО что sweeper уже перевёл строку в failed(timeout) —
  -- различаются перечитыванием (см. recordResult ниже).
  WHERE id = $1 AND lease_fence = $2 AND status = 'queued'
`;

export type WriteOutcome = 'written' | 'stale_lease_result' | 'swept_as_timeout';

/**
 * Запись результата УСЛОВНА по своему fence И `status = 'queued'` (ADR-003, DEC-A-008,
 * PC-03). `UPDATE`, затронувший ноль строк, — не ошибка базы: перечитывание строки
 * различает проигрыш гонки другому воркеру (`stale_lease_result`) от смещения
 * `SweepStuckScans` (`swept_as_timeout`).
 */
export async function recordResult(pool: DbPool, job: { id: string; fence: number }, record: ResultRecord): Promise<WriteOutcome> {
  const result = await pool.query(WRITE_RESULT, [
    job.id,
    job.fence,
    record.status,
    record.confidence,
    JSON.stringify(record.items ?? []),
    record.modelEstimateKcal,
    record.modelUsed,
    record.failureReason,
  ]);
  if ((result.rowCount ?? 0) > 0) return 'written';

  const reread = await pool.query<{ status: string }>('SELECT status FROM recognition WHERE id = $1', [job.id]);
  const currentStatus = reread.rows[0]?.status;
  return currentStatus === 'failed' ? 'swept_as_timeout' : 'stale_lease_result';
}
