/**
 * services/mcp-claude/src/server.ts
 *
 * MCP-сервер транскрипции. Единственная точка входа к Claude API в продукте.
 *
 * ADR-005 (docs/ADR.md): у сервиса РОВНО ОДИН зарегистрированный tool — `transcribe_video`.
 * Это архитектурная граница FTC Rule (16 CFR Part 465), а не инструкция промпта:
 * инструмента «переписать/улучшить/сгенерировать текст отзыва» не существует в коде —
 * нарушить нечем. Контракт проверяется исполняемым тестом — tests/contract.test.ts.
 *
 * Транспорт: Streamable HTTP (docs/Architecture.md §7 — docker-compose объявляет
 * `mcp-claude` как HTTP-сервис на порту 7331, `MCP_CLAUDE_URL=http://mcp-claude:7331`
 * у web/worker). Режим — stateless (`sessionIdGenerator: undefined`): каждый вызов
 * `transcribe_video` независим, воркеру не нужно поддерживать MCP-сессию между задачами.
 */

import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { ClaudeApiError, transcribeVideo } from "./transcribe.js";

/**
 * Регистрирует единственный tool на переданном McpServer.
 *
 * Вынесено в отдельную функцию, а не только в main(), чтобы контрактный тест
 * (tests/contract.test.ts) мог собрать тот же сервер в памяти без поднятия HTTP —
 * и чтобы случайное добавление второго tool было невозможно пропустить мимо теста,
 * который импортирует именно эту функцию.
 */
export function createMcpClaudeServer(
  config = loadConfig(),
): McpServer {
  const server = new McpServer({
    name: "proofwall-mcp-claude",
    version: "0.1.0",
  });

  // === ЕДИНСТВЕННЫЙ TOOL ЭТОГО СЕРВЕРА. НЕ ДОБАВЛЯТЬ ВТОРОЙ. СМ. ADR-005. ===
  server.registerTool(
    "transcribe_video",
    {
      title: "Транскрипция видео-отзыва",
      description:
        "Скачивает видео по presigned URL, извлекает звуковую дорожку и возвращает " +
        "дословную расшифровку речи через Claude API. Только расшифровка — без " +
        "переписывания, улучшения формулировок или генерации текста отзыва (ADR-005, " +
        "FR-NFR-SEC-002). Вход — видео/аудио, выход — текст; вход НИКОГДА не принимает " +
        "текст отзыва.",
      // Вход — ТОЛЬКО video_url. Никаких полей вида testimonial_text/author_text и т.п.
      // Это и есть исполняемая часть ADR-005: инструмент физически не может переписывать
      // текст отзыва, потому что не умеет его принять на вход.
      inputSchema: {
        video_url: z
          .string()
          .url()
          .describe("Presigned GET URL на видео в MinIO (Architecture §5), TTL ~10 минут"),
      },
    },
    async ({ video_url }) => {
      try {
        const result = await transcribeVideo({ video_url }, config);
        return {
          content: [{ type: "text", text: result.text }],
        };
      } catch (err) {
        const message =
          err instanceof ClaudeApiError ? err.message : "внутренняя ошибка транскрипции";
        // Ошибка возвращается как isError, а не бросается наружу транспорта — worker
        // (services/worker/src/transcribe-job.ts) читает isError и переводит
        // transcript_status в 'failed' (Pseudocode §1.1, catch ClaudeApiError).
        return {
          isError: true,
          content: [{ type: "text", text: message }],
        };
      }
    },
  );

  return server;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createMcpClaudeServer(config);

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    // Stateless-транспорт: новый на каждый запрос, ничего не переиспользуется между
    // вызовами — проще и достаточно для одного tool без стриминга состояния.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  // GET/DELETE на /mcp не поддерживаются в stateless-режиме — явный 405 вместо тишины.
  app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "method_not_allowed" });
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "method_not_allowed" });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[mcp-claude] слушает порт ${config.port}, единственный tool: transcribe_video`);
  });
}

// Не запускать main() при импорте модуля тестами (tests/contract.test.ts импортирует
// createMcpClaudeServer напрямую, HTTP ему не нужен).
const isDirectRun =
  !!process.argv[1] && /server\.(js|ts)$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[mcp-claude] фатальная ошибка запуска", err);
    process.exit(1);
  });
}
