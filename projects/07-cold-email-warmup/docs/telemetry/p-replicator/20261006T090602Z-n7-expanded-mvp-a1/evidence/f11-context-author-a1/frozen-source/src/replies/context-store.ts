import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Envelope,Keyring } from '../mailboxes/crypto.js';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { contentLengths,decryptContent } from './crypto.js';
export interface IntentBinding {tenant:string;mailbox:string;uidvalidity:string;uid:number;runId:string;attempt:number;source:string;observedAt:Date;enrollment:string|null;root:string|null}
// Caller already holds FIRST(7,1) and has committed semantic stops before this insert.
export async function enqueueCaptureClient(c:PoolClient,b:IntentBinding) {
 const owned=b.enrollment!==null&&b.root!==null;
 await c.query(`INSERT INTO incoming_ai_event(id,semantic_event_id,tenant_id,mailbox_id,uidvalidity,uid,origin_run_id,origin_attempt,source,observed_at,enrollment_id,root_job_id,capture_state,reason,state,terminal_at,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $16 THEN NULL ELSE now() END,CASE WHEN $16 THEN now()+interval '7 days' ELSE now()+interval '24 hours' END)
 ON CONFLICT(tenant_id,mailbox_id,uidvalidity,uid) DO NOTHING`,[randomUUID(),randomUUID(),b.tenant,b.mailbox,b.uidvalidity,b.uid,b.runId,b.attempt,b.source,b.observedAt,b.enrollment,b.root,owned?'pending':'held',owned?'body_authority_required':'ambiguous_binding',owned?'pending':'held',owned]);
}
export class ContextStore {
 constructor(readonly pool:Pool,readonly ring:Keyring){}
 // No capture claim/commit API until authenticated transport authority exists in the next slice.
 async readContext(tenant:string,event:string):Promise<string[]> {
  const r=(await this.pool.query(`SELECT * FROM incoming_ai_event WHERE tenant_id=$1 AND id=$2 AND capture_state='ready' AND content_envelope IS NOT NULL AND expires_at>now() AND metadata_expires_at>now()`,[tenant,event])).rows[0];
  if(!r)throw new HttpError(404,'context_unavailable');
  const messages=decryptContent(r.content_envelope as Envelope,{tenant,mailbox:r.mailbox_id,event,bindingVersion:r.binding_version},this.ring),sizes=contentLengths(messages);
  if(JSON.stringify(sizes)!==JSON.stringify(r.message_bytes)||sizes.length!==r.thread_message_count||sizes.reduce((a,b)=>a+b,0)!==r.body_bytes)throw new HttpError(503,'context_unavailable');return messages;
 }
 async markTerminal(tenant:string,event:string) {
  return eligibilityTransaction(this.pool,async c=>{await c.query(`UPDATE incoming_ai_event SET terminal_at=LEAST(COALESCE(terminal_at,now()),now()),expires_at=LEAST(expires_at,now()+interval '24 hours') WHERE tenant_id=$1 AND id=$2`,[tenant,event]);});
 }
 async purgeExpired(limit=100) {
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new HttpError(400,'invalid_purge_limit');
  return eligibilityTransaction(this.pool,async c=>{
   const lag=(await c.query(`SELECT count(*)::integer AS overdue,COALESCE(EXTRACT(EPOCH FROM now()-min(expires_at)),0)::float8 AS lag FROM incoming_ai_event WHERE content_envelope IS NOT NULL AND expires_at<=now()`)).rows[0];
   const cleared=await c.query(`WITH due AS (SELECT id FROM incoming_ai_event WHERE expires_at<=now() AND capture_state<>'purged' ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE incoming_ai_event e SET content_envelope=NULL,message_bytes=NULL,body_bytes=NULL,thread_message_count=NULL,capture_state='purged',owner_id=NULL,lease_until=NULL FROM due WHERE e.id=due.id`,[limit]);
   const deleted=await c.query(`WITH due AS (SELECT id FROM incoming_ai_event WHERE metadata_expires_at<=now() ORDER BY metadata_expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM incoming_ai_event e USING due WHERE e.id=due.id`,[limit]);
   return {contentPurged:cleared.rowCount??0,metadataPurged:deleted.rowCount??0,overdueBefore:lag.overdue,oldestLagSeconds:lag.lag};
  });
 }
}
