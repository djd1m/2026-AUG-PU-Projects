/**
 * services/worker/src/transcribe-job.ts
 *
 * Реализация docs/Pseudocode.md §1.1 `transcribeVideoJob` + docs/Architecture.md §5
 * шаги 2-5 (очередь транскрипции видео-отзывов).
 *
 * Захват строки: `SELECT ... FOR UPDATE SKIP LOCKED` (Architecture §5, шаг 2) — два
 * параллельных экземпляра воркера не могут забрать одну и ту же строку. Транзакция
 * держится ОТКРЫТОЙ на всё время обработки одной строки, включая сетевой вызов к
 * mcp-claude (скачивание видео + Claude API может занимать до пары минут) — это
 * осознанный компромисс простоты недели, симметричный принципу Architecture §3.4
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
import { ClaudeApiError, type TranscribeClient } from "./mcp-client.js";

export interface TranscribeJobDeps {
  pool: Pool;
  mcpClient: TranscribeClient;
  /**
   * Формирует presigned GET URL из `video_object_key` (Architecture §5, шаг 3).
   * В проде — `(key) => generatePresignedGetUrl(s3, bucket, key, ttl)` (см. index.ts);
   * в тестах — фейк без обращения к реальному S3/MinIO (см. tests/skip-locked.test.ts).
   */
  presignVideoUrl: (videoObjectKey: string) => Promise<string>;
  /** Инъекция для тестов; по умолчанию — console.error. */
  logError?: (event: string, testimonialId: string, err: unknown) => void;
}

export type ClaimResult =
  | { status: "empty" }
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
  const { pool, mcpClient, presignVideoUrl } = deps;
  const logError = deps.logError ?? defaultLogError;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Architecture §5, шаг 2: SELECT ... FOR UPDATE SKIP LOCKED — без Redis/очереди,
    // тот же принцип простоты, что и в §3.4.
    const { rows } = await client.query<{ id: string; video_object_key: string }>(
      `SELECT id, video_object_key
         FROM testimonials
        WHERE transcript_status = 'pending'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );

    const row = rows[0];
    if (!row) {
      await client.query("COMMIT");
      return { status: "empty" };
    }

    try {
      // Architecture §5, шаг 3: presigned GET URL формируется ИЗ video_object_key,
      // живёт только на время этого вызова, в БД не попадает (канон Architecture §10).
      const presignedUrl = await presignVideoUrl(row.video_object_key);

      // Architecture §5, шаг 4: вызов mcp-claude, MCP tool transcribe_video.
      const transcriptText = await mcpClient.transcribeVideo(presignedUrl);

      // Architecture §5, шаг 5 / FR-NFR-SEC-002: транскрипт — отдельное поле,
      // никогда не пишется в testimonials.text.
      await client.query(
        `UPDATE testimonials
            SET transcript = $1, transcript_source = 'machine', transcript_status = 'completed'
          WHERE id = $2`,
        [transcriptText, row.id],
      );
      await client.query("COMMIT");
      return { status: "completed", testimonialId: row.id };
    } catch (err) {
      if (err instanceof ClaudeApiError) {
        // Pseudocode §1.1, catch ClaudeApiError: канон Architecture §10 даёт enum
        // transcript_status(pending,completed,failed) — неудача выразима в схеме.
        // Отзыв остаётся валидным и модерируемым даже без транскрипта.
        await client.query(
          `UPDATE testimonials SET transcript_status = 'failed' WHERE id = $1`,
          [row.id],
        );
        await client.query("COMMIT");
        logError("transcription_failed", row.id, err);
        return { status: "failed", testimonialId: row.id };
      }
      // Неожиданная ошибка (обрыв соединения с БД и т.п.) — откатываем, НЕ помечаем
      // отзыв как failed по причине, не связанной с Claude API, и пробрасываем выше,
      // чтобы её увидел супервизор процесса, а не проглатывали молча.
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
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
