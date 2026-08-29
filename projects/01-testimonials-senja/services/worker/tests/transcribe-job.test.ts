/**
 * tests/transcribe-job.test.ts
 *
 * ТЗ Phase 2: "тест на путь failed". Проверяет Pseudocode §1.1:
 *   "catch SttApiError as e: updateTestimonial(..., { transcript_status: 'failed' })"
 * — неудачный вызов services/transcribe переводит отзыв в терминальное состояние `failed`,
 * НЕ роняет воркер и НЕ оставляет строку в `pending` навсегда.
 *
 * Интеграционный уровень (реальная Postgres) — та же схема, что и skip-locked.test.ts.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { claimAndProcessOneTestimonial, MAX_ATTEMPTS } from "../src/transcribe-job.js";
import { SttApiError, type TranscribeClient } from "../src/transcribe-client.js";
import { createTestPool, dropSchema, setupSchema, testDatabaseUrl, truncateAll } from "./helpers/test-db.js";

const hasTestDb = !!testDatabaseUrl();

describe.skipIf(!hasTestDb)("transcribeVideoJob — путь failed и путь completed", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
    await setupSchema(pool);
  });

  afterEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await dropSchema(pool);
    await pool.end();
  });

  async function insertPending(videoObjectKey: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO testimonials (video_object_key, transcript_status) VALUES ($1, 'pending') RETURNING id`,
      [videoObjectKey],
    );
    return rows[0]!.id;
  }

  // FR-012 изменил, КОГДА наступает failed, а не наступает ли: теперь после исчерпания
  // попыток, а не на первом сбое. Утверждение теста — «отзыв остаётся видимым, транскрипт
  // NULL» — сохранено полностью; изменилось только условие входа. Первый сбой проверяется
  // отдельно в transcribe-retry.test.ts (AC-012.1).
  it("SttApiError на ПОСЛЕДНЕЙ попытке → transcript_status='failed', отзыв остаётся видимым (transcript NULL)", async () => {
    const testimonialId = await insertPending("project-1/broken.webm");
    await pool.query(
      `UPDATE testimonials SET transcript_attempts = $2 WHERE id = $1`,
      [testimonialId, MAX_ATTEMPTS - 1],
    );

    const failingClient: TranscribeClient = {
      async transcribeVideo() {
        throw new SttApiError("services/transcribe: ffmpeg завершился с кодом 1");
      },
    };

    const result = await claimAndProcessOneTestimonial({
      pool,
      transcribeClient: failingClient,
      presignVideoUrl: async (key) => `https://minio.test/${key}`,
    });

    expect(result).toEqual({ status: "failed", testimonialId });

    const { rows } = await pool.query(
      `SELECT transcript, transcript_status FROM testimonials WHERE id = $1`,
      [testimonialId],
    );
    expect(rows[0]?.transcript_status).toBe("failed");
    expect(rows[0]?.transcript).toBeNull();
  });

  it("успешная транскрипция → transcript_status='completed', transcript_source='machine'", async () => {
    const testimonialId = await insertPending("project-1/ok.webm");

    const okClient: TranscribeClient = {
      async transcribeVideo() {
        return "Спасибо, это отличный продукт!";
      },
    };

    const result = await claimAndProcessOneTestimonial({
      pool,
      transcribeClient: okClient,
      presignVideoUrl: async (key) => `https://minio.test/${key}`,
    });

    expect(result).toEqual({ status: "completed", testimonialId });

    const { rows } = await pool.query(
      `SELECT transcript, transcript_source, transcript_status FROM testimonials WHERE id = $1`,
      [testimonialId],
    );
    expect(rows[0]).toMatchObject({
      transcript: "Спасибо, это отличный продукт!",
      transcript_source: "machine",
      transcript_status: "completed",
    });
  });

  it("непредвиденная ошибка (не SttApiError) — строка НЕ помечается failed, ошибка пробрасывается", async () => {
    await insertPending("project-1/unexpected.webm");

    const throwingClient: TranscribeClient = {
      async transcribeVideo() {
        throw new Error("это не SttApiError — например, баг в коде");
      },
    };

    await expect(
      claimAndProcessOneTestimonial({
        pool,
        transcribeClient: throwingClient,
        presignVideoUrl: async (key) => `https://minio.test/${key}`,
      }),
    ).rejects.toThrow("это не SttApiError");

    // Транзакция откатилась — строка осталась pending, а не тихо стала failed по
    // причине, не связанной с STT-провайдером (важно для отладки: баг в коде не должен
    // маскироваться под «неудачную транскрипцию»).
    const { rows } = await pool.query(`SELECT transcript_status FROM testimonials`);
    expect(rows[0]?.transcript_status).toBe("pending");
  });

  it("очередь пуста → { status: 'empty' }, ничего не падает", async () => {
    const result = await claimAndProcessOneTestimonial({
      pool,
      transcribeClient: {
        async transcribeVideo() {
          throw new Error("не должен вызываться — очередь пуста");
        },
      },
      presignVideoUrl: async () => {
        throw new Error("не должен вызываться — очередь пуста");
      },
    });

    expect(result).toEqual({ status: "empty" });
  });
});

describe.skipIf(!hasTestDb)("очередь не забирает текстовые отзывы", () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = await createTestPool();
    await setupSchema(pool);
  });
  afterEach(async () => { await truncateAll(pool); });
  afterAll(async () => { await dropSchema(pool); await pool.end(); });

  it("текстовый отзыв НЕ попадает в очередь, и видео за ним обрабатывается", async () => {
    // transcript_status по умолчанию 'pending' у ВСЕХ строк (003_core.sql), включая
    // текстовые отзывы без видео. Без фильтра по video_object_key воркер забирал
    // текстовую строку, падал на presigned-ссылке и брал ТУ ЖЕ строку снова —
    // ORDER BY created_at всегда возвращает самую старую. Очередь стояла намертво,
    // и настоящее видео за этими строками не расшифровывалось никогда.
    // Наблюдалось на стенде: 21 текстовый отзыв заблокировал обработку целиком.
    // Текстовый отзыв СТАРШЕ видео — именно он был бы выбран первым.
    await pool.query(
      `insert into testimonials (author_name, text, created_at)
       values ('Текстовый', 'отзыв без видео', now() - interval '1 hour')`,
    );
    await pool.query(
      `insert into testimonials (author_name, video_object_key) values ('Видео', 'k/v.webm')`,
    );

    // Вызываем НАСТОЯЩУЮ функцию воркера, а не повторяем её SQL: тест, который
    // выполняет собственный запрос с нужным фильтром, не может упасть в принципе.
    const seen: string[] = [];
    const client: TranscribeClient = {
      transcribeVideo: async () => {
        seen.push("вызван");
        return "расшифровка";
      },
    };

    const result = await claimAndProcessOneTestimonial({
      pool,
      transcribeClient: client,
      presignVideoUrl: async (key) => {
        // Ключ обязан быть непустым: на текстовой строке он NULL, и presign упал бы
        // с «No value provided for input HTTP label: Key» — ровно так и было на стенде.
        expect(key, "воркер взял строку без video_object_key").toBeTruthy();
        return `https://minio.test/${key}`;
      },
    });

    // Обработана должна быть ВИДЕО-строка, хотя текстовая старше на час.
    expect(result.status).toBe("completed");
    expect(seen).toHaveLength(1);

    const check = await pool.query<{ author_name: string; transcript_status: string }>(
      `SELECT author_name, transcript_status FROM testimonials WHERE transcript IS NOT NULL`,
    );
    expect(check.rows[0]?.author_name).toBe("Видео");

    // Текстовая строка осталась нетронутой — её никто не пытался расшифровывать.
    const untouched = await pool.query<{ transcript_status: string }>(
      `SELECT transcript_status FROM testimonials WHERE author_name = 'Текстовый'`,
    );
    expect(untouched.rows[0]?.transcript_status).toBe("pending");
  });
});
