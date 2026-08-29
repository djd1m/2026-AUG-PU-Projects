/**
 * services/worker/src/transcribe-job.ts
 *
 * Реализация docs/Pseudocode.md §1.1 `transcribeVideoJob` + docs/Architecture.md §5
 * шаги 2-5 (очередь транскрипции видео-отзывов).
 *
 * Захват строки: `SELECT ... FOR UPDATE SKIP LOCKED` (Architecture §5, шаг 2) — два
 * параллельных экземпляра воркера не могут забрать одну и ту же строку. Транзакция
 * держится ОТКРЫТОЙ на всё время обработки одной строки, включая сетевой вызов к
 * services/transcribe (скачивание видео + вызов OpenAI STT может занимать до пары минут)
 * — это осознанный компромисс простоты недели, симметричный принципу Architecture §3.4
 * ("Postgres без Redis при масштабе одной недели"): альтернатива требовала бы
 * промежуточного статуса очереди (`in_progress`), а канон Architecture §10 намеренно
 * фиксирует enum `transcript_status` РОВНО тремя значениями (pending/completed/failed)
 * — добавлять четвёртое здесь означало бы разойтись с явно зафиксированным каноном
 * ради оптимизации, не требуемой на этом масштабе.
 *
 * Из-за удержания блокировки строки на всё время обработки ветка Pseudocode
 * "testimonial = getTestimonial(testimonial_id); if null: return" не воспроизводится
 * буквально: строка выбирается и блокируется одним запросом, поэтому конкурентное
 * удаление либо блокируется до нашего COMMIT/ROLLBACK, либо (если запись удалена ДО
 * начала этой транзакции) просто не попадёт в SELECT — обе ветки эквивалентны
 * поведению "отзыв удалён до обработки — не ошибка".
 */

import type { Pool } from "./db.js";
import { SttApiError, type TranscribeClient } from "./transcribe-client.js";

export interface TranscribeJobDeps {
  pool: Pool;
  transcribeClient: TranscribeClient;
  /**
   * Формирует presigned GET URL из `video_object_key` (Architecture §5, шаг 3).
   * В проде — `(key) => generatePresignedGetUrl(s3, bucket, key, ttl)` (см. index.ts);
   * в тестах — фейк без обращения к реальному S3/MinIO (см. tests/skip-locked.test.ts).
   */
  presignVideoUrl: (videoObjectKey: string) => Promise<string>;
  /** Инъекция для тестов; по умолчанию — console.error. */
  logError?: (event: string, testimonialId: string, err: unknown) => void;
}

/**
 * FR-012. Первая попытка + два повтора. Числа названы ЗДЕСЬ, а не «разумным дефолтом
 * по месту»: требование без числа непроверяемо. Тест прибивает их независимо —
 * порог, следующий за кодом, не является порогом.
 *
 * Верхняя граница мала намеренно: цель — пережить разовый сбой сети, а не ждать
 * восстановления сервиса часами. Провайдер, лежащий дольше пары минут, — случай для
 * ручного повтора, которого в объёме нет.
 */
export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 60_000;

/** Возрастающая задержка: 1 мин после первой неудачи, 2 мин после второй. */
export function retryDelayMs(attempts: number): number {
  return RETRY_BASE_MS * 2 ** (attempts - 1);
}

export type ClaimResult =
  | { status: "empty" }
  // FR-012: отличается от "failed" НАМЕРЕННО. Логи и вызывающий код обязаны различать
  // «больше не пытаемся» и «попробуем позже» — иначе разбор инцидента упрётся в
  // одинаковую запись для двух разных состояний.
  | { status: "retry_scheduled"; testimonialId: string; attempts: number }
  | { status: "completed"; testimonialId: string }
  | { status: "failed"; testimonialId: string };

type LogErrorFn = (event: string, testimonialId: string, err: unknown) => void;

const defaultLogError: LogErrorFn = (event, testimonialId, err) => {
  console.error(`[worker] ${event}`, { testimonialId, err });
};

/**
 * Захватывает РОВНО одну строку `transcript_status = 'pending'` и обрабатывает её.
 * Возвращает `{ status: 'empty' }`, если очереди сейчас нет — вызывающий код
 * (см. runTranscriptionPoll) использует это как сигнал остановить активный поллинг
 * и подождать `pollIntervalMs`.
 */
export async function claimAndProcessOneTestimonial(deps: TranscribeJobDeps): Promise<ClaimResult> {
  const { pool, transcribeClient, presignVideoUrl } = deps;
  const logError = deps.logError ?? defaultLogError;

  const client = await pool.connect();
  // Заполняется, когда состояние соединения под сомнением. finally отдаёт его в
  // release(err), и pg УНИЧТОЖАЕТ клиента вместо возврата в пул: release() без
  // аргумента отката НЕ делает, и соединение в состоянии abort роняло бы любой
  // следующий запрос, включая BEGIN (NFR-012.8).
  let poisoned: Error | undefined;
  // true, когда транзакция уже завершена штатно (COMMIT или успешный ROLLBACK).
  // Без него внешняя защита делала бы ЛИШНИЙ откат на каждом сбое: не опасно, но
  // сыплет предупреждением «there is no transaction in progress» в лог, а шум в
  // логе сбоев — это то, из-за чего перестают читать логи сбоев.
  let settled = false;
  try {
    await client.query("BEGIN");

    // Architecture §5, шаг 2: SELECT ... FOR UPDATE SKIP LOCKED — без Redis/очереди,
    // тот же принцип простоты, что и в §3.4.
    const { rows } = await client.query<{
      id: string;
      video_object_key: string;
      transcript_attempts: number;
    }>(
      // video_object_key IS NOT NULL — обязательное условие, а не оптимизация.
      // transcript_status по умолчанию 'pending' У ВСЕХ строк (003_core.sql), включая
      // ТЕКСТОВЫЕ отзывы, у которых видео нет. Без этого фильтра воркер забирает
      // текстовый отзыв, падает на presigned-ссылке («No value provided for input
      // HTTP label: Key») и берёт ТУ ЖЕ строку снова — ORDER BY created_at всегда
      // возвращает самую старую. Очередь не движется, и настоящее видео за этими
      // строками не расшифровывается НИКОГДА. Наблюдалось на стенде: 21 текстовый
      // отзыв заблокировал очередь целиком.
      `SELECT id, video_object_key, transcript_attempts
         FROM testimonials
        WHERE transcript_status = 'pending'
          AND video_object_key IS NOT NULL
          -- FR-012: срок в УСЛОВИИ, а не проверкой после выборки. Проверка после
          -- означала бы, что воркер берёт строку, отпускает и берёт снова — цикл
          -- вхолостую, сжигающий соединение. Здесь строка просто не выбирается.
          -- now() уместен: это ПЕРВЫЙ оператор транзакции, время её начала и есть
          -- текущее. В UPDATE ниже — наоборот, только clock_timestamp().
          AND (transcript_next_attempt_at IS NULL OR transcript_next_attempt_at <= now())
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );

    const row = rows[0];
    if (!row) {
      await client.query("COMMIT");
      settled = true;
      return { status: "empty" };
    }

    try {
      // Architecture §5, шаг 3: presigned GET URL формируется ИЗ video_object_key,
      // живёт только на время этого вызова, в БД не попадает (канон Architecture §10).
      const presignedUrl = await presignVideoUrl(row.video_object_key);

      // Architecture §5, шаг 4: вызов services/transcribe, POST /transcribe.
      const transcriptText = await transcribeClient.transcribeVideo(presignedUrl);

      // Architecture §5, шаг 5 / FR-NFR-SEC-002: транскрипт — отдельное поле,
      // никогда не пишется в testimonials.text.
      await client.query(
        `UPDATE testimonials
            SET transcript = $1, transcript_source = 'machine', transcript_status = 'completed'
          WHERE id = $2`,
        [transcriptText, row.id],
      );
      await client.query("COMMIT");
      settled = true;
      return { status: "completed", testimonialId: row.id };
    } catch (err) {
      const attempts = row.transcript_attempts + 1;
      const delayMs = retryDelayMs(attempts);

      // Срок вычисляет СЕРВЕР БД внутри самого UPDATE. Отдельный SELECT clock_timestamp()
      // здесь уходил бы в ОБРЕЧЁННУЮ транзакцию, когда исходная ошибка пришла от
      // client.query: транзакция уже в abort, запрос падает с 25P02 и ПОДМЕНЯЕТ исходное
      // исключение. Тогда не выполнятся ни откат, ни проброс (NFR-012.6, NFR-012.7).
      // Счётчик пишется ОТНОСИТЕЛЬНО, а условие включает статус (ревью M-1).
      // Учётная транзакция в ветке не-SttApiError идёт уже БЕЗ FOR UPDATE: откат снял
      // блокировку, и до COMMIT проходят три сетевых обмена, в течение которых строку
      // может взять другой воркер. Абсолютное значение, вычисленное из строки,
      // прочитанной в ОТКАЧЕННОЙ транзакции, затёрло бы чужой инкремент; условие по
      // статусу не даёт воскресить уже завершённую строку.
      const SCHEDULE_SQL = `UPDATE testimonials
            SET transcript_attempts = transcript_attempts + 1,
                transcript_next_attempt_at = clock_timestamp() + ($2 || ' milliseconds')::interval
          WHERE id = $1 AND transcript_status = 'pending'`;
      const GIVE_UP_SQL = `UPDATE testimonials
            SET transcript_status = 'failed', transcript_attempts = transcript_attempts + 1
          WHERE id = $1 AND transcript_status = 'pending'`;

      if (err instanceof SttApiError) {
        if (attempts >= MAX_ATTEMPTS) {
          // Исчерпали. Отзыв остаётся валидным и модерируемым даже без транскрипта
          // (канон Architecture §10: enum допускает failed).
          await client.query(GIVE_UP_SQL, [row.id]);
          await client.query("COMMIT");
      settled = true;
          logError("transcription_failed", row.id, err);
          return { status: "failed", testimonialId: row.id };
        }
        // Строка ОСТАЁТСЯ pending — это и есть возврат в очередь. Новых значений
        // статуса не вводим: ожидание выражается парой «pending + срок в будущем».
        await client.query(SCHEDULE_SQL, [row.id, String(delayMs)]);
        await client.query("COMMIT");
      settled = true;
        logError("transcription_retry_scheduled", row.id, err);
        return { status: "retry_scheduled", testimonialId: row.id, attempts };
      }

      // Неожиданная ошибка (обрыв соединения с БД и т.п.). Отзыв НЕ помечаем failed по
      // причине, не связанной с провайдером, — это решение сохранено с первой версии.
      // Откат обязателен: отзыв не помечаем failed по причине, не связанной с
      // провайдером. Если откат сам упал — пробрасываем; безопасностью соединения
      // занимается ВНЕШНИЙ обработчик, он один на все пути.
      await client.query("ROLLBACK");
      settled = true;

      // Учёт попытки ОТДЕЛЬНОЙ транзакцией на ТОМ ЖЕ соединении.
      //
      // Отдельной — потому что предыдущая откачена. Тем же соединением — потому что
      // второе, взятое пока первое не отпущено, удваивало бы удержание пула ровно
      // тогда, когда сбои идут потоком.
      //
      // Учёт нужен, иначе строка остаётся pending без срока, ORDER BY created_at
      // выбирает ЕЁ ЖЕ на каждом тике, и одна «ядовитая» запись блокирует всю очередь
      // навсегда, повторяясь каждые pollIntervalMs.
      try {
        settled = false;
        await client.query("BEGIN");
        await client.query(
          attempts >= MAX_ATTEMPTS ? GIVE_UP_SQL : SCHEDULE_SQL,
          attempts >= MAX_ATTEMPTS ? [row.id] : [row.id, String(delayMs)],
        );
        await client.query("COMMIT");
      settled = true;
      } catch (recordErr) {
        // Учесть не вышло — БД действительно недоступна, делать больше нечего.
        // Состояние соединения разберёт внешний обработчик, но НАСТОЯЩУЮ причину
        // отдаём ему мы: иначе в событие release пула уйдёт исходная ошибка, а та,
        // из-за которой упал учёт, не попадёт никуда (ревью L-1).
        logError("transcription_attempt_record_failed", row.id, recordErr);
      }

      // Исходная ошибка НЕ теряется ни на одном пути: супервизор обязан её увидеть.
      throw err;
    }
  } catch (err) {
    // ЛЮБАЯ ошибка, дошедшая сюда, оставляет состояние транзакции НЕИЗВЕСТНЫМ —
    // не только неудавшийся ROLLBACK, ради которого флаг вводился изначально.
    // Ревью нашло три незащищённых входа, и все реальные:
    //   • отказ UPDATE или COMMIT в ветке SttApiError (дедлок, ограничение, отмена);
    //   • BEGIN и SELECT, вокруг которых catch не было вовсе;
    //   • SELECT ссылается на колонку миграции 011 — воркер, поднятый ДО миграции,
    //     получает 42703, и это ровно тот порядок развёртывания, который предписан
    //     («миграция, затем воркер» — два шага, и воркер их регулярно обгоняет).
    //
    // Отравленное соединение возвращается в пул и раздаётся следующему заёмщику
    // ПЕРВЫМ (pg-pool отдаёт LIFO), так что очередь встаёт целиком и навсегда:
    // процесс не падает, restart: unless-stopped не срабатывает, а в лог идёт 25P02
    // вместо настоящей причины — И ПОСЛЕ устранения этой причины тоже.
    if (settled) throw err;   // транзакция уже завершена — соединение чистое
    poisoned = err instanceof Error ? err : new Error(String(err));
    try {
      await client.query("ROLLBACK");
      poisoned = undefined; // откат удался — соединение чистое, вернём в пул
    } catch {
      // Не удался: состояние неизвестно, в пул НЕ возвращаем (release(err) уничтожит).
    }
    throw err;
  } finally {
    client.release(poisoned);
  }
}

/**
 * Забирает строки из очереди, пока они есть, затем ждёт `pollIntervalMs` и повторяет.
 * Возвращает функцию остановки — вызывается при graceful shutdown (см. index.ts).
 */
export function startTranscriptionPoll(
  deps: TranscribeJobDeps,
  pollIntervalMs: number,
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      let result = await claimAndProcessOneTestimonial(deps);
      // Пока в очереди есть строки — забираем их без паузы между итерациями.
      while (!stopped && result.status !== "empty") {
        result = await claimAndProcessOneTestimonial(deps);
      }
    } catch (err) {
      (deps.logError ?? defaultLogError)("transcription_poll_error", "n/a", err);
    }
    if (!stopped) {
      timer = setTimeout(tick, pollIntervalMs);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
