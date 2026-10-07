import { randomUUID,createHash,createHmac } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Envelope,Keyring } from '../mailboxes/crypto.js';
import { acquireTransportSlotInTransaction,releaseUnusedTransportSlot } from '../mailboxes/transport-slots.js';
import { authorizeTransport } from '../mailboxes/transport-authority.js';
import type { Config } from '../config.js';
import { consumeNativeBodyProof,LiveReplyAdapter,type BodyIdentity } from './adapter.js';
import { parsePlainBody,classifyCapturedInbound,inboundRulesHash,inboundRulesVersion } from './body.js';
import { suppressClient,complaintClient } from '../dispatch/seams.js';
import { openRecipient } from '../campaigns/store.js';
import { singleAddress } from './input.js';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { contentLengths,decryptContent,encryptContent } from './crypto.js';
export interface IntentBinding {tenant:string;mailbox:string;uidvalidity:string;uid:number;runId:string;attempt:number;source:string;observedAt:Date;enrollment:string|null;root:string|null;sender:string|null}
// Caller already holds FIRST(7,1) and has committed semantic stops before this insert.
export async function enqueueCaptureClient(c:PoolClient,b:IntentBinding) {
 const owned=b.enrollment!==null&&b.root!==null;
 await c.query(`INSERT INTO incoming_ai_event(id,semantic_event_id,tenant_id,mailbox_id,uidvalidity,uid,origin_run_id,origin_attempt,source,observed_at,enrollment_id,root_job_id,capture_state,reason,state,terminal_at,expires_at,sender_binding)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $16 THEN NULL ELSE now() END,CASE WHEN $16 THEN now()+interval '7 days' ELSE now()+interval '24 hours' END,$17)
 ON CONFLICT(tenant_id,mailbox_id,uidvalidity,uid) DO UPDATE SET
 origin_run_id=EXCLUDED.origin_run_id,origin_attempt=EXCLUDED.origin_attempt,source=EXCLUDED.source,
 observed_at=EXCLUDED.observed_at,generation=incoming_ai_event.generation+1,
 capture_phase='metadata',phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL
 WHERE incoming_ai_event.capture_state='pending' AND incoming_ai_event.enrollment_id=EXCLUDED.enrollment_id
 AND incoming_ai_event.root_job_id=EXCLUDED.root_job_id AND incoming_ai_event.sender_binding=EXCLUDED.sender_binding
 AND incoming_ai_event.source=EXCLUDED.source AND incoming_ai_event.expires_at>clock_timestamp()
 AND (incoming_ai_event.origin_run_id IS DISTINCT FROM EXCLUDED.origin_run_id OR incoming_ai_event.origin_attempt<>EXCLUDED.origin_attempt)`,[randomUUID(),randomUUID(),b.tenant,b.mailbox,b.uidvalidity,b.uid,b.runId,b.attempt,b.source,b.observedAt,b.enrollment,b.root,owned?'pending':'held',owned?'body_authority_required':'ambiguous_binding',owned?'pending':'held',owned,b.sender?createHash('sha256').update(b.sender).digest('hex'):null]);
}
export class ContextStore {
 constructor(readonly pool:Pool,readonly ring:Keyring){}
 async claim(tenant:string,event:string):Promise<BodyIdentity>{
  return eligibilityTransaction(this.pool,async c=>{
   const owner=randomUUID();const r=(await c.query(`UPDATE incoming_ai_event e SET capture_state='claimed',owner_id=$3,generation=generation+1,lease_until=clock_timestamp()+interval '30 seconds' FROM reply_rescan r WHERE e.tenant_id=$1 AND e.id=$2 AND (e.capture_state='pending' OR (e.capture_state='claimed' AND e.lease_until<=clock_timestamp())) AND e.enrollment_id IS NOT NULL AND e.root_job_id IS NOT NULL AND e.expires_at>clock_timestamp() AND r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id AND r.run_id=e.origin_run_id AND r.attempt=e.origin_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source RETURNING e.*`,[tenant,event,owner])).rows[0];
   if(!r)throw new HttpError(409,'stale_body_claim');return {tenant,mailbox:r.mailbox_id,event,owner,generation:r.generation,runId:r.origin_run_id,attempt:r.origin_attempt,source:r.source,uidvalidity:r.uidvalidity,uid:Number(r.uid),root:r.root_job_id,enrollment:r.enrollment_id,senderBinding:r.sender_binding};
  });
 }
 async commitNative(proof:object,config:Config){
  const evidence=consumeNativeBodyProof(proof),b=evidence.identity;
  try{return await eligibilityTransaction(this.pool,async c=>{
   const authority=await authorizeTransport(c,config,b.tenant,b.mailbox,'imap_body');
   if(authority.revision!==evidence.revision||authority.mailboxRevision!==evidence.mailboxRevision)throw new HttpError(409,'stale_body_authority');
   const r=(await c.query(`SELECT e.*,n.recipient_envelope,n.recipient_hash FROM incoming_ai_event e JOIN enrollment n ON n.id=e.enrollment_id AND n.tenant_id=e.tenant_id JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.id=e.root_job_id AND j.enrollment_id=e.enrollment_id AND j.parent_id IS NULL WHERE e.tenant_id=$1 AND e.mailbox_id=$2 AND e.id=$3 AND e.capture_state='claimed' AND e.owner_id=$4 AND e.generation=$5 AND e.lease_until>clock_timestamp() AND e.expires_at>clock_timestamp() AND e.origin_run_id=$6 AND e.origin_attempt=$7 AND e.source=$8 AND e.uidvalidity=$9 AND e.uid=$10 AND r.run_id=e.origin_run_id AND r.attempt=e.origin_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source FOR UPDATE OF e`,[b.tenant,b.mailbox,b.event,b.owner,b.generation,b.runId,b.attempt,b.source,b.uidvalidity,b.uid])).rows[0];
   if(!r||r.root_job_id!==b.root||r.enrollment_id!==b.enrollment||r.sender_binding!==b.senderBinding)throw new HttpError(409,'stale_body_claim');
   const sender=singleAddress(openRecipient(r.recipient_envelope as Envelope,b.tenant,r.enrollment_id,this.ring));if(!sender||createHash('sha256').update(sender).digest('hex')!==r.sender_binding)throw new HttpError(409,'stale_body_binding');
   if(evidence.phase==='metadata'){
    const supported=parsePlainBody(evidence.metadata,Buffer.alloc(0)),automatic=classifyCapturedInbound(evidence.metadata,'');
    if(supported.kind!=='hold'&&!(automatic.kind==='hold'&&automatic.reason==='automatic')){
     const envelope=encryptContent([evidence.metadata.toString('base64')],{tenant:b.tenant,mailbox:b.mailbox,event:b.event,bindingVersion:r.binding_version},this.ring);
     await c.query(`UPDATE incoming_ai_event SET capture_state='pending',capture_phase='text',phase_metadata=$2,phase_revision=$3,phase_mailbox_revision=$4,owner_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp() WHERE id=$1`,[b.event,envelope,evidence.revision,evidence.mailboxRevision]);
     return {kind:'yielded' as const};
    }
   }
   const parsed=parsePlainBody(evidence.metadata,evidence.bytes);
   if(parsed.kind==='hold'){await c.query(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state='held',state='held',reason=$2,owner_id=NULL,lease_until=NULL,terminal_at=COALESCE(terminal_at,now()),expires_at=LEAST(expires_at,now()+interval '24 hours'),rules_version=$3,rules_hash=$4 WHERE id=$1`,[b.event,parsed.reason,inboundRulesVersion,inboundRulesHash]);return {kind:'held' as const};}
   const material=JSON.stringify(['n7-semantic-v1',b.tenant,b.mailbox,r.root_job_id,r.enrollment_id,parsed.text]);
   const fingerprints=[...this.ring.keys].map(([version,key])=>({version,hash:createHmac('sha256',key).update(material).digest('hex')})),fingerprint=fingerprints.find(f=>f.version===this.ring.activeVersion)?.hash;if(!fingerprint)throw new HttpError(503,'context_unavailable');
   const prior=(await c.query(`SELECT semantic_event_id,expires_at,terminal_at FROM incoming_ai_event WHERE tenant_id=$1 AND mailbox_id=$2 AND root_job_id=$3 AND content_fingerprint=ANY($4::text[]) FOR UPDATE`,[b.tenant,b.mailbox,r.root_job_id,fingerprints.map(f=>f.hash)])).rows[0];
   if(prior){await c.query(`UPDATE incoming_ai_event SET semantic_event_id=$2,capture_state='held',state='held',reason='semantic_replay',owner_id=NULL,lease_until=NULL,terminal_at=LEAST(COALESCE(terminal_at,now()),COALESCE($4,now())),expires_at=LEAST(expires_at,$3,now()+interval '24 hours') WHERE id=$1`,[b.event,prior.semantic_event_id,prior.expires_at,prior.terminal_at]);return {kind:'replay' as const};}
   const suppressed=Boolean((await c.query('SELECT 1 FROM suppression WHERE tenant_id=$1 AND recipient_hash=$2',[b.tenant,r.recipient_hash])).rowCount);
   const classified=classifyCapturedInbound(evidence.metadata,parsed.text,{suppressed});
   // The same FIRST(7,1) transaction commits stop effects and the terminal decision.
   if(classified.kind==='hold'){
    if(classified.reason==='stop')await suppressClient(c,b.tenant,r.recipient_hash,'unsubscribe');
    if(classified.reason==='complaint')await complaintClient(c,b.tenant,b.mailbox,r.recipient_hash);
    await c.query(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state='held',state='held',reason=$2,owner_id=NULL,lease_until=NULL,rules_version=$3,rules_hash=$4,content_fingerprint=$5,terminal_at=COALESCE(terminal_at,now()),expires_at=LEAST(expires_at,now()+interval '24 hours') WHERE id=$1`,[b.event,classified.reason,inboundRulesVersion,inboundRulesHash,fingerprint]);return {kind:'held' as const};
   }
   const sizes=contentLengths([parsed.text]),envelope=encryptContent([parsed.text],{tenant:b.tenant,mailbox:b.mailbox,event:b.event,bindingVersion:r.binding_version},this.ring);
   await c.query(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state='ready',reason='captured',owner_id=NULL,lease_until=NULL,content_envelope=$2,message_bytes=$3,body_bytes=$4,thread_message_count=1,captured_at=now(),content_fingerprint=$5,intent_candidate=$6,rules_version=$7,rules_hash=$8 WHERE id=$1`,[b.event,envelope,sizes,sizes[0],fingerprint,classified.intent,inboundRulesVersion,inboundRulesHash]);return {kind:'ready' as const};
  });}finally{evidence.metadata.fill(0);evidence.bytes.fill(0);}
 }
 // One protocol stage per durable claim; the next stage is selected by a later IMAP lane turn.
 async quantum(adapter:LiveReplyAdapter,config:Config,signal:AbortSignal):Promise<boolean>{
  if(signal.aborted)return false;
  const admission=await eligibilityTransaction(this.pool,async c=>{
   const row=(await c.query(`SELECT e.* FROM incoming_ai_event e JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id
    WHERE e.source='imap_headers' AND e.next_attempt_at<=clock_timestamp() AND e.expires_at>clock_timestamp()
    AND (e.capture_state='pending' OR (e.capture_state='claimed' AND e.lease_until<=clock_timestamp()))
    AND r.run_id=e.origin_run_id AND r.attempt=e.origin_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source
    AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM runtime_due d WHERE d.mailbox_id=e.mailbox_id AND d.kind='poll' AND (d.state='claimed' OR d.due_at<=clock_timestamp()))
    AND NOT EXISTS(SELECT 1 FROM mailbox_poll p WHERE p.mailbox_id=e.mailbox_id AND NOT p.scan_complete)
    AND NOT EXISTS(SELECT 1 FROM transport_operation t WHERE t.protocol='imap' AND t.mailbox_id=e.mailbox_id AND t.operation IS NOT NULL)
    ORDER BY e.next_attempt_at,e.created_at,e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1`)).rows[0];
   if(!row)return null;
   let authority;try{authority=await authorizeTransport(c,config,row.tenant_id,row.mailbox_id,'imap_body');}catch(error){if(error instanceof HttpError&&error.code==='transport_denied')return null;throw error;}
   if(row.capture_phase==='text'&&(row.phase_revision!==authority.revision||row.phase_mailbox_revision!==authority.mailboxRevision))return null;
   let slot;try{slot=await acquireTransportSlotInTransaction(c,'imap',row.tenant_id,row.mailbox_id,'body');}catch(error){if(error instanceof HttpError&&error.code==='transport_busy')return null;throw error;}
   const owner=randomUUID(),claimed=(await c.query(`UPDATE incoming_ai_event SET capture_state='claimed',owner_id=$2,generation=generation+1,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 RETURNING generation`,[row.id,owner])).rows[0];
   const identity:BodyIdentity={tenant:row.tenant_id,mailbox:row.mailbox_id,event:row.id,owner,generation:claimed.generation,runId:row.origin_run_id,attempt:row.origin_attempt,source:row.source,uidvalidity:row.uidvalidity,uid:Number(row.uid),root:row.root_job_id,enrollment:row.enrollment_id,senderBinding:row.sender_binding};
   return {row,identity,slot};
  });
  if(!admission)return false;
  try{
   if(signal.aborted)throw new Error('transport_cancelled');
   const proof=await adapter.captureBodyPhase(admission.identity,signal,admission.slot);
   await this.commitNative(proof,config);return true;
  }catch(error){
   await eligibilityTransaction(this.pool,c=>c.query(`UPDATE incoming_ai_event e SET capture_state='pending',owner_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp()+interval '1 second' WHERE e.id=$1 AND e.owner_id=$2 AND e.generation=$3`,[admission.identity.event,admission.identity.owner,admission.identity.generation]));
   if(error instanceof HttpError&&['transport_busy','transport_denied','stale_body_claim','stale_body_binding','stale_body_authority'].includes(error.code)||error instanceof Error&&['transport_cancelled','transport_timeout','transport_child_failed','cleanup_blocked'].includes(error.message))return true;
   throw error;
  }finally{await releaseUnusedTransportSlot(this.pool,admission.slot);}
 }
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
   const lag=(await c.query(`SELECT count(*)::integer AS overdue,COALESCE(EXTRACT(EPOCH FROM now()-min(expires_at)),0)::float8 AS lag FROM incoming_ai_event WHERE (content_envelope IS NOT NULL OR phase_metadata IS NOT NULL) AND expires_at<=now()`)).rows[0];
   const cleared=await c.query(`WITH due AS (SELECT id FROM incoming_ai_event WHERE expires_at<=now() AND capture_state<>'purged' ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE incoming_ai_event e SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,content_envelope=NULL,message_bytes=NULL,body_bytes=NULL,thread_message_count=NULL,capture_state='purged',owner_id=NULL,lease_until=NULL FROM due WHERE e.id=due.id`,[limit]);
   const deleted=await c.query(`WITH due AS (SELECT id FROM incoming_ai_event WHERE metadata_expires_at<=now() ORDER BY metadata_expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM incoming_ai_event e USING due WHERE e.id=due.id`,[limit]);
   return {contentPurged:cleared.rowCount??0,metadataPurged:deleted.rowCount??0,overdueBefore:lag.overdue,oldestLagSeconds:lag.lag};
  });
 }
}
