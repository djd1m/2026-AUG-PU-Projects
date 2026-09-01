// Пул гостевого контейнера. Роль app_render — одна на контейнер, отдельной строкой
// подключения: пул можно перепутать в коде, а DATABASE_URL, которого в контейнере нет, — нет.

import pg from 'pg';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  // Number('') === 0, и ноль здесь означал бы «ждать бесконечно» — то есть отключение
  // самой меры, ради которой переменная введена. Мусор обязан быть отказом.
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name}=${JSON.stringify(raw)} — ожидается целое положительное`);
  }
  return n;
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_RENDER,
  max: intFromEnv('PGPOOL_MAX', 10),
  // БЕЗ ЭТОГО pg.Pool ждёт свободное соединение БЕСКОНЕЧНО: исчерпание пула выражалось бы
  // тихой очередью, а не отказом. Недоступность ресурса обязана быть отказом.
  connectionTimeoutMillis: intFromEnv('PGPOOL_CONNECTION_TIMEOUT_MS', 2000),
});

export async function closePool(): Promise<void> {
  await pool.end();
}
