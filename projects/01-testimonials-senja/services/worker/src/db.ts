/**
 * services/worker/src/db.ts
 *
 * Тонкая обёртка над `pg`. Запросы к `testimonials`/`rate_limit_events` написаны
 * напрямую по SQL из docs/Architecture.md §5 и §3.4, а не через `@proofwall/db` —
 * на момент генерации этого сервиса (Phase 2 `/start`) `packages/db` собирает
 * параллельный агент (см. системное сообщение сессии), и его экспортируемый API ещё
 * не зафиксирован. Прямой SQL здесь самодостаточен и не блокируется на чужой работе;
 * миграция на общий помощник `packages/db`, когда он появится, — механическая замена
 * этих функций без изменения вызывающего кода (transcribe-job.ts/cleanup-job.ts).
 */

import pg from "pg";

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

/**
 * Число из окружения — СТРОГО, с падением на мусоре. `Number('')` равен нулю, а
 * `max: 0` вернул бы пул к умолчанию, `connectionTimeoutMillis: 0` — к бесконечному
 * ожиданию. То есть обе меры отключались бы ровно тем способом, от которого защищают
 * (.claude/rules/fail-closed-defaults.md).
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${name}=${JSON.stringify(raw)} — ожидается целое положительное число. ` +
        "Пустое или нечисловое молча отключало бы меру, ради которой переменная введена.",
    );
  }
  return parsed;
}

export function createPool(databaseUrl: string): Pool {
  // Переменные пробрасываются воркеру в docker-compose.yml, и до FR-012 он их
  // ИГНОРИРОВАЛ: проброс был, чтения не было — конфигурация лгала (ревью H-3).
  //
  // Значения важны именно здесь: соединение удерживается ВСЁ время расшифровки
  // (сетевой вызов идёт внутри транзакции), а повторы умножают частоту таких
  // удержаний. Пул без границы и без таймаута ожидания — это очередь, растущая
  // молча, вместо отказа (.claude/rules/shared-resource-verification.md).
  return new pg.Pool({
    connectionString: databaseUrl,
    max: positiveIntFromEnv("PGPOOL_MAX", 30),
    connectionTimeoutMillis: positiveIntFromEnv("PGPOOL_CONNECTION_TIMEOUT_MS", 5000),
  });
}
