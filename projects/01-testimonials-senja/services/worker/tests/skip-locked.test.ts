/**
 * tests/skip-locked.test.ts
 *
 * ТЗ Phase 2: "тест на то, что две параллельные задачи не берут одну строку
 * (SKIP LOCKED)". Это поведение реального блокировщика строк Postgres — мок пула
 * НИЧЕГО не докажет здесь (testing.md §1: гонки — это Integration/E2E-уровень, не
 * юнит), поэтому тест требует настоящую Postgres и пропускается, если
 * TEST_DATABASE_URL не задан.
 *
 * Запуск: TEST_DATABASE_URL=postgres://user:pass@localhost:5432/proofwall_test npm test
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { claimAndProcessOneTestimonial } from "../src/transcribe-job.js";
import type { TranscribeClient } from "../src/transcribe-client.js";
import { createTestPool, dropSchema, setupSchema, testDatabaseUrl, truncateAll } from "./helpers/test-db.js";

const hasTestDb = !!testDatabaseUrl();

describe.skipIf(!hasTestDb)("SKIP LOCKED: два параллельных воркера, одна строка", () => {
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

  function fakeTranscribeClient(text: string, delayMs = 0): TranscribeClient {
    return {
      async transcribeVideo() {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        return text;
      },
    };
  }

  it("ровно ОДИН из двух конкурентных вызовов забирает строку, второй видит пустую очередь", async () => {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO testimonials (video_object_key, transcript_status) VALUES ($1, 'pending') RETURNING id`,
      ["project-1/testimonial-1.webm"],
    );
    const testimonialId = inserted.rows[0]!.id;

    // Небольшая задержка на "победителе" — чтобы гарантированно удержать блокировку
    // строки дольше, чем занимает у "проигравшего" отправить свой SELECT ... FOR
    // UPDATE SKIP LOCKED. Без задержки тест всё равно корректен благодаря реальной
    // блокировке Postgres, но был бы чувствителен к скорости сети/диска в CI.
    const depsA = {
      pool,
      transcribeClient: fakeTranscribeClient("расшифровка от воркера A", 200),
      presignVideoUrl: async (key: string) => `https://minio.test/${key}?presigned=A`,
    };
    const depsB = {
      pool,
      transcribeClient: fakeTranscribeClient("расшифровка от воркера B", 0),
      presignVideoUrl: async (key: string) => `https://minio.test/${key}?presigned=B`,
    };

    const [resultA, resultB] = await Promise.all([
      claimAndProcessOneTestimonial(depsA),
      claimAndProcessOneTestimonial(depsB),
    ]);

    const statuses = [resultA.status, resultB.status].sort();
    // Ровно один результат — 'completed' (забрал строку), второй — 'empty' (строка
    // уже была заблокирована конкурентной транзакцией на момент его SELECT).
    expect(statuses).toEqual(["completed", "empty"]);

    const winner = resultA.status === "completed" ? resultA : resultB;
    expect(winner).toMatchObject({ status: "completed", testimonialId });

    const { rows } = await pool.query<{ transcript: string; transcript_status: string }>(
      `SELECT transcript, transcript_status FROM testimonials WHERE id = $1`,
      [testimonialId],
    );
    expect(rows[0]?.transcript_status).toBe("completed");
    // Ровно один текст победил — строка не была обработана дважды и не осталась пустой.
    expect(["расшифровка от воркера A", "расшифровка от воркера B"]).toContain(rows[0]?.transcript);
  });

  it("10 конкурентных вызовов на одну строку — обработана РОВНО один раз", async () => {
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO testimonials (video_object_key, transcript_status) VALUES ($1, 'pending') RETURNING id`,
      ["project-1/testimonial-2.webm"],
    );
    const testimonialId = inserted.rows[0]!.id;

    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        claimAndProcessOneTestimonial({
          pool,
          transcribeClient: fakeTranscribeClient(`расшифровка #${i}`, 50),
          presignVideoUrl: async (key: string) => `https://minio.test/${key}`,
        }),
      ),
    );

    const completed = results.filter((r) => r.status === "completed");
    const empty = results.filter((r) => r.status === "empty");
    expect(completed).toHaveLength(1);
    expect(empty).toHaveLength(N - 1);
    expect(completed[0]).toMatchObject({ testimonialId });
  });
});
