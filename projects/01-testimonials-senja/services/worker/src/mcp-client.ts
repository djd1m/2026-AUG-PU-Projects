/**
 * services/worker/src/mcp-client.ts
 *
 * MCP-клиент к services/mcp-claude. Единственный способ, которым worker когда-либо
 * трогает Claude API — worker сам не хранит ANTHROPIC_API_KEY и не умеет вызывать
 * Anthropic напрямую (ADR-005, .claude/rules/security.md §5, coding-style.md §1:
 * "не вызывать Claude API напрямую из apps/web/worker — только через MCP-клиент").
 *
 * Транспорт — Streamable HTTP на `${MCP_CLAUDE_URL}/mcp` (Architecture §7: канон
 * `MCP_CLAUDE_URL=http://mcp-claude:7331`).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Канон Pseudocode §1.1: "catch ClaudeApiError as e" → `transcript_status = 'failed'`.
 * Определён локально (а не импортирован из services/mcp-claude) — сервисы независимы
 * и не делят код рантайма, только HTTP-контракт.
 */
export class ClaudeApiError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "ClaudeApiError";
  }
}

/**
 * Узкий интерфейс, которым transcribe-job.ts пользуется вместо конкретного класса —
 * `McpClaudeClient` хранит приватные поля (транспорт, флаг подключения), поэтому
 * структурно ему не может соответствовать простой тестовый объект-подделка; интерфейс
 * решает это стандартным приёмом (dependency inversion) и не требует mock-библиотек
 * в tests/skip-locked.test.ts / tests/transcribe-job.test.ts.
 */
export interface TranscribeClient {
  transcribeVideo(videoUrl: string): Promise<string>;
}

export class McpClaudeClient implements TranscribeClient {
  private client: Client;
  private connected = false;

  constructor(private readonly mcpClaudeUrl: string) {
    this.client = new Client({ name: "proofwall-worker", version: "0.1.0" });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    const transport = new StreamableHTTPClientTransport(new URL(`${this.mcpClaudeUrl}/mcp`));
    await this.client.connect(transport);
    this.connected = true;
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }

  /**
   * Вызывает единственный tool mcp-claude. Пробрасывает video_url (presigned GET URL,
   * сформированный из video_object_key — см. storage.ts) и возвращает дословный текст.
   *
   * Бросает ClaudeApiError на любую неудачу — сетевую, транспортную MCP-ошибку или
   * `isError: true` в результате tool-вызова (mcp-claude/src/server.ts возвращает
   * ошибку транскрипции именно так, не бросая исключение через транспорт).
   */
  async transcribeVideo(videoUrl: string): Promise<string> {
    if (!this.connected) {
      throw new ClaudeApiError("MCP-клиент не подключён к mcp-claude — вызови connect() сначала");
    }

    let result;
    try {
      result = await this.client.callTool({
        name: "transcribe_video",
        arguments: { video_url: videoUrl },
      });
    } catch (err) {
      throw new ClaudeApiError("вызов transcribe_video завершился ошибкой транспорта MCP", err);
    }

    if (result.isError) {
      const message = extractErrorText(result.content) ?? "mcp-claude вернул isError без деталей";
      throw new ClaudeApiError(message);
    }

    const text = extractErrorText(result.content);
    if (text === null) {
      throw new ClaudeApiError("mcp-claude вернул успешный результат без текстового блока");
    }
    return text;
  }
}

function extractErrorText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const textBlock = content.find(
    (block): block is { type: "text"; text: string } =>
      typeof block === "object" && block !== null && (block as { type?: string }).type === "text",
  );
  return textBlock?.text ?? null;
}
