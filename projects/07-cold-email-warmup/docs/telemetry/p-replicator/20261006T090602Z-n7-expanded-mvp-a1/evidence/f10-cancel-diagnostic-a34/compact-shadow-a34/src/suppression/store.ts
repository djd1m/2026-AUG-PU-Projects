import { createHash,timingSafeEqual } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { withdrawPoolClient } from '../consent/store.js';
import { suppressClient,complaintClient } from '../dispatch/seams.js';
import { tokenHash } from '../dispatch/message.js';
import { recipientDigest } from '../campaigns/store.js';
import { singleAddress } from '../replies/input.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function authenticateOperator(value:unknown,digest:Buffer|null|undefined) {
 const supplied=typeof value==='string' && value.length<=256 && /^Bearer [A-Za-z0-9+/]+={0,2}$/.test(value)?value.slice(7):'';
 const hash=createHash('sha256').update(supplied).digest();
 if(!digest || !timingSafeEqual(hash,digest)) throw new HttpError(401,'unauthorized');
}
export function parseComplaint(raw:Record<string,unknown>,key:Buffer) {
 if(Object.keys(raw).some(k=>!['eventId','tenantId','mailboxId','recipientDigest','recipientAddress'].includes(k)) || typeof raw.eventId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.eventId) || typeof raw.tenantId!=='string' || !UUID.test(raw.tenantId) || typeof raw.mailboxId!=='string' || !UUID.test(raw.mailboxId)) throw new HttpError(400,'invalid_complaint');
 let digest=raw.recipientDigest;
 if(raw.recipientAddress!==undefined) {
  if(digest!==undefined || typeof raw.recipientAddress!=='string' || raw.recipientAddress.length>254 || /[\r\n\0]/.test(raw.recipientAddress) || !singleAddress(raw.recipientAddress)) throw new HttpError(400,'invalid_complaint');
  digest=recipientDigest(singleAddress(raw.recipientAddress)!,key);
 }
 if(typeof digest!=='string' || !/^[a-f0-9]{64}$/.test(digest)) throw new HttpError(400,'invalid_complaint');
 return {eventId:raw.eventId,tenant:raw.tenantId.toLowerCase(),mailbox:raw.mailboxId.toLowerCase(),digest};
}
export class SuppressionStore {
 constructor(readonly pool:Pool,readonly hashKey:Buffer,readonly clock=()=>new Date()) {}
 async charge(ip:string) {
  // Atomic durable security counter precedes token, operator and Origin checks.
  const r=await this.pool.query(`INSERT INTO public_stop_bucket(ip,window_start,attempts)
   VALUES($1,date_trunc('minute',clock_timestamp()),1) ON CONFLICT(ip,window_start)
   DO UPDATE SET attempts=public_stop_bucket.attempts+1 RETURNING attempts,
   GREATEST(1,ceil(extract(epoch FROM window_start+interval '1 minute'-clock_timestamp()))) AS retry`,[ip]);
  if(r.rows[0].attempts>30) throw new HttpError(429,'rate_limited',Number(r.rows[0].retry));
 }
 private async capability(client:Pool|PoolClient,token:string,now:Date) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token,'base64url').toString('base64url')!==token) throw new HttpError(400,'invalid_capability');
  const r=(await client.query(`SELECT t.*,j.scope,j.recipient_mailbox_id,m.tenant_id AS recipient_tenant
   FROM unsubscribe_token t JOIN send_job j ON j.id=t.job_id AND j.tenant_id=t.tenant_id AND j.mailbox_id=t.mailbox_id
    AND j.enrollment_id IS NOT DISTINCT FROM t.enrollment_id
   LEFT JOIN enrollment e ON e.id=t.enrollment_id AND e.tenant_id=t.tenant_id
   LEFT JOIN mailbox m ON m.id=j.recipient_mailbox_id
   WHERE t.token_hash=$1 AND t.expires_at>$2 AND
    ((j.scope='campaign' AND e.recipient_hash=t.recipient_hash) OR
     (j.scope='pool' AND j.enrollment_id IS NULL AND m.id IS NOT NULL AND m.tenant_id<>t.tenant_id))`,[tokenHash(token),now])).rows[0];
  if(!r) throw new HttpError(400,'invalid_capability');return r;
 }
 async confirm(token:string) {await this.capability(this.pool,token,this.clock());}
 async unsubscribe(token:string) {
  return eligibilityTransaction(this.pool,async c=>{
   const r=await this.capability(c,token,this.clock());
   await suppressClient(c,r.tenant_id,r.recipient_hash,'unsubscribe');
   if(r.scope==='pool') await withdrawPoolClient(c,r.recipient_tenant,r.recipient_mailbox_id);
   return {accepted:true};
  });
 }
 async complaint(raw:Record<string,unknown>) {
  const p=parseComplaint(raw,this.hashKey);
  return eligibilityTransaction(this.pool,async c=>{
   const old=(await c.query('SELECT tenant_id,mailbox_id,recipient_hash FROM complaint_event WHERE event_id=$1',[p.eventId])).rows[0];
   if(old) {
    if(old.tenant_id!==p.tenant || old.mailbox_id!==p.mailbox || old.recipient_hash!==p.digest) throw new HttpError(400,'invalid_complaint');
    return {accepted:true};
   }
   await complaintClient(c,p.tenant,p.mailbox,p.digest);
   await c.query('INSERT INTO complaint_event(event_id,tenant_id,mailbox_id,recipient_hash) VALUES($1,$2,$3,$4)',[p.eventId,p.tenant,p.mailbox,p.digest]);
   return {accepted:true};
  });
 }
}
