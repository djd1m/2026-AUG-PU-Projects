import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { freshMailbox,poolEligible } from './eligibility.js';
// Reused by claim and durable projection; quota/pacing are classified separately.
export const dispatchAuthority=`((j.scope='pool' AND ${poolEligible} AND EXISTS(SELECT 1 FROM mailbox m WHERE m.id=j.recipient_mailbox_id AND m.tenant_id<>j.tenant_id AND ${poolEligible}))
    OR (j.scope='campaign' AND EXISTS(SELECT 1 FROM campaign c JOIN enrollment e ON e.campaign_id=c.id
      JOIN consent s ON s.campaign_id=c.id AND s.mailbox_id=j.mailbox_id WHERE c.id=j.campaign_id AND c.tenant_id=j.tenant_id AND c.state='active'
      AND c.content_version=j.campaign_version AND e.id=j.enrollment_id AND e.state='active'
      AND s.scope='campaign' AND s.revoked_at IS NULL AND s.scope_version=c.content_version AND s.recipient_fingerprint=c.recipient_fingerprint
      AND NOT EXISTS(SELECT 1 FROM suppression x WHERE x.tenant_id=e.tenant_id AND x.recipient_hash=e.recipient_hash))))`;
// Caller already owns FIRST global eligibility lock; never opens another transaction.
export async function recoverLogicalClaims(client:import('pg').PoolClient,now:Date,mailbox?:string){
 await client.query(`UPDATE send_job SET state='queued',reserved_day=NULL,lease_owner=NULL,lease_until=NULL
  WHERE state='claimed' AND lease_until<=$1 AND ($2::uuid IS NULL OR mailbox_id=$2)`,[now,mailbox??null]);
 await client.query(`UPDATE send_job SET state='cancelled',outcome='retry_exhausted'
  WHERE state IN ('queued','claimed') AND first_attempt_at IS NOT NULL
  AND ($1::timestamptz>=first_attempt_at+interval '120 seconds' OR attempt_count>=3) AND ($2::uuid IS NULL OR mailbox_id=$2)`,[now,mailbox??null]);
 await client.query(`UPDATE send_job SET state='cancelled',outcome='expired_pool_day',reserved_day=NULL,lease_owner=NULL,lease_until=NULL
  WHERE scope='pool' AND kind='initial' AND state IN ('queued','claimed') AND right(pair_key,10)<>$1 AND ($2::uuid IS NULL OR mailbox_id=$2)`,[now.toISOString().slice(0,10),mailbox??null]);
}
export async function dispatchProjection(client:import('pg').PoolClient,mailbox:string,now:Date){
 await recoverLogicalClaims(client,now,mailbox);
 const day=now.toISOString().slice(0,10);
 const row=(await client.query(`SELECT j.id,j.due_at,j.outcome,
  (SELECT min(q.lease_until) FROM send_job q WHERE q.mailbox_id=m.id AND q.state='claimed' AND q.lease_until>$1) AS fresh_claim_until,(${freshMailbox} AND ${dispatchAuthority}) AS authorized,
  LEAST(m.daily_limit,m.provider_limit,30) AS cap,
  (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.reserved_day=$2::date AND q.state IN ('claimed','submitting','submitted','unknown'))::integer AS used,
  r.next_smtp_at,
  (EXISTS(SELECT 1 FROM transport_operation x WHERE x.protocol='smtp' AND x.operation IS NOT NULL AND x.mailbox_id=m.id) OR NOT EXISTS(SELECT 1 FROM transport_operation x WHERE x.protocol='smtp' AND x.operation IS NULL)) AS busy
  FROM send_job j JOIN mailbox m ON m.id=j.mailbox_id LEFT JOIN runtime_mailbox r ON r.mailbox_id=m.id
  WHERE j.mailbox_id=$3 AND j.state IN ('queued','claimed') AND (j.outcome IS NULL OR j.outcome='proved_pre_data_retry')
  AND j.attempt_count<3 AND (j.first_attempt_at IS NULL OR $1<j.first_attempt_at+interval '120 seconds')
  AND (j.scope<>'pool' OR j.kind<>'initial' OR right(j.pair_key,10)=$2::text)
  ORDER BY authorized DESC,j.due_at,j.id LIMIT 1`,[now,day,mailbox])).rows[0];
 if(!row)return {reason:'waiting_peer' as const,next:new Date(now.getTime()+1000),job:null,due:null};
 const base={job:row.id as string,due:row.due_at as Date};
 if(row.fresh_claim_until>now)return {...base,reason:'waiting_peer' as const,next:row.fresh_claim_until as Date};
 if(!row.authorized)return {...base,reason:'authority_denied' as const,next:new Date(now.getTime()+30000)};
 if(row.used>=row.cap)return {...base,reason:'waiting_budget' as const,next:new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1))};
 if(row.next_smtp_at>now)return {...base,reason:'waiting_pacing' as const,next:row.next_smtp_at as Date};
 if(row.busy)return {...base,reason:'transport_busy' as const,next:new Date(now.getTime()+1000)};
 return {...base,reason:row.outcome==='proved_pre_data_retry'&&row.due_at>now?'provider_backoff' as const:'ready' as const,next:row.due_at>now?row.due_at as Date:now};
}
export class DispatchStore {
 constructor(readonly pool:Pool) {}
 async claim(owner=randomUUID(),clock?:Date|(()=>Date),mailbox?:string,guard?:(client:import('pg').PoolClient)=>Promise<void>) {
  return eligibilityTransaction(this.pool,async client=>{
   await guard?.(client);
   const now=typeof clock==='function'?clock():clock??(await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
   await recoverLogicalClaims(client,now,mailbox);
   const day=now.toISOString().slice(0,10);
   const candidates=(await client.query(`SELECT j.id,j.mailbox_id FROM send_job j JOIN mailbox m ON m.id=j.mailbox_id
    WHERE ($3::uuid IS NULL OR j.mailbox_id=$3) AND NOT EXISTS(SELECT 1 FROM runtime_mailbox r WHERE r.mailbox_id=j.mailbox_id AND r.next_smtp_at>$1) AND j.state='queued' AND (j.outcome IS NULL OR j.outcome='proved_pre_data_retry') AND j.due_at<=$1 AND ${freshMailbox}
    AND ${dispatchAuthority}
    AND (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.reserved_day=$2::date AND q.state IN ('claimed','submitting','submitted','unknown'))<LEAST(m.daily_limit,m.provider_limit,30)
    ORDER BY (SELECT max(q.claim_order) FROM send_job q WHERE q.mailbox_id=m.id) NULLS FIRST,j.due_at,j.id
    FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[now,day,mailbox??null])).rows;
   const candidate=candidates[0];if(!candidate) return null;
   await client.query('SELECT id FROM mailbox WHERE id=$1 FOR UPDATE',[candidate.mailbox_id]);
   return (await client.query(`UPDATE send_job SET state='claimed',reserved_day=$2,lease_owner=$3,lease_until=$4::timestamptz+interval '45 seconds',claimed_at=$4,claim_order=nextval('send_job_claim_order_seq') WHERE id=$1 AND state='queued' RETURNING *`,[candidate.id,day,owner,now])).rows[0]??null;
  });
 }
}
