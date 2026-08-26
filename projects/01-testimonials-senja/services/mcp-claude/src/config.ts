/**
 * Конфигурация services/mcp-claude из переменных окружения.
 *
 * Источник переменных: docs/Architecture.md §7 (docker-compose), .env.example.
 * ANTHROPIC_API_KEY — единственный секрет этого сервиса (ADR-005, security.md §5):
 * `web` и `worker` его не получают вообще.
 */

export interface McpClaudeConfig {
  /** Порт HTTP-транспорта MCP-сервера. Канон — 7331 (Architecture §7, docker-compose.yml). */
  port: number;
  /** Ключ Anthropic API. */
  anthropicApiKey: string;
  /**
   * Модель Claude для транскрипции.
   *
   * [GAP: ни один документ проекта (Architecture.md §5, Pseudocode.md §1.1, ADR-005,
   * Specification.md FR-003/FR-NFR-SEC-002) не называет конкретную модель Claude —
   * везде фигурирует общее "Claude API". Подставлять модель наугад запрещено явно
   * (задание фазы 2 /start). Поэтому значение ОБЯЗАНО быть задано явно через
   * переменную окружения ANTHROPIC_TRANSCRIBE_MODEL — дефолта здесь нет и не будет,
   * пока модель не зафиксирована в документации продукта.]
   */
  transcribeModel: string;
  /** Максимальный размер видео в байтах — вторая линия защиты поверх FR-003 (100 MB). */
  maxVideoBytes: number;
  /** Максимальная длительность аудио в секундах — вторая линия защиты поверх FR-003 (120 сек). */
  maxDurationSeconds: number;
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `[config] переменная окружения ${name} обязательна для services/mcp-claude и не задана`,
    );
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpClaudeConfig {
  return {
    port: Number(env.PORT ?? 7331),
    anthropicApiKey: requireEnv(env, "ANTHROPIC_API_KEY"),
    transcribeModel: requireEnv(env, "ANTHROPIC_TRANSCRIBE_MODEL"),
    maxVideoBytes: Number(env.MAX_VIDEO_BYTES ?? 100 * 1024 * 1024), // FR-003: ≤ 100 MB
    maxDurationSeconds: Number(env.MAX_DURATION_SECONDS ?? 120), // FR-003: ≤ 120 сек
  };
}
