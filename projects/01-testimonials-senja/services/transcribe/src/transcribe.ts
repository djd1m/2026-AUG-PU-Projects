/**
 * services/transcribe/src/transcribe.ts
 *
 * Реализация ЕДИНСТВЕННОЙ операции сервиса: скачать видео по presigned URL, извлечь
 * звуковую дорожку и получить от внешнего STT-провайдера (OpenAI) дословную расшифровку речи.
 *
 * D-007 / docs/ADR.md ADR-005 «Что изменилось и почему»: изначально здесь стоял Claude API —
 * невыполнимо технически, Claude API не принимает аудио ни в каком content-блоке (`text`,
 * `image`, `document` — аудио прямо названо неподдерживаемым). Решение владельца: OpenAI STT.
 *
 * Источники:
 * - docs/Architecture.md §5 «Хранение и обработка видео», шаги 3-4: worker вызывает
 *   `POST /transcribe { video_url }`; ИМЕННО services/transcribe «скачивает видео, отправляет
 *   аудио-дорожку в OpenAI STT» — извлечение звука выполняется ЗДЕСЬ, не в воркере.
 * - docs/Pseudocode.md §1.1 (`transcribeVideoJob`): `audio = extractAudioTrack(...)`,
 *   `transcript_text = sttApi.transcribe(audio)` — вызов STT принимает звук, не текст отзыва
 *   (это и есть архитектурная граница ADR-005, теперь конструктивная, а не только процессная:
 *   STT делает speech-to-text — расшифровку уже сказанного, а не генерацию текста).
 * - docs/ADR.md ADR-005 / .claude/rules/security.md §5: единственный разрешённый вход
 *   STT-провайдера в этом продукте — звук/видео отзыва, единственный выход — текст.
 *   Пути, принимающего testimonial.text, не существует и не должно появиться.
 * - research/openai-footprint/01-speech.md — модель, лимиты, форматы, цена (раздел 1, 4, 8).
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TranscribeConfig } from "./config.js";

/**
 * Канон Architecture §10 / Pseudocode §1.1: неудачный вызов сервиса транскрипции переводит
 * `testimonials.transcript_status` в `failed`, а не роняет воркер молча.
 * Worker (services/worker/src/transcribe-job.ts) ловит именно этот тип ошибки.
 *
 * Названа SttApiError (не ClaudeApiError) с момента D-007 — провайдер сменился, инвариант
 * («неудача STT — терминальное состояние failed, не падение процесса») остался тем же.
 */
export class SttApiError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = "SttApiError";
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
 * Лимит размера файла на запрос к OpenAI Audio API — 25 MB (research/openai-footprint/01-speech.md
 * §4, дословно: "Files can be up to 25 MB"). Извлечённая дорожка (моно, 16 кГц, ≤120 сек) в разы
 * меньше — это вторая линия защиты поверх собственного FR-003, на случай если параметры
 * извлечения когда-нибудь изменятся.
 */
const OPENAI_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * [GAP: research/openai-footprint/01-speech.md фиксирует модель, лимиты, форматы и цену
 * (разделы 1, 4, 8), но не цитирует дословно REST-контракт (endpoint, имена полей
 * multipart-запроса, форма JSON-ответа) — только ссылки на страницы документации OpenAI.
 * Задание фазы явно запрещает подставлять параметры API наугад. Ниже — общепринятый REST-контракт
 * OpenAI Audio Transcriptions API (`POST /v1/audio/transcriptions`, multipart-поля `file`+`model`,
 * ответ по умолчанию `{ "text": "..." }` без `response_format=verbose_json`, который проекту 01
 * не нужен — таймкоды не требуются). Сверить с
 * https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
 * перед продакшн-использованием.]
 */
const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Скачивает видео по presigned URL во временный файл с ограничением по размеру
 * (вторая линия защиты поверх FR-003: ≤100 MB уже проверено на приёме, но services/transcribe
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
      throw new SttApiError(
        `не удалось скачать видео по presigned URL: HTTP ${response.status}`,
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new SttApiError(
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
          throw new SttApiError(
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
    if (err instanceof SttApiError) throw err;
    throw new SttApiError("ошибка сети при скачивании видео", err);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Извлекает звуковую дорожку через ffmpeg: моно, 16 кГц (стандартно достаточно для
 * распознавания речи), обрезка по максимальной длительности как вторая линия защиты
 * поверх FR-003 (≤120 сек уже проверено на приёме — здесь просто не даём себе же
 * отправить в STT больше, чем разрешено). wav — один из форматов, официально поддерживаемых
 * OpenAI Audio API (research/openai-footprint/01-speech.md §4).
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
      reject(new SttApiError("не удалось запустить ffmpeg", err));
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new SttApiError(`ffmpeg завершился с кодом ${code}: ${stderr.slice(-2000)}`));
      }
    });
  });
}

/**
 * Единственный вызов внешнего STT-провайдера во всём продукте (ADR-005). Вход — звук, выход —
 * текст. См. [GAP] у OPENAI_TRANSCRIPTIONS_URL выше — точная форма запроса/ответа не подтверждена
 * research-документом дословно.
 */
async function callOpenAiTranscription(
  apiKey: string,
  model: string,
  audioBuffer: Buffer,
): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  // Buffer.buffer может быть SharedArrayBuffer в типах Node — Blob принимает только
  // ArrayBuffer/Uint8Array<ArrayBuffer>; копия через Uint8Array.from() снимает несовпадение
  // типов, не поведения (те же байты).
  form.append(
    "file",
    new Blob([Uint8Array.from(audioBuffer)], { type: "audio/wav" }),
    "audio.wav",
  );

  let response: Response;
  try {
    response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (err) {
    throw new SttApiError("вызов OpenAI STT API завершился сетевой ошибкой", err);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new SttApiError(
      `OpenAI STT API вернул HTTP ${response.status}: ${bodyText.slice(0, 500)}`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    throw new SttApiError("OpenAI STT API вернул невалидный JSON", err);
  }

  const text = (json as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new SttApiError("OpenAI STT API вернул ответ без поля text");
  }
  return text.trim();
}

/**
 * Оркестрирует полный путь: скачать → извлечь звук → отправить в OpenAI STT → вернуть текст.
 * Временные файлы гарантированно удаляются (finally) — presigned URL и звук отзыва
 * не должны переживать вызов дольше необходимого (Architecture §5).
 */
export async function transcribeVideo(
  input: TranscribeVideoInput,
  config: TranscribeConfig,
): Promise<TranscribeVideoOutput> {
  const workDir = await mkdtemp(path.join(tmpdir(), "proofwall-transcribe-"));
  const videoPath = path.join(workDir, `${randomUUID()}.video`);
  const audioPath = path.join(workDir, `${randomUUID()}.wav`);

  try {
    await downloadToTempFile(input.video_url, videoPath, config.maxVideoBytes);

    const videoStat = await stat(videoPath);
    if (videoStat.size === 0) {
      throw new SttApiError("скачанный файл видео пуст");
    }

    await extractAudioTrack(videoPath, audioPath, config.maxDurationSeconds);

    const audioStat = await stat(audioPath);
    if (audioStat.size > OPENAI_MAX_AUDIO_BYTES) {
      throw new SttApiError(
        `извлечённая аудио-дорожка превышает лимит OpenAI Audio API ` +
          `(${audioStat.size} > ${OPENAI_MAX_AUDIO_BYTES} байт, research §4)`,
      );
    }

    const audioBuffer = await readFile(audioPath);

    const text = await callOpenAiTranscription(config.openaiApiKey, config.transcribeModel, audioBuffer);

    return { text };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
