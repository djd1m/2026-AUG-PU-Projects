/**
 * tests/contract.test.ts
 *
 * ИСПОЛНЯЕМАЯ ФОРМА ADR-005 (docs/ADR.md) и FR-NFR-SEC-002 (docs/Specification.md,
 * сценарий «в продукте нет ни одного пути, где модель порождает текст отзыва»):
 *
 *   "единственный путь, принимающий вход, — POST /transcribe с телом { video_url }
 *    и ответом { text }; в контракте отсутствует путь, принимающий текст отзыва как
 *    входной параметр"
 *
 * ИСТОРИЯ (D-007): раньше этот тест проверял, что MCP-сервер (`services/mcp-claude`)
 * экспортирует РОВНО tools=['transcribe_video']. Claude API не принимает аудио — сервис
 * переехал на OpenAI STT и стал обычным HTTP-сервисом (services/transcribe), MCP-протокол
 * ему не нужен (см. src/server.ts). Проверяемый ИНВАРИАНТ не изменился ни на йоту: у сервиса
 * нет ни одного пути, принимающего текст отзыва на обработку. Изменился только механизм
 * контроля — вместо `client.listTools()` теперь реестр `routes` + схема Zod.
 *
 * Этот тест ОБЯЗАН падать, если кто-то зарегистрирует второй путь, принимающий вход
 * (например, «улучшить формулировку»), или добавит в схему `/transcribe` поле, похожее
 * на текст отзыва. Не смягчать assertions до "содержит" — только точное равенство.
 */

import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createTranscribeApp, transcribeRequestSchema } from "../src/server.js";
import type { TranscribeConfig } from "../src/config.js";

const FAKE_CONFIG: TranscribeConfig = {
  port: 0,
  openaiApiKey: "sk-test-not-a-real-key",
  transcribeModel: "test-model-placeholder",
  maxVideoBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 120,
};

let runningServer: Server | undefined;

function startEphemeral(): { baseUrl: Promise<string> } {
  const { app } = createTranscribeApp(FAKE_CONFIG);
  const server = app.listen(0);
  runningServer = server;
  const baseUrl = new Promise<string>((resolve) => {
    server.on("listening", () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
  return { baseUrl };
}

afterEach(() => {
  runningServer?.close();
  runningServer = undefined;
});

describe("ADR-005: у сервиса нет ни одного пути, принимающего текст отзыва", () => {
  it("зарегистрирован РОВНО один путь, принимающий вход — POST /transcribe", () => {
    const { routes } = createTranscribeApp(FAKE_CONFIG);
    const inputRoutes = routes.filter((r) => r.inputSchema);

    // Точное равенство, не "содержит" и не "минимум один" — так тест ловит и случайное
    // добавление второго входного пути, и случайное переименование единственного.
    expect(inputRoutes.map((r) => `${r.method} ${r.path}`)).toEqual(["POST /transcribe"]);
  });

  it("вход POST /transcribe — только video_url, без полей текста отзыва", () => {
    const shape = (transcribeRequestSchema as unknown as { shape: Record<string, unknown> }).shape;
    const fields = Object.keys(shape);

    expect(fields).toEqual(["video_url"]);

    // Явная защита от регресса: ни одно поле входа не должно называться похоже на
    // "текст отзыва" — FR-NFR-SEC-002 запрещает путь, принимающий testimonial.text.
    const forbiddenNamePattern = /text|caption|review|testimonial/i;
    for (const field of fields) {
      expect(field).not.toMatch(forbiddenNamePattern);
    }
  });

  it("неизвестный путь («переписать отзыв») не существует — сервер отвечает 404, не тихо игнорирует", async () => {
    const { baseUrl } = startEphemeral();
    const base = await baseUrl;

    const res = await fetch(`${base}/rewrite-testimonial`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "улучши этот отзыв", id: randomUUID() }),
    });

    expect(res.status).toBe(404);
  });

  it("POST /transcribe отклоняет запрос без video_url — не пытается угадать вход по другим полям", async () => {
    const { baseUrl } = startEphemeral();
    const base = await baseUrl;

    const res = await fetch(`${base}/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "улучши этот отзыв" }),
    });

    expect(res.status).toBe(400);
  });

  it("POST /transcribe отклоняет body с посторонним полем text (strict-схема) — не игнорирует его молча", async () => {
    const { baseUrl } = startEphemeral();
    const base = await baseUrl;

    const res = await fetch(`${base}/transcribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        video_url: "https://minio.example/testimonial-videos/x.mp4",
        text: "улучши этот отзыв",
      }),
    });

    // strict() у zod отклоняет объект с незнакомым ключом целиком — сервис не может ни
    // случайно прочитать text, ни промолчать о лишнем поле.
    expect(res.status).toBe(400);
  });
});
