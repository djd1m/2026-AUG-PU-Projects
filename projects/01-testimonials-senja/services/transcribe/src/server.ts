/**
 * services/transcribe/src/server.ts
 *
 * HTTP-сервис транскрипции. Единственная точка входа к внешнему STT-провайдеру (OpenAI)
 * в продукте.
 *
 * D-007 / docs/ADR.md ADR-005 «Что изменилось и почему»: сервис назывался mcp-claude и говорил
 * по протоколу MCP — единственный tool `transcribe_video`, потому что Claude Code / Claude API
 * ожидает вызовы через MCP-инструменты. Claude API оказался физически неспособен принимать
 * аудио (ни один content-блок Messages API — `text`/`image`/`document` — не поддерживает звук),
 * поэтому вся эта ветка снята. OpenAI STT — обычный REST-эндпоинт: MCP-протокол ему ничего не
 * даёт (никакой другой Claude-агент этот сервис не вызывает, вызывающая сторона — services/worker,
 * которому нужен один HTTP POST, а не tool-discovery). Решение: plain HTTP-сервис на Express,
 * без MCP SDK/транспорта.
 *
 * ГРАНИЦА ADR-005 ОСТАЁТСЯ АРХИТЕКТУРНОЙ, А НЕ ПРОЦЕССНОЙ — просто выражена теперь не через
 * «набор MCP-tool'ов», а через «набор HTTP-путей»: в этом сервисе (и в продукте целиком) нет
 * ни одного пути, принимающего текст отзыва на обработку. `POST /transcribe` принимает
 * ТОЛЬКО `video_url`; вернуть текст, который куда-то запишется как «улучшенный отзыв»,
 * этому сервису физически нечем — на входе нет текстового поля. STT делает speech-to-text —
 * расшифровку уже сказанного, а не генерацию — это конструктивная гарантия сама по себе,
 * не только отсутствие лишнего эндпоинта.
 *
 * Контракт проверяется исполняемым тестом — tests/contract.test.ts. Он обязан падать, если
 * кто-то зарегистрирует второй путь, принимающий вход (см. `routes` ниже), или добавит в
 * `transcribeRequestSchema` поле, похожее на текст отзыва.
 */

import express, { type Express } from "express";
import { z } from "zod";
import { loadConfig, type TranscribeConfig } from "./config.js";
import { SttApiError, transcribeVideo } from "./transcribe.js";

/**
 * Вход ЕДИНСТВЕННОЙ операции сервиса. НЕ добавлять сюда поля вида
 * `text`/`testimonial_text`/`caption` — см. ADR-005 и tests/contract.test.ts.
 */
export const transcribeRequestSchema = z
  .object({
    video_url: z
      .string()
      .url()
      .describe("Presigned GET URL на видео в MinIO (Architecture §5), TTL ~10 минут"),
  })
  .strict();

export type TranscribeRoute = {
  method: "GET" | "POST";
  path: string;
  /** Задан только для путей, принимающих вход от вызывающей стороны. */
  inputSchema?: z.ZodTypeAny;
};

export interface TranscribeApp {
  app: Express;
  /**
   * Реестр зарегистрированных маршрутов — исполняемая форма ADR-005 для контрактного теста.
   * Не читается кодом сервиса в рантайме, только тестом: `express` не даёт стабильного
   * публичного API для интроспекции роутов между мажорными версиями, а тест обязан ловить
   * случайное добавление второго input-пути независимо от внутреннего устройства Express.
   */
  routes: TranscribeRoute[];
}

/**
 * Собирает Express-приложение сервиса. Вынесено в отдельную функцию (не только в main()),
 * чтобы контрактный тест мог поднять реальный сервер на эфемерном порту без запуска
 * всего процесса — тот же приём, что раньше использовался для McpServer.
 */
export function createTranscribeApp(config: TranscribeConfig = loadConfig()): TranscribeApp {
  const app = express();
  app.use(express.json());

  const routes: TranscribeRoute[] = [];

  // === ЕДИНСТВЕННЫЙ ПУТЬ ЭТОГО СЕРВИСА, ПРИНИМАЮЩИЙ ВХОД. НЕ ДОБАВЛЯТЬ ВТОРОЙ. СМ. ADR-005. ===
  routes.push({ method: "POST", path: "/transcribe", inputSchema: transcribeRequestSchema });
  app.post("/transcribe", async (req, res) => {
    const parsed = transcribeRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
      return;
    }

    try {
      const result = await transcribeVideo(parsed.data, config);
      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof SttApiError ? err.message : "внутренняя ошибка транскрипции";
      // worker (services/worker/src/transcribe-client.ts) читает non-2xx как SttApiError и
      // переводит transcript_status в 'failed' (Pseudocode §1.1).
      res.status(502).json({ error: message });
    }
  });

  routes.push({ method: "GET", path: "/health" });
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return { app, routes };
}

async function main(): Promise<void> {
  const config = loadConfig();
  const { app } = createTranscribeApp(config);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[transcribe] слушает порт ${config.port}, единственный путь ввода: POST /transcribe`);
  });
}

// Не запускать main() при импорте модуля тестами (tests/contract.test.ts импортирует
// createTranscribeApp напрямую, HTTP-сервер ему не нужен запущенным заранее).
const isDirectRun = !!process.argv[1] && /server\.(js|ts)$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[transcribe] фатальная ошибка запуска", err);
    process.exit(1);
  });
}
