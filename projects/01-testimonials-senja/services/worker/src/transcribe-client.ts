/**
 * services/worker/src/transcribe-client.ts
 *
 * HTTP-клиент к services/transcribe. Единственный способ, которым worker когда-либо
 * трогает внешний STT-провайдер — worker сам не хранит OPENAI_API_KEY и не умеет вызывать
 * OpenAI напрямую (ADR-005, .claude/rules/security.md §5, coding-style.md §1:
 * "не вызывать внешний STT-провайдер напрямую из apps/web/worker — только через клиент
 * к services/transcribe").
 *
 * D-007 / docs/ADR.md ADR-005 «Что изменилось и почему»: раньше это был MCP-клиент
 * (`McpClaudeClient`, `@modelcontextprotocol/sdk`) к сервису mcp-claude, потому что Claude API
 * — MCP-инструмент. Claude API не принимает аудио; сервис переехал на OpenAI STT и стал
 * обычным HTTP-эндпоинтом (services/transcribe/src/server.ts) — MCP-транспорт здесь больше
 * не нужен, worker делает один `fetch(POST /transcribe)`.
 *
 * Транспорт — обычный HTTP/JSON на `${TRANSCRIBE_SERVICE_URL}/transcribe` (Architecture §7:
 * канон `TRANSCRIBE_SERVICE_URL=http://transcribe:7331`).
 */

/**
 * Канон Pseudocode §1.1: "catch SttApiError as e" → `transcript_status = 'failed'`.
 * Определён локально (а не импортирован из services/transcribe) — сервисы независимы
 * и не делят код рантайма, только HTTP-контракт.
 */
export class SttApiError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "SttApiError";
  }
}

/**
 * Узкий интерфейс, которым transcribe-job.ts пользуется вместо конкретного класса —
 * структурно ему может соответствовать простой тестовый объект-подделка без mock-библиотек
 * в tests/skip-locked.test.ts / tests/transcribe-job.test.ts.
 */
export interface TranscribeClient {
  transcribeVideo(videoUrl: string): Promise<string>;
}

export class TranscribeServiceClient implements TranscribeClient {
  constructor(private readonly transcribeServiceUrl: string) {}

  /**
   * Вызывает единственную операцию services/transcribe. Пробрасывает video_url (presigned
   * GET URL, сформированный из video_object_key — см. storage.ts) и возвращает дословный текст.
   *
   * Бросает SttApiError на любую неудачу — сетевую, non-2xx HTTP-ответ или успешный ответ
   * без поля `text`.
   */
  async transcribeVideo(videoUrl: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.transcribeServiceUrl}/transcribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ video_url: videoUrl }),
      });
    } catch (err) {
      throw new SttApiError("вызов services/transcribe завершился сетевой ошибкой", err);
    }

    if (!response.ok) {
      const message = await extractErrorMessage(response);
      throw new SttApiError(message ?? `services/transcribe вернул HTTP ${response.status}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new SttApiError("services/transcribe вернул невалидный JSON", err);
    }

    const text = (json as { text?: unknown } | null)?.text;
    if (typeof text !== "string") {
      throw new SttApiError("services/transcribe вернул успешный ответ без поля text");
    }
    return text;
  }
}

async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
