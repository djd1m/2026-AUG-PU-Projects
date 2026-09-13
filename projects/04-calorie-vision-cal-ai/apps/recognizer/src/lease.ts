// Аренда задания, fencing и уборка застрявших (FR-foundation-6, ADR-003, DEC-A-008,
// DEC-A-015).
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
//
// Ещё два условия предиката введены DEC-A-015, и каждое закрывает свой отказ:
//   * `photo_id IS NOT NULL` — НЕЗАВЕРШЁННАЯ ПУБЛИКАЦИЯ НЕВИДИМА. Строка `recognition`
//     заявляется ключом повторности раньше, чем кадр лёг в бакет; воркер, схвативший её в
//     этом окне, пошёл бы звать модель на кадр, которого ещё нет, — платная работа впустую;
//   * `lease_fence < 3` — ЧЕТВЁРТОГО ЗАХВАТА НЕ БЫВАЕТ. Задание, которое роняет воркеров,
//     иначе перезахватывается вечно, и КАЖДЫЙ захват оплачен: счёт идёт по попыткам.
//     Потолок — это защита денег, и у неё обязана быть верхняя граница, а не надежда.
// Цена второго условия названа явно: задание с исчерпанными захватами больше не
// предложится НИ ОДНОМУ воркеру и провисит в `queued` вечно — поэтому вместе с пределом
// вводится уборщик (`sweepStuckScans`), а не «как-нибудь заметим».

import { withTransaction, type DbPool } from '@n4/db';
import { CANON } from '@n4/shared';

// Ещё одно условие предиката пришло из фичи `scan-pipeline` (PC-02/PC-03, Правило Г):
//   * `created_at > now() - 30 s` — задание СТАРШЕ общего бюджета задачи воркеру не
//     предлагается вовсе: платный вызов по нему гарантированно оказался бы поздним.
//     Это оптимизация, а не рубеж: шаг 1а `RecognizeScanWithinScanPipeline` проверяет
//     бюджет ЗАНОВО после захвата и остаётся обязательным независимо от этого условия.
//
// ОТКЛОНЕНИЕ ветки `scan-pipeline` СНЯТО координатором при слиянии: там `photo_id IS NOT
// NULL` не добавляли, опасаясь фикстур `foundation`, — на деле фикстуры (`queueJob` в
// `tests/concurrency/lease.test.ts`) кадр задают, а отдельный сценарий «задание без
// опубликованного кадра невидимо воркеру» это условие ПРОВЕРЯЕТ. Оба рубежа сохранены:
// атомарность `EnqueueScanForFeature` и этот предикат.

/** Больше трёх захватов у задания не бывает (DEC-A-015, `CANON.maxLeaseFence`). */
export const MAX_LEASE_ATTEMPTS = CANON.maxLeaseFence;

export interface LeasedJob {
  readonly id: string;
  readonly fence: number;
  readonly photoId: string;
  readonly deviceSessionId: string;
  readonly createdAt: Date;
}

const SELECT_CANDIDATE = `
  SELECT id FROM recognition
  WHERE status = 'queued'
    AND photo_id IS NOT NULL
    AND (leased_until IS NULL OR leased_until < now())
    AND lease_fence < $1
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
    const candidate = await client.query<{ id: string }>(SELECT_CANDIDATE, [MAX_LEASE_ATTEMPTS]);
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
    if (taken === undefined || taken.photo_id === null) return undefined;
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
  /** RV-scan-pipeline-16: без явной записи оставались бы дефолтом вставки (false/1) НАВСЕГДА. */
  readonly escalated: boolean;
  readonly attemptNo: number;
  /**
   * `source-and-correct` (FR-source-and-correct-6/8): сумма `kcal` сопоставленных позиций
   * и расхождение с оценкой модели. `null`, если распознавание не дало НИ ОДНОГО
   * сопоставления (`failed(no_food_matched)`) — ноль здесь означал бы измеренный итог.
   */
  readonly dbKcalTotal: number | null;
  readonly discrepancyRatio: number | null;
  readonly conflictFlag: boolean;
}

const WRITE_RESULT = `
  UPDATE recognition
  SET status = $3::recognition_status,
      confidence = $4,
      items = $5::jsonb,
      model_estimate_kcal = $6,
      model_used = $7,
      failure_reason = $8::recognition_failure_reason,
      escalated = $9,
      attempt_no = $10,
      db_kcal_total = $11,
      discrepancy_ratio = $12,
      conflict_flag = $13,
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

/**
 * Почему запись не состоялась. Два случая РАЗНЫЕ, и путать их нельзя. Значения совпадают
 * с ИМЕНАМИ событий аудита намеренно: `recognize-scan.ts` пишет исход в журнал как имя
 * события, и по журналу ищут по имени, а не по значению поля.
 */
export type WriteOutcome = 'written' | 'stale_lease_result' | 'swept_as_timeout';

/**
 * Запись результата УСЛОВНА по своему fence И по статусу `queued` (ADR-003, DEC-A-008,
 * PC-03).
 *
 * Условие по fence закрывает гонку с ДРУГИМ ВОРКЕРОМ; условие по статусу — гонку с
 * УБОРЩИКОМ, который перевёл задание в `failed(timeout)`. Без второго условия воркер
 * затёр бы терминальный статус уборщика и вернул задание к жизни задним числом.
 *
 * `UPDATE`, затронувший ноль строк, — не ошибка базы. Какой именно это случай, видно
 * только из ПЕРЕЧИТАННОЙ строки, поэтому она перечитывается: «ноль строк» без причины
 * читается как сбой и лечится отключением условия.
 */
export async function recordResult(
  pool: DbPool,
  job: { id: string; fence: number },
  record: ResultRecord,
): Promise<WriteOutcome> {
  const result = await pool.query(WRITE_RESULT, [
    job.id,
    job.fence,
    record.status,
    record.confidence,
    JSON.stringify(record.items ?? []),
    record.modelEstimateKcal,
    record.modelUsed,
    record.failureReason,
    record.escalated,
    record.attemptNo,
    record.dbKcalTotal,
    record.discrepancyRatio,
    record.conflictFlag,
  ]);
  if ((result.rowCount ?? 0) > 0) return 'written';

  const current = await pool.query<{ status: string; lease_fence: number }>(
    'SELECT status::text AS status, lease_fence FROM recognition WHERE id = $1',
    [job.id],
  );
  const row = current.rows[0];
  if (row === undefined) return 'swept_as_timeout';
  // Различает именно НОМЕР ЗАХВАТА, а не только статус: терминальный статус мог поставить
  // и другой воркер, и уборщик, а вот `lease_fence` трогает ТОЛЬКО захват. Больше моего —
  // задание перезахватили; равен моему и статус уже терминальный — его закрыл уборщик,
  // потому что он единственный, кто закрывает строку, не увеличивая номер.
  //
  // Сравнение ОДНОГО `status` здесь ненадёжно, и это ровно то же наблюдение, к которому
  // независимо пришла ветка `scan-pipeline` (AC-scan-pipeline-17/22): `failed` способны
  // поставить и другой воркер, и уборщик — воркер сам пишет `failed(timeout)` на шагах
  // 1а/9. Ветка различала их по `leased_until` (уборщик его не обнуляет, победивший
  // воркер обнуляет всегда); здесь тот же вопрос решает номер захвата, и он строже:
  // отвечает и в случае, когда уборщик отработал по строке, которую никто не перезахватил.
  if (row.lease_fence !== job.fence) return 'stale_lease_result';
  return row.status === 'queued' ? 'stale_lease_result' : 'swept_as_timeout';
}

// Уборщик застрявших заданий живёт ОДНИМ файлом — `recognize/sweep-stuck-scans.ts` (три
// правила фичи `scan-pipeline`, надмножество двух правил `foundation`). Здесь он
// ре-экспортируется, потому что предел `lease_fence < 3` и уборщик — это ОДНО решение
// (DEC-A-015): предел без уборщика — не защита, а тихая потеря, и читающий `lease.ts`
// обязан находить второй половиной там же, где первую.
export { sweepStuckScans, type SweepResult } from './recognize/sweep-stuck-scans.js';
