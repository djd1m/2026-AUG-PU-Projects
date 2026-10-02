import type { Pool } from 'pg';
import type { Config } from '../config.js';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { decryptCredentials } from '../mailboxes/crypto.js';
import type { MailboxInput } from '../mailboxes/input.js';
import { openRecipient,recipientDigest } from '../campaigns/store.js';
import { freshMailbox,poolEligible } from './eligibility.js';
import { renderTestMessage } from './message.js';
import { localSinkAdapter,retryDelay,type SubmissionAdapter,type TestOutcome } from './adapter.js';
export interface SubmissionFixtures {
 clock?:()=>Date;adapter?:SubmissionAdapter;
 beforeFinal?:()=>Promise<void>;afterCommit?:()=>Promise<void>;
}
export class SubmissionStore {
 constructor(readonly pool:Pool,readonly config:Config,readonly fixtures:SubmissionFixtures={}) {}
 private now() {return this.fixtures.clock?.()??new Date();}
 async submit(id:string,owner:string) {
  await this.fixtures.beforeFinal?.();const now=this.now();
  const prepared=await eligibilityTransaction(this.pool,async client=>{
   // Operator authority is configured at process startup, never chosen by HTTP input.
   if(this.config.dispatchMode!=='local_test' || (this.fixtures.adapter && this.fixtures.adapter.mode!=='local_test')) return null;
   const day=now.toISOString().slice(0,10);
   const row=(await client.query(`UPDATE send_job j SET state='submitting',reserved_day=$4,
     attempt_count=attempt_count+1,first_attempt_at=COALESCE(first_attempt_at,$1),submitting_at=$1,outcome=NULL
    FROM mailbox m WHERE j.id=$2 AND j.mailbox_id=m.id AND j.tenant_id=m.tenant_id
    AND j.state='claimed' AND (j.outcome IS NULL OR j.outcome='proved_pre_data_retry') AND j.lease_owner=$3 AND j.lease_until>$1 AND j.due_at<=$1
    AND j.attempt_count<3 AND (j.first_attempt_at IS NULL OR ($1>=j.first_attempt_at AND $1<j.first_attempt_at+interval '120 seconds'))
    AND ${freshMailbox}
    AND ((j.scope='pool' AND ${poolEligible} AND EXISTS(SELECT 1 FROM mailbox m WHERE m.id=j.recipient_mailbox_id AND m.tenant_id<>j.tenant_id AND ${poolEligible}))
      OR (j.scope='campaign' AND EXISTS(SELECT 1 FROM campaign c JOIN enrollment e ON e.campaign_id=c.id AND e.tenant_id=c.tenant_id
       JOIN consent s ON s.campaign_id=c.id AND s.mailbox_id=j.mailbox_id AND s.tenant_id=j.tenant_id
       WHERE c.id=j.campaign_id AND c.tenant_id=j.tenant_id AND c.state='active' AND c.content_version=j.campaign_version
       AND e.id=j.enrollment_id AND e.campaign_version=c.content_version AND e.state='active'
       AND s.scope='campaign' AND s.revoked_at IS NULL AND s.scope_version=c.content_version AND s.recipient_fingerprint=c.recipient_fingerprint
       AND NOT EXISTS(SELECT 1 FROM suppression x WHERE x.tenant_id=e.tenant_id AND x.recipient_hash=e.recipient_hash))))
    AND (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.id<>j.id AND q.reserved_day=$4::date
       AND q.state IN ('claimed','submitting','submitted','unknown'))<LEAST(m.daily_limit,m.provider_limit,30)
    RETURNING j.*`,[now,id,owner,day])).rows[0];
   if(!row) {
    // Release a movable claim if the new day's quota (or lowered cap) is full.
    await client.query(`UPDATE send_job j SET state='queued',reserved_day=NULL,lease_owner=NULL,lease_until=NULL,due_at=$1::date+interval '1 day'
     FROM mailbox m WHERE j.id=$2 AND j.mailbox_id=m.id AND j.state='claimed' AND j.lease_owner=$3 AND j.lease_until>$1
     AND (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.id<>j.id AND q.reserved_day=$4::date
       AND q.state IN ('claimed','submitting','submitted','unknown'))>=LEAST(m.daily_limit,m.provider_limit,30)`,[now,id,owner,day]);
    return null;
   }
   const sender=(await client.query('SELECT credential_envelope FROM mailbox WHERE tenant_id=$1 AND id=$2',[row.tenant_id,row.mailbox_id])).rows[0];
   // Reuse AEAD solely to obtain addresses; adapter receives no credential object.
   const from=decryptCredentials<MailboxInput>(sender.credential_envelope,row.tenant_id,row.mailbox_id,this.config.credentialKeyring).senderAddress;
   let to:string,recipientTenant:string|null=null,digest:string;
   if(row.scope==='pool') {
    const recipient=(await client.query('SELECT tenant_id,credential_envelope FROM mailbox WHERE id=$1',[row.recipient_mailbox_id])).rows[0];
    recipientTenant=recipient.tenant_id;
    to=decryptCredentials<MailboxInput>(recipient.credential_envelope,recipient.tenant_id,row.recipient_mailbox_id,this.config.credentialKeyring).senderAddress;
    digest=recipientDigest(to,this.config.recipientHashKey);
   } else {
    const e=(await client.query('SELECT recipient_envelope,recipient_hash FROM enrollment WHERE tenant_id=$1 AND id=$2',[row.tenant_id,row.enrollment_id])).rows[0];
    to=openRecipient(e.recipient_envelope,row.tenant_id,row.enrollment_id,this.config.credentialKeyring);digest=e.recipient_hash;
   }
   const parent=row.parent_id?(await client.query('SELECT message_id FROM send_job WHERE id=$1',[row.parent_id])).rows[0]?.message_id:undefined;
   const rendered=renderTestMessage(from,to,row.payload,this.config.origin,parent);
   await client.query('UPDATE send_job SET message_id=$2 WHERE id=$1',[id,rendered.message.messageId]);
   await client.query(`INSERT INTO unsubscribe_token(token_hash,job_id,tenant_id,mailbox_id,enrollment_id,recipient_hash,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz+interval '30 days')`,[rendered.tokenHash,id,row.tenant_id,row.mailbox_id,row.enrollment_id,digest,now]);
   return {row,message:rendered.message,recipientTenant};
  });
  if(!prepared) return {state:'blocked',calls:0};
  // COMMIT above is irreversible, including a caller crash before the adapter.
  await this.fixtures.afterCommit?.();
  let outcome:TestOutcome;
  try {outcome=await (this.fixtures.adapter??localSinkAdapter).submit(prepared.message);} catch {outcome={kind:'ambiguous'};}
  return eligibilityTransaction(this.pool,async client=>{
   const current=(await client.query("SELECT * FROM send_job WHERE id=$1 AND state='submitting' AND attempt_count=$2 FOR UPDATE",[id,prepared.row.attempt_count])).rows[0];
   if(!current) return {state:'unknown_delivery',calls:1};
   const finished=this.now();let state:string='unknown',reason='unknown_delivery';
   if(outcome?.kind==='accepted') {
    await client.query(`INSERT INTO local_test_message(job_id,tenant_id,recipient_tenant_id,scope,message_id,sender,recipient,subject,body,headers,test_label,accepted_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,current.tenant_id,prepared.recipientTenant,current.scope,prepared.message.messageId,prepared.message.sender,prepared.message.recipient,prepared.message.subject,prepared.message.body,prepared.message.headers,prepared.message.testLabel,finished]);
    state='submitted';reason='smtp_accepted_local_test';
   } else if((outcome?.kind==='pre_data_transient' || outcome?.kind==='permanent') && outcome.proof==='no_data_submitted') {
    const delay=outcome.kind==='pre_data_transient'?retryDelay(current.attempt_count,current.first_attempt_at,finished):null;
    state=delay===null?'cancelled':'queued';reason=delay===null?'definite_failure':'proved_pre_data_retry';
    await client.query(`UPDATE send_job SET reserved_day=NULL,lease_owner=NULL,lease_until=NULL,due_at=$2 WHERE id=$1`,[id,new Date(finished.getTime()+(delay??0))]);
   }
   await client.query('UPDATE send_job SET state=$2,outcome=$3 WHERE id=$1',[id,state,reason]);
   return {state:state==='unknown'?'unknown_delivery':state,calls:1};
  });
 }
 async recoverAbandoned(now=this.now()) {
  return eligibilityTransaction(this.pool,async c=>(await c.query(`UPDATE send_job SET state='unknown',outcome='unknown_delivery'
   WHERE state='submitting' AND submitting_at<=$1::timestamptz-interval '120 seconds' RETURNING id`,[now])).rowCount);
 }
 async inspect(tenant:string,id:string) {
  const row=(await this.pool.query(`SELECT id,scope,state,outcome,attempt_count,message_id,reserved_day,claim_order,due_at FROM send_job WHERE tenant_id=$1 AND id=$2`,[tenant,id])).rows[0];
  if(!row) throw new HttpError(404,'not_found');
  return {...row,state:row.state==='unknown'?'unknown_delivery':row.state,boundary:'submitting commit is irreversible; submitted means accepted, not delivered'};
 }
 async messages(tenant:string) {
  return (await this.pool.query(`SELECT job_id,scope,message_id,sender,recipient,subject,body,headers,test_label,accepted_at FROM local_test_message WHERE tenant_id=$1 OR (scope='pool' AND recipient_tenant_id=$1) ORDER BY accepted_at,job_id LIMIT 100`,[tenant])).rows;
 }
}
