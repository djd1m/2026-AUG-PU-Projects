/**
 * services/mcp-claude/src/transcribe.ts
 *
 * Реализация ЕДИНСТВЕННОЙ операции сервиса: скачать видео по presigned URL, извлечь
 * звуковую дорожку и получить от Claude API дословную расшифровку речи.
 *
 * Источники:
 * - docs/Architecture.md §5 «Хранение и обработка видео», шаги 3-4: worker вызывает
 *   `transcribe_video(video_url)`; ИМЕННО mcp-claude «скачивает видео, отправляет
 *   аудио-дорожку в Claude API» — извлечение звука выполняется ЗДЕСЬ, не в воркере.
 * - docs/Pseudocode.md §1.1 (`transcribeVideoJob`): `audio = extractAudioTrack(...)`,
 *   `transcript_text = claudeApi.transcribe(audio)` — вызов Claude принимает звук,
 *   не текст отзыва (это и есть архитектурная граница ADR-005).
 * - docs/ADR.md ADR-005 / .claude/rules/security.md §5: единственный разрешённый вход
 *   Claude API в этом продукте — звук/видео отзыва, единственный выход — текст.
 *   Инструмента, принимающего testimonial.text, не существует и не должно появиться.
 *
 * ВАЖНАЯ ПОПРАВКА ИНФРАСТРУКТУРЫ (см. README «Исправление Dockerfile»): исходный
 * services/worker/Dockerfile ставил ffmpeg с комментарием «для извлечения аудиодорожки
 * перед транскрипцией» — это противоречило Architecture §5, где извлечение явно
 * закреплено за mcp-claude. Ffmpeg перенесён в Dockerfile ЭТОГО сервиса.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { McpClaudeConfig } from "./config.js";

/**
 * Канон Architecture §10 / Pseudocode §1.1: неудачный вызов MCP переводит
 * `testimonials.transcript_status` в `failed`, а не роняет воркер молча.
 * Worker (services/worker/src/transcribe-job.ts) ловит именно этот тип ошибки.
 */
export class ClaudeApiError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "ClaudeApiError";
  }
}

export interface TranscribeVideoInput {
  /**
   * Presigned GET URL на видео в MinIO (Architecture §5, канон video_object_key —
   * НЕ постоянная ссылка). Живёт только на время этого вызова, в БД не попадает.
   */
  video_url: string;
}

export interface TranscribeVideoOutput {
  /** Дословная расшифровка речи. Ничего, кроме расшифровки речи — ADR-005. */
  text: string;
}

const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Скачивает видео по presigned URL во временный файл с ограничением по размеру
 * (вторая линия защиты поверх FR-003: ≤100 MB уже проверено на приёме, но mcp-claude
 * не должен доверять входу вслепую — принимает URL от воркера, а не от клиента напрямую,
 * однако лимит стоит проверять на границе сервиса).
 */
async function downloadToTempFile(
  videoUrl: string,
  destPath: string,
  maxBytes: number,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(videoUrl, { signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new ClaudeApiError(
        `не удалось скачать видео по presigned URL: HTTP ${response.status}`,
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new ClaudeApiError(
        `видео превышает допустимый размер (${contentLength} > ${maxBytes} байт, FR-003)`,
      );
    }

    let written = 0;
    const fileStream = createWriteStream(destPath);
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        written += value.byteLength;
        if (written > maxBytes) {
          throw new ClaudeApiError(
            `видео превышает допустимый размер при скачивании (> ${maxBytes} байт, FR-003)`,
          );
        }
        await new Promise<void>((resolve, reject) => {
          fileStream.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
        });
      }
    } finally {
      await new Promise<void>((resolve) => fileStream.end(resolve));
    }
  } catch (err) {
    if (err instanceof ClaudeApiError) throw err;
    throw new ClaudeApiError("ошибка сети при скачивании видео", err);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Извлекает звуковую дорожку через ffmpeg: моно, 16 кГц (стандартно достаточно для
 * распознавания речи), обрезка по максимальной длительности как вторая линия защиты
 * поверх FR-003 (≤120 сек уже проверено на приёме — здесь просто не даём себе же
 * отправить в Claude больше, чем разрешено).
 */
async function extractAudioTrack(
  videoPath: string,
  audioPath: string,
  maxDurationSeconds: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vn", // без видео-дорожки — нужен только звук
      "-ac",
      "1",
      "-ar",
      "16000",
      "-t",
      String(maxDurationSeconds),
      "-f",
      "wav",
      audioPath,
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on("error", (err) => {
      reject(new ClaudeApiError("не удалось запустить ffmpeg", err));
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new ClaudeApiError(`ffmpeg завершился с кодом ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

/**
 * Единственный вызов Claude API во всём продукте (ADR-005). Вход — звук, выход — текст.
 *
 * [GAP: точная форма content-блока для передачи звука в Messages API Anthropic не
 * подтверждена документацией продукта (Architecture.md/Pseudocode.md/ADR.md называют
 * только "Claude API", не конкретный endpoint/модель/схему для аудио-входа). Ниже —
 * рабочая заготовка на основе `document`-content-блока (ближайший документированный
 * механизм передачи произвольного base64-бинарника в Messages API, обычно используемый
 * для PDF) — она НЕ подтверждена как корректная для звука и должна быть сверена с
 * актуальной документацией Anthropic перед продакшн-использованием. Модель НЕ
 * захардкожена намеренно — берётся из ANTHROPIC_TRANSCRIBE_MODEL (см. config.ts),
 * дефолта нет, чтобы не подставлять её наугад.]
 */
async function callClaudeTranscription(
  client: Anthropic,
  model: string,
  audioBase64: string,
  audioMimeType: string,
): Promise<string> {
  // FTC-инвариант (ADR-005, FR-NFR-SEC-002): системный промпт — только расшифровка,
  // без «улучшений» и без переписывания. Промпт — вторая линия защиты, НЕ замена
  // архитектурной границе (единственный tool на сервере) — см. ADR-005 «Альтернативы».
  const SYSTEM_PROMPT =
    "Ты — движок распознавания речи. Твоя единственная задача — дословно расшифровать " +
    "речь из предоставленного аудио на языке оригинала. Никогда не исправляй грамматику, " +
    "не переформулируй, не сокращай и не дополняй сказанное. Если речь неразборчива — " +
    "отметь это как [неразборчиво], не додумывай слова. Верни только текст расшифровки, " +
    "без вступлений и комментариев.";

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              // [GAP: см. комментарий функции выше — media_type звука в document-блоке
              // не подтверждён официальной документацией на момент написания.]
              type: "document",
              source: {
                type: "base64",
                media_type: audioMimeType as never,
                data: audioBase64,
              },
            },
            {
              type: "text",
              text: "Расшифруй речь из приложенного аудио дословно.",
            },
          ],
        },
      ],
    });
  } catch (err) {
    throw new ClaudeApiError("вызов Claude API завершился ошибкой", err);
  }

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );
  if (!textBlock || !textBlock.text.trim()) {
    throw new ClaudeApiError("Claude API вернул пустой ответ без текстового блока");
  }
  return textBlock.text.trim();
}

/**
 * Оркестрирует полный путь: скачать → извлечь звук → отправить в Claude → вернуть текст.
 * Временные файлы гарантированно удаляются (finally) — presigned URL и звук отзыва
 * не должны переживать вызов дольше необходимого (Architecture §5).
 */
export async function transcribeVideo(
  input: TranscribeVideoInput,
  config: McpClaudeConfig,
  anthropicClient: Anthropic = new Anthropic({ apiKey: config.anthropicApiKey }),
): Promise<TranscribeVideoOutput> {
  const workDir = await mkdtemp(path.join(tmpdir(), "proofwall-transcribe-"));
  const videoPath = path.join(workDir, `${randomUUID()}.video`);
  const audioPath = path.join(workDir, `${randomUUID()}.wav`);

  try {
    await downloadToTempFile(input.video_url, videoPath, config.maxVideoBytes);

    const videoStat = await stat(videoPath);
    if (videoStat.size === 0) {
      throw new ClaudeApiError("скачанный файл видео пуст");
    }

    await extractAudioTrack(videoPath, audioPath, config.maxDurationSeconds);

    const audioBuffer = await readFile(audioPath);
    const audioBase64 = audioBuffer.toString("base64");

    const text = await callClaudeTranscription(
      anthropicClient,
      config.transcribeModel,
      audioBase64,
      "audio/wav",
    );

    return { text };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
