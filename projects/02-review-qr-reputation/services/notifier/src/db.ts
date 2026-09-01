import pg from 'pg';
function intFromEnv(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined || r === '') return d;
  const v = Number(r);
  if (!Number.isInteger(v) || v <= 0) throw new Error(`${n}=${JSON.stringify(r)} — ожидается целое положительное`);
  return v;
}
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_NOTIFY,
  max: intFromEnv('PGPOOL_MAX', 5),
  connectionTimeoutMillis: intFromEnv('PGPOOL_CONNECTION_TIMEOUT_MS', 2000),
});
export async function closePool(): Promise<void> { await pool.end(); }
