import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../errors.js';
import { cancelMailbox } from '../mailboxes/store.js';
import { eligibilityTransaction } from '../consent/transaction.js';
// Internal durable seams for F04. Callers must supply actual completed poll evidence;
// no HTTP route or scheduler invokes recordPoll to manufacture freshness.
export class DispatchSeams {
 constructor(readonly pool:Pool) {}
 async recordPoll(tenant:string,mailbox:string,evidence:{completedAt:Date|null;scanComplete:boolean;uidvalidity:string|null;cursorUid:number|null}) {
  return eligibilityTransaction(this.pool,async client=>{
   if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,mailbox])).rowCount) throw new HttpError(404,'not_found');
   await client.query(`INSERT INTO mailbox_poll(mailbox_id,completed_at,scan_complete,uidvalidity,cursor_uid) VALUES($1,$2,$3,$4,$5) ON CONFLICT(mailbox_id) DO UPDATE SET completed_at=$2,scan_complete=$3,uidvalidity=$4,cursor_uid=$5`,[mailbox,evidence.completedAt,evidence.scanComplete,evidence.uidvalidity,evidence.cursorUid]);
  });
 }
 async stopEnrollment(tenant:string,id:string,state:'replied'|'suppressed') {
  return eligibilityTransaction(this.pool,async client=>{
   await stopEnrollmentClient(client,tenant,id,state);
  });
 }
 async suppress(tenant:string,digest:string,reason:string) {
  if(!/^[a-f0-9]{64}$/.test(digest) || !['reply','unsubscribe','complaint'].includes(reason)) throw new HttpError(400,'invalid_suppression');
  return eligibilityTransaction(this.pool,async client=>{
   await suppressClient(client,tenant,digest,reason);
  });
 }
 // F04 complaint/reply ingestion must call these shared atomic stop effects.
 async complaint(tenant:string,mailbox:string,digest?:string) {
  return eligibilityTransaction(this.pool,async client=>{
   if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,mailbox])).rowCount) throw new HttpError(404,'not_found');
   await complaintClient(client,tenant,mailbox,digest);
  });
 }

}

// Caller already owns eligibilityTransaction; never open a nested transaction.
export async function stopEnrollmentClient(client:PoolClient,tenant:string,id:string,state:'replied'|'suppressed') {
 if(!(await client.query("UPDATE enrollment SET state=CASE WHEN state='active' THEN $3 ELSE state END WHERE tenant_id=$1 AND id=$2 RETURNING id",[tenant,id,state])).rowCount) throw new HttpError(404,'not_found');
 await client.query("UPDATE send_job SET state='cancelled' WHERE tenant_id=$1 AND enrollment_id=$2 AND state IN ('queued','claimed')",[tenant,id]);
}

export async function suppressClient(client:PoolClient,tenant:string,digest:string,reason:string) {
 if(!/^[a-f0-9]{64}$/.test(digest) || !['reply','unsubscribe','complaint'].includes(reason)) throw new HttpError(400,'invalid_suppression');
 await client.query('INSERT INTO suppression(tenant_id,recipient_hash,reason) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[tenant,digest,reason]);
 await client.query("UPDATE enrollment SET state='suppressed' WHERE tenant_id=$1 AND recipient_hash=$2 AND state='active'",[tenant,digest]);
 await client.query("UPDATE send_job SET state='cancelled' WHERE tenant_id=$1 AND enrollment_id IN (SELECT id FROM enrollment WHERE tenant_id=$1 AND recipient_hash=$2) AND state IN ('queued','claimed')",[tenant,digest]);
}
export async function complaintClient(client:PoolClient,tenant:string,mailbox:string,digest?:string) {
 if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2 FOR UPDATE',[tenant,mailbox])).rowCount) throw new HttpError(400,'invalid_complaint');
 if(digest!==undefined) await suppressClient(client,tenant,digest,'complaint');
 await cancelMailbox(client,mailbox);
 await client.query("UPDATE mailbox SET state='quarantined' WHERE tenant_id=$1 AND id=$2",[tenant,mailbox]);
}
