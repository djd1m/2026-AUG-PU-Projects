/**
 * tests/transcribe.test.ts
 *
 * Юнит-уровень (testing.md §1): чистые/изолируемые пути transcribe.ts без реальной сети
 * и без реального ffmpeg/OpenAI API. Сетевой путь скачивания видео и путь ошибок STT-провайдера
 * замокан — это не интеграционный тест полного pipeline (для этого нужен бы реальный
 * ffmpeg-бинарник и реальный видеофайл, что вне объёма Phase 2 генерации сервисов).
 */

import { describe, expect, it, vi } from "vitest";
import { SttApiError, transcribeVideo } from "../src/transcribe.js";
import type { TranscribeConfig } from "../src/config.js";

const CONFIG: TranscribeConfig = {
  port: 0,
  openaiApiKey: "sk-test-not-a-real-key",
  transcribeModel: "test-model-placeholder",
  maxVideoBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 120,
};

describe("transcribeVideo — ошибка скачивания видео", () => {
  it("оборачивает сетевую ошибку в SttApiError (не роняет процесс)", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => {
      throw new Error("network unreachable");
    }) as unknown as typeof fetch;

    try {
      await expect(
        transcribeVideo({ video_url: "https://minio.example/testimonial-videos/x.mp4" }, CONFIG),
      ).rejects.toBeInstanceOf(SttApiError);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("отклоняет HTTP-ответ не-2xx (истёкший presigned URL) как SttApiError", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(
      async () =>
        new Response(null, { status: 403, statusText: "Forbidden" }),
    ) as unknown as typeof fetch;

    try {
      await expect(
        transcribeVideo({ video_url: "https://minio.example/testimonial-videos/x.mp4" }, CONFIG),
      ).rejects.toBeInstanceOf(SttApiError);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("отклоняет видео, превышающее лимит по Content-Length (FR-003: ≤100MB)", async () => {
    const originalFetch = global.fetch;
    const tooBig = CONFIG.maxVideoBytes + 1;
    global.fetch = vi.fn(async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { "content-length": String(tooBig) },
      });
    }) as unknown as typeof fetch;

    try {
      await expect(
        transcribeVideo({ video_url: "https://minio.example/testimonial-videos/big.mp4" }, CONFIG),
      ).rejects.toThrow(/размер/);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("SttApiError", () => {
  it("сохраняет исходную причину (cause) для логирования", () => {
    const cause = new Error("original");
    const err = new SttApiError("wrapped", cause);
    expect(err.name).toBe("SttApiError");
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });
});
