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

export function createPool(databaseUrl: string): Pool {
  return new pg.Pool({ connectionString: databaseUrl });
}
