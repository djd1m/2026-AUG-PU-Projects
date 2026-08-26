/**
 * tests/transcribe-job.test.ts
 *
 * ТЗ Phase 2: "тест на путь failed". Проверяет Pseudocode §1.1:
 *   "catch ClaudeApiError as e: updateTestimonial(..., { transcript_status: 'failed' })"
 * — неудачный вызов mcp-claude переводит отзыв в терминальное состояние `failed`,
 * НЕ роняет воркер и НЕ оставляет строку в `pending` навсегда.
 *
 * Интеграционный уровень (реальная Postgres) — та же схема, что и skip-locked.test.ts.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { claimAndProcessOneTestimonial } from "../src/transcribe-job.js";
import { ClaudeApiError, type TranscribeClient } from "../src/mcp-client.js";
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

  it("ClaudeApiError → transcript_status='failed', отзыв остаётся видимым (transcript NULL)", async () => {
    const testimonialId = await insertPending("project-1/broken.webm");

    const failingClient: TranscribeClient = {
      async transcribeVideo() {
        throw new ClaudeApiError("mcp-claude: ffmpeg завершился с кодом 1");
      },
    };

    const result = await claimAndProcessOneTestimonial({
      pool,
      mcpClient: failingClient,
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
      mcpClient: okClient,
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

  it("непредвиденная ошибка (не ClaudeApiError) — строка НЕ помечается failed, ошибка пробрасывается", async () => {
    await insertPending("project-1/unexpected.webm");

    const throwingClient: TranscribeClient = {
      async transcribeVideo() {
        throw new Error("это не ClaudeApiError — например, баг в коде");
      },
    };

    await expect(
      claimAndProcessOneTestimonial({
        pool,
        mcpClient: throwingClient,
        presignVideoUrl: async (key) => `https://minio.test/${key}`,
      }),
    ).rejects.toThrow("это не ClaudeApiError");

    // Транзакция откатилась — строка осталась pending, а не тихо стала failed по
    // причине, не связанной с Claude API (важно для отладки: баг в коде не должен
    // маскироваться под «неудачную транскрипцию»).
    const { rows } = await pool.query(`SELECT transcript_status FROM testimonials`);
    expect(rows[0]?.transcript_status).toBe("pending");
  });

  it("очередь пуста → { status: 'empty' }, ничего не падает", async () => {
    const result = await claimAndProcessOneTestimonial({
      pool,
      mcpClient: {
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
