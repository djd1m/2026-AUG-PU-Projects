/**
 * services/worker/src/cleanup-job.ts
 *
 * Architecture §3.4 «Anti-fraud и rate limiting»: "services/worker (уже поллит Postgres
 * для очереди видео, §5) дополнительно раз в час удаляет строки старше 24 часов —
 * самый широкий порог здесь 1 час, отдельный сервис под TTL не нужен."
 *
 * Единая таблица `rate_limit_events(scope, key, created_at)` обслуживает три
 * требования (FR-NFR-SEC-003, FR-GROWTH-004 @security, FR-GROWTH-005 @security,
 * см. security.md §4) — очистка одна, не по одной на каждый scope.
 */

import type { Pool } from "./db.js";

export interface CleanupResult {
  deletedRows: number;
}

/**
 * `retentionHours` — по умолчанию 24 (Architecture §3.4, дословно "старше 24 часов").
 * Самый широкий порог rate-limit в продукте — 1 час (FR-NFR-SEC-003/GROWTH-005), так
 * что 24 часа — щедрый запас, а не подгонка под конкретный scope.
 */
export async function cleanupRateLimitEvents(
  pool: Pool,
  retentionHours: number,
): Promise<CleanupResult> {
  const result = await pool.query(
    `DELETE FROM rate_limit_events WHERE created_at < now() - make_interval(hours => $1)`,
    [retentionHours],
  );
  return { deletedRows: result.rowCount ?? 0 };
}

/**
 * Периодический запуск очистки. Первый прогон — сразу при старте воркера (не через
 * час простоя после деплоя), дальше — каждые `intervalMs` (канон — раз в час).
 */
export function startCleanupSchedule(
  pool: Pool,
  retentionHours: number,
  intervalMs: number,
  onResult: (result: CleanupResult) => void = () => {},
  onError: (err: unknown) => void = (err) => console.error("[worker] cleanup_failed", err),
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (stopped) return;
    try {
      onResult(await cleanupRateLimitEvents(pool, retentionHours));
    } catch (err) {
      onError(err);
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
