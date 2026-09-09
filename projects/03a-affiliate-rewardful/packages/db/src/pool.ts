import pg from 'pg';

/** One instance is constructed by the process composition root. */
export function createRuntimePool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 1_000,
    idleTimeoutMillis: 30_000,
    lock_timeout: 1_000,
    statement_timeout: 5_000,
    application_name: 'n3a-web',
  });
  // Idle sockets fail outside an awaited query. Never throw or print the attached client.
  pool.on('error', () => { console.error('database_idle_connection_error'); });
  return pool;
}
