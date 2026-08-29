/**
 * tests/transcribe-job.unit.test.ts
 *
 * Юнит-уровень (testing.md §1): проверяет ПОСЛЕДОВАТЕЛЬНОСТЬ запросов и обработку
 * ошибок claimAndProcessOneTestimonial без реальной БД — мокается сам `pg.Pool`.
 * Не заменяет tests/skip-locked.test.ts (гонку мок пула доказать не может, см.
 * комментарий в том файле) — дополняет его быстрым, всегда запускаемым слоем.
 */

import { describe, expect, it, vi } from "vitest";
import { claimAndProcessOneTestimonial } from "../src/transcribe-job.js";
import { SttApiError, type TranscribeClient } from "../src/transcribe-client.js";
import type { Pool, PoolClient } from "../src/db.js";

function fakePoolClient(selectRows: Array<{ id: string; video_object_key: string }>) {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql.trim().split("\n")[0]!.trim());
      if (sql.includes("FOR UPDATE SKIP LOCKED")) {
        return { rows: selectRows };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  return { client, queries };
}

describe("claimAndProcessOneTestimonial — последовательность запросов (без БД)", () => {
  it("очередь пуста: BEGIN → SELECT → COMMIT, release вызван", async () => {
    const { client, queries } = fakePoolClient([]);
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const result = await claimAndProcessOneTestimonial({
      pool,
      transcribeClient: { transcribeVideo: vi.fn() } as unknown as TranscribeClient,
      presignVideoUrl: vi.fn(),
    });

    expect(result).toEqual({ status: "empty" });
    expect(queries).toEqual(["BEGIN", expect.stringContaining("SELECT"), "COMMIT"]);
    expect((client as unknown as { release: () => void }).release).toHaveBeenCalledOnce();
  });

  it("успех: BEGIN → SELECT → UPDATE(...completed) → COMMIT", async () => {
    const { client, queries } = fakePoolClient([{ id: "t-1", video_object_key: "k1", transcript_attempts: 0 }]);
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const transcribeClient: TranscribeClient = { transcribeVideo: vi.fn().mockResolvedValue("текст") };
    const presignVideoUrl = vi.fn().mockResolvedValue("https://minio.test/k1?sig=x");

    const result = await claimAndProcessOneTestimonial({ pool, transcribeClient, presignVideoUrl });

    expect(result).toEqual({ status: "completed", testimonialId: "t-1" });
    expect(presignVideoUrl).toHaveBeenCalledWith("k1");
    expect(transcribeClient.transcribeVideo).toHaveBeenCalledWith("https://minio.test/k1?sig=x");
    expect(queries).toEqual([
      "BEGIN",
      expect.stringContaining("SELECT"),
      expect.stringContaining("UPDATE testimonials"),
      "COMMIT",
    ]);
  });

  // FR-012: несущее утверждение теста — «на ошибке ПРОВАЙДЕРА мы COMMIT, а не ROLLBACK» —
  // сохранено. Изменился исход первой попытки: не failed сразу, а планирование повтора.
  it("SttApiError на ПЕРВОЙ попытке: BEGIN → SELECT → UPDATE(срок) → COMMIT (не ROLLBACK)", async () => {
    const { client, queries } = fakePoolClient([{ id: "t-2", video_object_key: "k2", transcript_attempts: 0 }]);
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const transcribeClient: TranscribeClient = {
      transcribeVideo: vi.fn().mockRejectedValue(new SttApiError("ffmpeg упал")),
    };

    const result = await claimAndProcessOneTestimonial({
      pool,
      transcribeClient,
      presignVideoUrl: vi.fn().mockResolvedValue("https://minio.test/k2"),
    });

    expect(result).toEqual({ status: "retry_scheduled", testimonialId: "t-2", attempts: 1 });
    expect(queries, "ошибка провайдера не должна откатывать транзакцию").not.toContain("ROLLBACK");
    expect(queries[queries.length - 1]).toBe("COMMIT");
  });

  it("непредвиденная ошибка: ROLLBACK, ошибка пробрасывается, release всё равно вызван", async () => {
    const { client, queries } = fakePoolClient([{ id: "t-3", video_object_key: "k3", transcript_attempts: 0 }]);
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    const transcribeClient: TranscribeClient = {
      transcribeVideo: vi.fn().mockRejectedValue(new Error("баг, не SttApiError")),
    };

    await expect(
      claimAndProcessOneTestimonial({
        pool,
        transcribeClient,
        presignVideoUrl: vi.fn().mockResolvedValue("https://minio.test/k3"),
      }),
    ).rejects.toThrow("баг, не SttApiError");

    // FR-012: ROLLBACK по-прежнему ОБЯЗАТЕЛЕН — отзыв не помечается failed по причине,
    // не связанной с провайдером. Но после отката идёт учёт попытки ОТДЕЛЬНОЙ транзакцией
    // на том же соединении: без него строка осталась бы pending без срока, и ORDER BY
    // created_at выбирал бы ЕЁ ЖЕ каждый тик, блокируя очередь навсегда.
    const rollbackAt = queries.indexOf("ROLLBACK");
    expect(rollbackAt, "откат обязателен").toBeGreaterThan(-1);
    expect(queries.slice(rollbackAt), "после отката обязан идти учёт попытки")
      .toEqual(["ROLLBACK", "BEGIN", expect.stringContaining("UPDATE testimonials"), "COMMIT"]);
    expect((client as unknown as { release: () => void }).release).toHaveBeenCalledOnce();
  });
});
