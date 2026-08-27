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
/**
 * Число из окружения — СТРОГО, с падением на мусоре.
 *
 * `Number('')` равен нулю, `Number(' ')` тоже, `Number('abc')` — NaN. С прежним
 * `Number(process.env.X ?? 30)` опечатка или пустое значение в `.env` молча давали:
 *   max: 0                      -> pg возвращается к своему умолчанию, то есть к 10;
 *   connectionTimeoutMillis: 0  -> ожидание соединения снова БЕСКОНЕЧНОЕ.
 * То есть обе меры из D-010 отключались, и ровно тем способом, от которого они защищают.
 * Это тот же класс, что закрывает .claude/rules/fail-closed-defaults.md: отсутствие
 * данных обязано означать отказ, а не самое разрешающее значение.
 */
function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${name}=${JSON.stringify(raw)} — ожидается целое положительное число. ` +
        'Пустое или нечисловое значение молча отключало бы меру, ради которой переменная введена.',
    );
  }
  return parsed;
}

function buildPoolConfig(): PoolConfig {
  return {
    connectionString: process.env.DATABASE_URL,
    // D-010: 30, а не 10. argon2 при входе считается внутри транзакции и держит
    // соединение ~50 мс; при пуле в 10 поток входов вычерпывал бы его и клал бы
    // вместе с входом дашборд, витрину, виджет и приём отзывов.
    max: positiveIntFromEnv('PGPOOL_MAX', 30),
    // БЕЗ ЭТОГО pg.Pool ждёт свободное соединение БЕСКОНЕЧНО (pg-pool/index.js:206):
    // исчерпание пула выражалось бы тихой очередью, а не отказом. Недоступность
    // ресурса обязана быть отказом — .claude/rules/fail-closed-defaults.md, п. 5.
    connectionTimeoutMillis: positiveIntFromEnv('PGPOOL_CONNECTION_TIMEOUT_MS', 5000),
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
