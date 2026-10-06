// F03 must reuse this exact first-operation eligibility lock, never across I/O.
export async function eligibilityTransaction(pool, operation, beforeCommit) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(7,1)');
        const result = await operation(client);
        // Synchronous final guard and COMMIT submission share one JavaScript turn.
        // Cancellation after submission cannot retroactively revoke a committed result.
        beforeCommit?.();
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
