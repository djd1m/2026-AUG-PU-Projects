/**
 * Конфигурация services/worker из переменных окружения.
 *
 * Источник переменных: docs/Architecture.md §7 (docker-compose), .env.example.
 * Секрет OPENAI_API_KEY сюда НЕ входит намеренно — worker вызывает внешний STT-провайдер
 * только через HTTP к services/transcribe, ключ ему не нужен и не должен быть доступен
 * (ADR-005, .claude/rules/security.md §5: "web и worker его не получают" — раньше это
 * правило звучало про ANTHROPIC_API_KEY, D-007 сменил провайдера, инвариант тот же).
 */

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`[config] переменная окружения ${name} обязательна для services/worker и не задана`);
  }
  return value;
}

export interface WorkerConfig {
  databaseUrl: string;

  s3Endpoint: string;
  s3Bucket: string;
  s3AccessKey: string;
  s3SecretKey: string;
  /** MinIO игнорирует регион, но AWS SDK v3 требует непустое значение. */
  s3Region: string;

  /** Architecture §7: канон http://transcribe:7331 внутри docker-сети. */
  transcribeServiceUrl: string;

  /** Пауза между итерациями поллинга очереди видео, если очередь пуста. */
  pollIntervalMs: number;
  /**
   * TTL presigned GET URL, который worker выдаёт services/transcribe (Pseudocode §1.1:
   * "presigned_url = generatePresignedGetUrl(video_object_key, ttl = 10 minutes)").
   */
  presignedUrlTtlSeconds: number;

  /** Architecture §3.4: очистка rate_limit_events раз в час. */
  cleanupIntervalMs: number;
  /** Architecture §3.4: "удаляет строки старше 24 часов". */
  rateLimitRetentionHours: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    databaseUrl: requireEnv(env, "DATABASE_URL"),

    s3Endpoint: requireEnv(env, "S3_ENDPOINT"),
    s3Bucket: requireEnv(env, "S3_BUCKET"),
    s3AccessKey: requireEnv(env, "S3_ACCESS_KEY"),
    s3SecretKey: requireEnv(env, "S3_SECRET_KEY"),
    s3Region: env.S3_REGION ?? "us-east-1",

    transcribeServiceUrl: requireEnv(env, "TRANSCRIBE_SERVICE_URL"),

    pollIntervalMs: Number(env.WORKER_POLL_INTERVAL_MS ?? 5_000),
    presignedUrlTtlSeconds: Number(env.WORKER_PRESIGNED_TTL_SECONDS ?? 10 * 60), // 10 минут

    cleanupIntervalMs: Number(env.WORKER_CLEANUP_INTERVAL_MS ?? 60 * 60 * 1000), // 1 час
    rateLimitRetentionHours: Number(env.RATE_LIMIT_RETENTION_HOURS ?? 24),
  };
}
