// Пул приёма. Роль app_intake — отдельная строка подключения, отдельный контейнер.
import pg from 'pg';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name}=${JSON.stringify(raw)} — ожидается целое положительное`);
  return n;
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_INTAKE,
  max: intFromEnv('PGPOOL_MAX', 10),
  connectionTimeoutMillis: intFromEnv('PGPOOL_CONNECTION_TIMEOUT_MS', 2000),
});

export async function closePool(): Promise<void> { await pool.end(); }
