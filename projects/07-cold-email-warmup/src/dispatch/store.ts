import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { freshMailbox,poolEligible } from './eligibility.js';
export class DispatchStore {
 constructor(readonly pool:Pool) {}
 async claim(owner=randomUUID(),now=new Date()) {
  return eligibilityTransaction(this.pool,async client=>{
   await client.query(`UPDATE send_job SET state='queued',reserved_day=NULL,lease_owner=NULL,lease_until=NULL WHERE state='claimed' AND lease_until<=$1`,[now]);
   const day=now.toISOString().slice(0,10);
   const candidates=(await client.query(`SELECT j.id,j.mailbox_id FROM send_job j JOIN mailbox m ON m.id=j.mailbox_id
    WHERE j.state='queued' AND j.due_at<=$1 AND ${freshMailbox}
    AND ((j.scope='pool' AND ${poolEligible} AND EXISTS(SELECT 1 FROM mailbox m WHERE m.id=j.recipient_mailbox_id AND m.tenant_id<>j.tenant_id AND ${poolEligible}))
    OR (j.scope='campaign' AND EXISTS(SELECT 1 FROM campaign c JOIN enrollment e ON e.campaign_id=c.id
      JOIN consent s ON s.campaign_id=c.id AND s.mailbox_id=j.mailbox_id WHERE c.id=j.campaign_id AND c.tenant_id=j.tenant_id AND c.state='active'
      AND c.content_version=j.campaign_version AND e.id=j.enrollment_id AND e.state='active'
      AND s.scope='campaign' AND s.revoked_at IS NULL AND s.scope_version=c.content_version AND s.recipient_fingerprint=c.recipient_fingerprint
      AND NOT EXISTS(SELECT 1 FROM suppression x WHERE x.tenant_id=e.tenant_id AND x.recipient_hash=e.recipient_hash))))
    AND (SELECT count(*) FROM send_job q WHERE q.mailbox_id=m.id AND q.reserved_day=$2::date AND q.state IN ('claimed','submitting','submitted','unknown'))<LEAST(m.daily_limit,m.provider_limit,30)
    ORDER BY (SELECT max(q.claimed_at) FROM send_job q WHERE q.mailbox_id=m.id) NULLS FIRST,j.due_at,j.id
    FOR UPDATE OF j SKIP LOCKED LIMIT 1`,[now,day])).rows;
   const candidate=candidates[0];if(!candidate) return null;
   await client.query('SELECT id FROM mailbox WHERE id=$1 FOR UPDATE',[candidate.mailbox_id]);
   return (await client.query(`UPDATE send_job SET state='claimed',reserved_day=$2,lease_owner=$3,lease_until=$4::timestamptz+interval '45 seconds',claimed_at=$4 WHERE id=$1 AND state='queued' RETURNING *`,[candidate.id,day,owner,now])).rows[0]??null;
  });
 }
}
