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

/** Больше трёх захватов у задания не бывает (DEC-A-015). */
export const MAX_LEASE_ATTEMPTS = 3;
/** Задание, которого никто не взял за это время, признаётся застрявшим (DEC-A-015). */
export const SWEEP_QUEUE_AGE = '5 minutes';

export interface LeasedJob {
  readonly id: string;
  readonly fence: number;
  readonly photoId: string;
  readonly deviceSessionId: string;
}

const SELECT_CANDIDATE = `
  SELECT id FROM recognition
  WHERE status = 'queued'
    AND photo_id IS NOT NULL
    AND (leased_until IS NULL OR leased_until < now())
    AND lease_fence < $1
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
    const candidate = await client.query<{ id: string }>(SELECT_CANDIDATE, [MAX_LEASE_ATTEMPTS]);
    const row = candidate.rows[0];
    if (row === undefined) return undefined;

    const leased = await client.query<{ id: string; lease_fence: number; photo_id: string | null; device_session_id: string }>(
      TAKE_LEASE,
      [row.id, String(CANON.leaseSeconds), ownerId],
    );
    const taken = leased.rows[0];
    if (taken === undefined || taken.photo_id === null) return undefined;
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

/** Почему запись не состоялась. Два случая РАЗНЫЕ, и путать их нельзя. */
export type WriteOutcome = 'written' | 'stale_lease' | 'swept';

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
  WHERE id = $1 AND lease_fence = $2 AND status = 'queued'
`;

/**
 * Запись результата УСЛОВНА по своему fence И по статусу `queued`.
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
  ]);
  if ((result.rowCount ?? 0) > 0) return 'written';

  const current = await pool.query<{ status: string; lease_fence: number }>(
    'SELECT status::text AS status, lease_fence FROM recognition WHERE id = $1',
    [job.id],
  );
  const row = current.rows[0];
  if (row === undefined) return 'swept';
  // Различает именно НОМЕР ЗАХВАТА, а не только статус: терминальный статус мог поставить
  // и другой воркер, и уборщик, а вот `lease_fence` трогает ТОЛЬКО захват. Больше моего —
  // задание перезахватили; равен моему и статус уже терминальный — его закрыл уборщик,
  // потому что он единственный, кто закрывает строку, не увеличивая номер.
  if (row.lease_fence !== job.fence) return 'stale_lease';
  return row.status === 'queued' ? 'stale_lease' : 'swept';
}

export interface SweepResult {
  /** Правило А: простояло в очереди дольше срока и не было взято НИ РАЗУ. */
  readonly neverLeased: number;
  /** Правило Б: захваты исчерпаны, аренда истекла — задание больше никому не предложится. */
  readonly attemptsExhausted: number;
}

const SWEEP_NEVER_LEASED = `
  UPDATE recognition
  SET status = 'failed', failure_reason = 'timeout', finished_at = now()
  WHERE status = 'queued' AND leased_until IS NULL AND created_at < now() - $1::interval
`;

const SWEEP_ATTEMPTS_EXHAUSTED = `
  UPDATE recognition
  SET status = 'failed', failure_reason = 'timeout', finished_at = now()
  WHERE status = 'queued' AND lease_fence >= $1 AND leased_until < now()
`;

/**
 * Уборщик застрявших заданий. Живёт в ТОМ ЖЕ цикле опроса, что и захват: отдельного
 * сервиса не заводится — он был бы ещё одним процессом ради двух операторов.
 *
 * Каждое правило — отдельный идемпотентный `UPDATE` со своим `WHERE`: повторный прогон
 * уже переведённых строк не находит. Условие `status = 'queued'` внутри `WHERE` и есть
 * защита от гонки с воркером: если тот В ЭТОТ МОМЕНТ захватывает задание, `UPDATE`
 * затрагивает ноль строк, и это НЕ ошибка.
 *
 * Уборщик НИКОГДА не трогает задание с ДЕЙСТВУЮЩЕЙ арендой: живой воркер внутри своей
 * аренды следит за своим бюджетом сам, а «завершить задание, не прекратив платную
 * работу» — это худший исход, чем вечное `queued`.
 */
export async function sweepStuckScans(pool: DbPool, queueAge: string = SWEEP_QUEUE_AGE): Promise<SweepResult> {
  const neverLeased = await pool.query(SWEEP_NEVER_LEASED, [queueAge]);
  const attemptsExhausted = await pool.query(SWEEP_ATTEMPTS_EXHAUSTED, [MAX_LEASE_ATTEMPTS]);
  return {
    neverLeased: neverLeased.rowCount ?? 0,
    attemptsExhausted: attemptsExhausted.rowCount ?? 0,
  };
}
