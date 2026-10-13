import type { Pool } from 'pg';
import { eligibilityTransaction } from '../src/consent/transaction.js';
// Explicit lease fixtures anchored to each regression's simulated clock.
export async function seedCapacity(pool:Pool,now:Date) {
 await eligibilityTransaction(pool,async c=>{
  await c.query(`INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at)
   SELECT id,tenant_id,id,'active',$1::timestamptz+interval '120 seconds' FROM mailbox WHERE state='verified_test'
   ON CONFLICT(mailbox_id) DO UPDATE SET state='active',expires_at=EXCLUDED.expires_at`,[now]);
 });
}
