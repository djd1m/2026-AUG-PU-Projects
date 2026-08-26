/**
 * services/worker/src/index.ts
 *
 * Точка входа services/worker (Architecture §2: "Фоновый обработчик очереди видео
 * (polling jobs-таблицы)"). Запускает два независимых периодических процесса:
 *
 * 1. Поллинг очереди транскрипции (transcribe-job.ts) — Architecture §5.
 * 2. Очистка rate_limit_events раз в час (cleanup-job.ts) — Architecture §3.4.
 *
 * Оба — тонкие поллеры Postgres, отдельного планировщика/очереди (BullMQ/Redis) не
 * заводим — тот же принцип простоты недели, что и в §3.4/§5.
 */

import { cleanupRateLimitEvents, startCleanupSchedule } from "./cleanup-job.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { McpClaudeClient } from "./mcp-client.js";
import { createS3Client, generatePresignedGetUrl } from "./storage.js";
import { startTranscriptionPoll } from "./transcribe-job.js";

async function main(): Promise<void> {
  const config = loadConfig();

  const pool = createPool(config.databaseUrl);
  const s3 = createS3Client(config);
  const mcpClient = new McpClaudeClient(config.mcpClaudeUrl);
  await mcpClient.connect();

  console.log("[worker] запущен", {
    pollIntervalMs: config.pollIntervalMs,
    cleanupIntervalMs: config.cleanupIntervalMs,
    mcpClaudeUrl: config.mcpClaudeUrl,
  });

  const stopTranscription = startTranscriptionPoll(
    {
      pool,
      mcpClient,
      presignVideoUrl: (videoObjectKey) =>
        generatePresignedGetUrl(s3, config.s3Bucket, videoObjectKey, config.presignedUrlTtlSeconds),
    },
    config.pollIntervalMs,
  );

  const stopCleanup = startCleanupSchedule(
    pool,
    config.rateLimitRetentionHours,
    config.cleanupIntervalMs,
    (result) => {
      if (result.deletedRows > 0) {
        console.log("[worker] rate_limit_events очищены", result);
      }
    },
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] получен ${signal}, останавливаюсь`);
    stopTranscription();
    stopCleanup();
    await mcpClient.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

// см. mcp-claude/src/server.ts — тот же приём: не запускать main() при импорте
// модулей тестами.
const isDirectRun = !!process.argv[1] && /index\.(js|ts)$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((err) => {
    console.error("[worker] фатальная ошибка запуска", err);
    process.exit(1);
  });
}

// Экспортировано для интеграционных/ручных проверок очистки без полного запуска.
export { cleanupRateLimitEvents };
