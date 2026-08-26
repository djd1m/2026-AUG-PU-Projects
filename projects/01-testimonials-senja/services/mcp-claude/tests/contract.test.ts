/**
 * tests/contract.test.ts
 *
 * ИСПОЛНЯЕМАЯ ФОРМА ADR-005 (docs/ADR.md) и FR-NFR-SEC-002 (docs/Specification.md,
 * сценарий «MCP-контракт транскрипции структурно не даёт tool для переписывания текста»):
 *
 *   "единственный доступный tool — transcribe_video с входом видео/аудио и выходом текст,
 *    в контракте отсутствует tool, принимающий текст отзыва в качестве входного параметра"
 *
 * Этот тест ОБЯЗАН падать, если кто-то зарегистрирует второй tool на этом сервере —
 * именно так задание фазы 2 требует зафиксировать границу: не инструкцией, а тестом.
 * Не смягчать assertion до "содержит transcribe_video" — только точное равенство списка.
 */

import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpClaudeServer } from "../src/server.js";
import type { McpClaudeConfig } from "../src/config.js";

const FAKE_CONFIG: McpClaudeConfig = {
  port: 0,
  anthropicApiKey: "sk-test-not-a-real-key",
  transcribeModel: "test-model-placeholder",
  maxVideoBytes: 100 * 1024 * 1024,
  maxDurationSeconds: 120,
};

async function connectedClient() {
  const server = createMcpClaudeServer(FAKE_CONFIG);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { client, server };
}

describe("ADR-005: единственный tool на mcp-claude", () => {
  it("список зарегистрированных tools равен РОВНО ['transcribe_video']", async () => {
    const { client } = await connectedClient();

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);

    // Точное равенство, не "содержит" и не "минимум один" — так тест ловит и
    // случайное добавление второго tool, и случайное переименование единственного.
    expect(names).toEqual(["transcribe_video"]);
  });

  it("вход transcribe_video — только video_url, без полей текста отзыва", async () => {
    const { client } = await connectedClient();

    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "transcribe_video");
    expect(tool).toBeDefined();

    const properties = (tool?.inputSchema as { properties?: Record<string, unknown> })
      .properties;
    const inputFields = Object.keys(properties ?? {});

    expect(inputFields).toEqual(["video_url"]);

    // Явная защита от регресса: ни одно поле входа не должно называться похоже на
    // "текст отзыва" — FR-NFR-SEC-002 запрещает tool, принимающий testimonial.text.
    const forbiddenNamePattern = /text|caption|review|testimonial/i;
    for (const field of inputFields) {
      expect(field).not.toMatch(forbiddenNamePattern);
    }
  });

  it("неизвестный tool не вызывается — сервер отвечает ошибкой, а не тихо игнорирует", async () => {
    const { client } = await connectedClient();

    // rewrite_testimonial — такого tool не существует и не должно появиться (ADR-005).
    // MCP-протокол отвечает на неизвестный tool структурированной ошибкой
    // (JSON-RPC -32602, isError: true), не молчаливым успехом и не выполнением вызова.
    const result = await client.callTool({
      name: "rewrite_testimonial",
      arguments: { text: "улучши этот отзыв", id: randomUUID() },
    });

    expect(result.isError).toBe(true);
  });
});
