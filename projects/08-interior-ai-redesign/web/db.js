import pg from 'pg';
export function createPool(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 2000,
    idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 6000 });
  pool.on('error', () => console.error('database_connection_error'));
  return pool;
}
export async function transaction(pool, action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
