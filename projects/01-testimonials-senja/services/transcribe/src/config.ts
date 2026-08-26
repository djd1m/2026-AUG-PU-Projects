/**
 * Конфигурация services/transcribe из переменных окружения.
 *
 * Источник переменных: docs/Architecture.md §7 (docker-compose), .env.example.
 * OPENAI_API_KEY — единственный секрет этого сервиса (ADR-005, .claude/rules/security.md §5):
 * `web` и `worker` его не получают вообще, ровно как раньше не получали ANTHROPIC_API_KEY.
 *
 * ИСТОРИЯ (D-007, docs/ADR.md ADR-005 «Что изменилось и почему»): сервис изначально назывался
 * mcp-claude и вызывал Claude API. Claude API не принимает аудио вообще — вся ветка транскрипции
 * была построена на пути, которого не существует. Решение владельца: OpenAI STT,
 * `gpt-4o-mini-transcribe` (research/openai-footprint/01-speech.md §8).
 */

export interface TranscribeConfig {
  /** Порт HTTP-сервиса. Канон — 7331 (Architecture §7, docker-compose.yml), не менялся при пивоте. */
  port: number;
  /** Ключ OpenAI API. */
  openaiApiKey: string;
  /**
   * Модель OpenAI для транскрипции.
   *
   * Дефолт зафиксирован решением владельца (D-007) и подтверждён исследованием
   * research/openai-footprint/01-speech.md §8: таймкоды проекту 01 не нужны (это требование
   * проекта 05, не 01) → самая дешёвая file-модель без таймкодов, `gpt-4o-mini-transcribe`
   * (~$0.003/мин, ~$4.50 на 1000 отзывов по 90 сек). Переопределяется переменной окружения
   * OPENAI_TRANSCRIBE_MODEL, если стоимость/качество потребуют другую модель STT.
   */
  transcribeModel: string;
  /** Максимальный размер видео в байтах — вторая линия защиты поверх FR-003 (100 MB). */
  maxVideoBytes: number;
  /** Максимальная длительность аудио в секундах — вторая линия защиты поверх FR-003 (120 сек). */
  maxDurationSeconds: number;
}

const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `[config] переменная окружения ${name} обязательна для services/transcribe и не задана`,
    );
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): TranscribeConfig {
  return {
    port: Number(env.PORT ?? 7331),
    openaiApiKey: requireEnv(env, "OPENAI_API_KEY"),
    transcribeModel: env.OPENAI_TRANSCRIBE_MODEL ?? DEFAULT_TRANSCRIBE_MODEL,
    maxVideoBytes: Number(env.MAX_VIDEO_BYTES ?? 100 * 1024 * 1024), // FR-003: ≤ 100 MB
    maxDurationSeconds: Number(env.MAX_DURATION_SECONDS ?? 120), // FR-003: ≤ 120 сек
  };
}
