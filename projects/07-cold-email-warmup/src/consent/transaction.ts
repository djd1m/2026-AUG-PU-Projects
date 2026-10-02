import type { Pool, PoolClient } from 'pg';
// F03 must reuse this exact first-operation eligibility lock, never across I/O.
export async function eligibilityTransaction<T>(pool:Pool, operation:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(7,1)');
    const result=await operation(client); await client.query('COMMIT'); return result;
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
