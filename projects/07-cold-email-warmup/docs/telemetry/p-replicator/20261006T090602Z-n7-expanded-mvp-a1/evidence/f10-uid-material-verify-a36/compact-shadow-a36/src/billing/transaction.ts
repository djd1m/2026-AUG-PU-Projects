import type { Pool,PoolClient } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
// One lock order for entitlement writers and resource-limit readers; no adapter I/O here.
export function billingTransaction<T>(pool:Pool,operation:(client:PoolClient)=>Promise<T>) {
 return eligibilityTransaction(pool,async client=>{await client.query('SELECT pg_advisory_xact_lock(7,5)');return operation(client);});
}
