// packages/db/src/index.ts
//
// Единственная точка входа в пул соединений. НЕ ORM — Architecture.md §3.1 осознанно выбрала
// чистый SQL + RLS, ORM мешает политикам RLS. DATABASE_URL — см. .env.example и docker-compose.yml
// (комментарий "включает роли app_authenticated/app_service"): приложение подключается ОДНИМ
// пользователем (POSTGRES_USER), роли переключаются внутри транзакции через `SET LOCAL ROLE` —
// см. tenant.ts, а не через отдельные учётные данные.

import { Pool, type PoolConfig } from 'pg';

// Намеренно НЕ бросаем здесь, если DATABASE_URL не задан: модуль импортируется и ради одних
// только типов/rate-limit-хелперов (напр. в юнит-тестах) — падение должно случиться при первом
// реальном обращении к БД (pg сам выдаст внятную ошибку подключения), а не при простом импорте.
function buildPoolConfig(): PoolConfig {
  return {
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PGPOOL_MAX ?? 10),
  };
}

export const pool = new Pool(buildPoolConfig());

/** Для аккуратного завершения (тесты, graceful shutdown воркера) */
export async function closePool(): Promise<void> {
  await pool.end();
}

export { withAccount, withService } from './tenant';
export * as rateLimit from './rate-limit';
export * from './types';
