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

export interface LeasedJob {
  readonly id: string;
  readonly fence: number;
  readonly photoId: string | null;
  readonly deviceSessionId: string;
}

const SELECT_CANDIDATE = `
  SELECT id FROM recognition
  WHERE status = 'queued' AND (leased_until IS NULL OR leased_until < now())
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
  RETURNING id, lease_fence, photo_id, device_session_id
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

    const leased = await client.query<{ id: string; lease_fence: number; photo_id: string | null; device_session_id: string }>(
      TAKE_LEASE,
      [row.id, String(CANON.leaseSeconds), ownerId],
    );
    const taken = leased.rows[0];
    if (taken === undefined) return undefined;
    return {
      id: taken.id,
      fence: taken.lease_fence,
      photoId: taken.photo_id,
      deviceSessionId: taken.device_session_id,
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
      leased_until = NULL
  WHERE id = $1 AND lease_fence = $2
`;

/**
 * Запись результата УСЛОВНА по своему fence. `UPDATE`, затронувший ноль строк, — не ошибка
 * базы, а УСТАРЕВШИЙ захват: аренда истекла, задание забрал другой, и результат этого
 * владельца отбрасывается. Возвращается `false`, чтобы вызывающий записал `stale_lease_result`.
 */
export async function recordResult(pool: DbPool, job: { id: string; fence: number }, record: ResultRecord): Promise<boolean> {
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
  return (result.rowCount ?? 0) > 0;
}
