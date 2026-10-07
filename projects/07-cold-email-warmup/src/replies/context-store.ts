import { randomUUID,createHash,createHmac } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import type { Envelope,Keyring } from '../mailboxes/crypto.js';
import { acquireTransportSlotInTransaction,releaseUnusedTransportSlot,type TransportSlot } from '../mailboxes/transport-slots.js';
import { consumeInterruptedBody } from '../mailboxes/transport-lifetime.js';
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
 await c.query(`INSERT INTO incoming_ai_event(id,semantic_event_id,tenant_id,mailbox_id,uidvalidity,uid,origin_run_id,origin_attempt,source,observed_at,enrollment_id,root_job_id,capture_state,reason,state,terminal_at,expires_at,sender_binding,authenticated_run_id,authenticated_attempt,authenticated_at,authenticated_root_message_id,authenticated_recipient_hash,queue_eligible_at,attempt_deadline)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CASE WHEN $16 THEN NULL ELSE now() END,CASE WHEN $16 THEN now()+interval '7 days' ELSE now()+interval '24 hours' END,$17,$7,$8,$10,(SELECT message_id FROM send_job WHERE id=$12 AND tenant_id=$3 AND mailbox_id=$4),(SELECT recipient_hash FROM enrollment WHERE id=$11 AND tenant_id=$3),CASE WHEN $16 AND $9='imap_headers' THEN statement_timestamp() END,CASE WHEN $16 AND $9='imap_headers' THEN statement_timestamp()+interval '450 seconds' END)
 ON CONFLICT(tenant_id,mailbox_id,uidvalidity,uid) DO UPDATE SET
 queue_eligible_at=COALESCE(incoming_ai_event.queue_eligible_at,EXCLUDED.queue_eligible_at),attempt_deadline=CASE WHEN incoming_ai_event.queue_eligible_at IS NULL AND EXCLUDED.queue_eligible_at IS NULL THEN NULL ELSE LEAST(incoming_ai_event.attempt_deadline,EXCLUDED.attempt_deadline,incoming_ai_event.expires_at) END,authenticated_run_id=EXCLUDED.authenticated_run_id,authenticated_attempt=EXCLUDED.authenticated_attempt,authenticated_at=EXCLUDED.authenticated_at,
 authenticated_root_message_id=EXCLUDED.authenticated_root_message_id,authenticated_recipient_hash=EXCLUDED.authenticated_recipient_hash,generation=incoming_ai_event.generation+1,
 capture_phase='metadata',phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL
 WHERE incoming_ai_event.capture_state='pending' AND incoming_ai_event.window_start IS NULL AND incoming_ai_event.enrollment_id=EXCLUDED.enrollment_id
 AND incoming_ai_event.root_job_id=EXCLUDED.root_job_id AND incoming_ai_event.sender_binding=EXCLUDED.sender_binding
 AND incoming_ai_event.source=EXCLUDED.source AND incoming_ai_event.expires_at>clock_timestamp()
 AND (incoming_ai_event.authenticated_run_id IS DISTINCT FROM EXCLUDED.authenticated_run_id OR incoming_ai_event.authenticated_attempt<>EXCLUDED.authenticated_attempt)`,[randomUUID(),randomUUID(),b.tenant,b.mailbox,b.uidvalidity,b.uid,b.runId,b.attempt,b.source,b.observedAt,b.enrollment,b.root,owned?'pending':'held',owned?'body_authority_required':'ambiguous_binding',owned?'pending':'held',owned,b.sender?createHash('sha256').update(b.sender).digest('hex'):null]);
}
export interface CaptureAdmission {row:{window_end:Date};identity:BodyIdentity;slot:TransportSlot}
export class ContextStore {
 constructor(readonly pool:Pool,readonly ring:Keyring){}
 // Direct logical claims cannot authorize body IO; runtime quantum claims event and slot together.
 async claim(_tenant:string,_event:string):Promise<BodyIdentity>{throw new HttpError(503,'transport_denied');}
 async commitNative(proof:object,config:Config){
  const evidence=consumeNativeBodyProof(proof),b=evidence.identity;
  try{return await eligibilityTransaction(this.pool,async c=>{
   if(config.pollMode!=='live_provider')throw new HttpError(503,'transport_denied');
   const authority=await authorizeTransport(c,config,b.tenant,b.mailbox,'imap_body');await authorizeTransport(c,config,b.tenant,b.mailbox,'imap_headers');
   if(authority.revision!==evidence.revision||authority.mailboxRevision!==evidence.mailboxRevision)throw new HttpError(409,'stale_body_authority');
   const r=(await c.query(`SELECT e.*,n.recipient_envelope,n.recipient_hash FROM incoming_ai_event e JOIN enrollment n ON n.id=e.enrollment_id AND n.tenant_id=e.tenant_id JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.id=e.root_job_id AND j.enrollment_id=e.enrollment_id AND j.parent_id IS NULL WHERE e.tenant_id=$1 AND e.mailbox_id=$2 AND e.id=$3 AND e.capture_state='claimed' AND e.window_end>clock_timestamp() AND e.attempt_deadline>clock_timestamp() AND e.owner_id=$4 AND e.generation=$5 AND e.lease_until>clock_timestamp() AND e.expires_at>clock_timestamp() AND e.authenticated_run_id=$6 AND e.authenticated_attempt=$7 AND e.source=$8 AND e.uidvalidity=$9 AND e.uid=$10 AND r.state='complete' AND r.run_id=e.authenticated_run_id AND r.attempt=e.authenticated_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source AND j.message_id=e.authenticated_root_message_id AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash) AND EXISTS(SELECT 1 FROM mailbox_poll p WHERE p.mailbox_id=e.mailbox_id AND p.scan_complete AND p.completed_at=e.window_completed_at) AND NOT EXISTS(SELECT 1 FROM runtime_due d WHERE d.mailbox_id=e.mailbox_id AND d.kind='poll' AND (d.state='claimed' OR d.due_at<=clock_timestamp())) FOR UPDATE OF e`,[b.tenant,b.mailbox,b.event,b.owner,b.generation,b.runId,b.attempt,b.source,b.uidvalidity,b.uid])).rows[0];
   if(!r||evidence.phase!==r.capture_phase||r.window_revision!==authority.revision||r.window_mailbox_revision!==authority.mailboxRevision||r.authenticated_recipient_hash!==r.recipient_hash||r.root_job_id!==b.root||r.enrollment_id!==b.enrollment||r.sender_binding!==b.senderBinding)throw new HttpError(409,'stale_body_claim');
   const sender=singleAddress(openRecipient(r.recipient_envelope as Envelope,b.tenant,r.enrollment_id,this.ring));if(!sender||createHash('sha256').update(sender).digest('hex')!==r.sender_binding)throw new HttpError(409,'stale_body_binding');
   const update=async(sql:string,args:unknown[])=>{if(!(await c.query(sql,args)).rowCount)throw new HttpError(409,'stale_body_claim');};
   if(evidence.phase==='metadata'){
    const supported=parsePlainBody(evidence.metadata,Buffer.alloc(0)),automatic=classifyCapturedInbound(evidence.metadata,'');
    if(supported.kind!=='hold'&&!(automatic.kind==='hold'&&automatic.reason==='automatic')){
     const envelope=encryptContent([evidence.metadata.toString('base64')],{tenant:b.tenant,mailbox:b.mailbox,event:b.event,bindingVersion:r.binding_version},this.ring);
     await update(`UPDATE incoming_ai_event SET capture_state='pending',capture_phase='text',phase_metadata=$2,phase_revision=$3,phase_mailbox_revision=$4,owner_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp() WHERE id=$1 AND window_end>clock_timestamp() AND expires_at>clock_timestamp()`,[b.event,envelope,evidence.revision,evidence.mailboxRevision]);
     return {kind:'yielded' as const};
    }
   }
   const parsed=parsePlainBody(evidence.metadata,evidence.bytes);
   if(parsed.kind==='hold'){await update(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state='held',state='held',reason=$2,owner_id=NULL,lease_until=NULL,terminal_at=COALESCE(terminal_at,now()),expires_at=LEAST(expires_at,now()+interval '24 hours'),rules_version=$3,rules_hash=$4 WHERE id=$1 AND window_end>clock_timestamp() AND expires_at>clock_timestamp()`,[b.event,parsed.reason,inboundRulesVersion,inboundRulesHash]);return {kind:'held' as const};}
   const material=JSON.stringify(['n7-semantic-v1',b.tenant,b.mailbox,r.root_job_id,r.enrollment_id,parsed.text]);
   const fingerprints=[...this.ring.keys].map(([version,key])=>({version,hash:createHmac('sha256',key).update(material).digest('hex')})),fingerprint=fingerprints.find(f=>f.version===this.ring.activeVersion)?.hash;if(!fingerprint)throw new HttpError(503,'context_unavailable');
   const prior=(await c.query(`SELECT semantic_event_id,expires_at,terminal_at FROM incoming_ai_event WHERE tenant_id=$1 AND mailbox_id=$2 AND root_job_id=$3 AND content_fingerprint=ANY($4::text[]) FOR UPDATE`,[b.tenant,b.mailbox,r.root_job_id,fingerprints.map(f=>f.hash)])).rows[0];
   if(prior){await update(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,semantic_event_id=$2,capture_state='held',state='held',reason='semantic_replay',owner_id=NULL,lease_until=NULL,terminal_at=LEAST(COALESCE(terminal_at,now()),COALESCE($4,now())),expires_at=LEAST(expires_at,$3,now()+interval '24 hours') WHERE id=$1 AND window_end>clock_timestamp() AND expires_at>clock_timestamp()`,[b.event,prior.semantic_event_id,prior.expires_at,prior.terminal_at]);return {kind:'replay' as const};}
   const suppressed=Boolean((await c.query('SELECT 1 FROM suppression WHERE tenant_id=$1 AND recipient_hash=$2',[b.tenant,r.recipient_hash])).rowCount);
   const classified=classifyCapturedInbound(evidence.metadata,parsed.text,{suppressed});
   // The same FIRST(7,1) transaction commits stop effects and the terminal decision.
   if(classified.kind==='hold'){
    if(classified.reason==='stop')await suppressClient(c,b.tenant,r.recipient_hash,'unsubscribe');
    if(classified.reason==='complaint')await complaintClient(c,b.tenant,b.mailbox,r.recipient_hash);
    await update(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state='held',state='held',reason=$2,owner_id=NULL,lease_until=NULL,rules_version=$3,rules_hash=$4,content_fingerprint=$5,terminal_at=COALESCE(terminal_at,now()),expires_at=LEAST(expires_at,now()+interval '24 hours') WHERE id=$1 AND window_end>clock_timestamp() AND expires_at>clock_timestamp()`,[b.event,classified.reason,inboundRulesVersion,inboundRulesHash,fingerprint]);return {kind:'held' as const};
   }
   const sizes=contentLengths([parsed.text]),envelope=encryptContent([parsed.text],{tenant:b.tenant,mailbox:b.mailbox,event:b.event,bindingVersion:r.binding_version},this.ring);
   await update(`UPDATE incoming_ai_event SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state='ready',reason='captured',owner_id=NULL,lease_until=NULL,content_envelope=$2,message_bytes=$3,body_bytes=$4,thread_message_count=1,captured_at=now(),content_fingerprint=$5,intent_candidate=$6,rules_version=$7,rules_hash=$8 WHERE id=$1 AND window_end>clock_timestamp() AND expires_at>clock_timestamp()`,[b.event,envelope,sizes,sizes[0],fingerprint,classified.intent,inboundRulesVersion,inboundRulesHash]);return {kind:'ready' as const};
  });}finally{evidence.metadata.fill(0);evidence.bytes.fill(0);}
 }
 // One protocol stage per durable claim; the next stage is selected by a later IMAP lane turn.
 async quantum(adapter:LiveReplyAdapter,config:Config,signal:AbortSignal,preadmitted?:CaptureAdmission):Promise<boolean>{
  if(signal.aborted)return false;
  const admission=preadmitted??await eligibilityTransaction(this.pool,async c=>{
   await expireCaptureWindowsClient(c);
   const row=(await c.query(`SELECT e.* FROM incoming_ai_event e JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id
    WHERE e.source='imap_headers' AND e.next_attempt_at<=clock_timestamp() AND e.expires_at>clock_timestamp() AND e.window_end>clock_timestamp() AND e.attempt_deadline>clock_timestamp()
    AND (e.capture_state='pending' OR (e.capture_state='claimed' AND e.lease_until<=clock_timestamp()))
    AND r.state='complete' AND r.run_id=e.authenticated_run_id AND r.attempt=e.authenticated_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source AND r.state='complete'
    AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM runtime_due d WHERE d.mailbox_id=e.mailbox_id AND d.kind='poll' AND (d.state='claimed' OR d.due_at<=clock_timestamp()))
    AND EXISTS(SELECT 1 FROM mailbox_poll p WHERE p.mailbox_id=e.mailbox_id AND p.scan_complete AND p.completed_at=e.window_completed_at)
    AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash)
    AND (NOT EXISTS(SELECT 1 FROM runtime_due urgent JOIN mailbox_poll hp ON hp.mailbox_id=urgent.mailbox_id WHERE urgent.kind='poll' AND urgent.state='ready' AND urgent.next_check_at<=clock_timestamp() AND hp.completed_at+interval '30 seconds'<=clock_timestamp()+interval '5 seconds')
     OR ((SELECT count(*) FROM transport_operation WHERE protocol='imap' AND header_reserved)=1
      AND EXISTS(SELECT 1 FROM transport_operation t JOIN runtime_due d ON d.tenant_id=t.tenant_id AND d.mailbox_id=t.mailbox_id AND d.kind='poll'
       WHERE t.protocol='imap' AND t.header_reserved AND t.operation IS NOT NULL AND t.operation_purpose='header' AND t.owner_process IS NOT NULL AND t.owner_host IS NOT NULL
       AND d.state='claimed' AND d.owner_id=t.operation AND d.lease_until>clock_timestamp() AND d.reason NOT IN ('cleanup_blocked','rescan_incomplete'))
      AND EXISTS(SELECT 1 FROM transport_operation WHERE protocol='imap' AND NOT header_reserved AND operation IS NULL)))
    AND NOT EXISTS(SELECT 1 FROM transport_operation t WHERE t.protocol='imap' AND t.mailbox_id=e.mailbox_id AND t.operation IS NOT NULL)
    ORDER BY e.window_end,e.capture_service_seq,e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1`)).rows[0];
   if(!row)return null;
   let authority;try{authority=await authorizeTransport(c,config,row.tenant_id,row.mailbox_id,'imap_body');await authorizeTransport(c,config,row.tenant_id,row.mailbox_id,'imap_headers');}catch(error){if(error instanceof HttpError&&error.code==='transport_denied')return null;throw error;}
   if(row.window_revision!==authority.revision||row.window_mailbox_revision!==authority.mailboxRevision)return null;
   const binding=(await c.query(`SELECT n.recipient_envelope,n.recipient_hash FROM enrollment n JOIN send_job j ON j.enrollment_id=n.id AND j.tenant_id=n.tenant_id WHERE n.tenant_id=$1 AND n.id=$2 AND j.id=$3 AND j.mailbox_id=$4 AND j.parent_id IS NULL AND j.message_id=$5`,[row.tenant_id,row.enrollment_id,row.root_job_id,row.mailbox_id,row.authenticated_root_message_id])).rows[0];
   if(!binding||binding.recipient_hash!==row.authenticated_recipient_hash)return null;
   const sender=singleAddress(openRecipient(binding.recipient_envelope as Envelope,row.tenant_id,row.enrollment_id,this.ring));
   if(!sender||createHash('sha256').update(sender).digest('hex')!==row.sender_binding)return null;
   if(row.capture_phase==='text'&&(row.phase_revision!==authority.revision||row.phase_mailbox_revision!==authority.mailboxRevision))return null;
   let slot;try{slot=await acquireTransportSlotInTransaction(c,'imap',row.tenant_id,row.mailbox_id,'body');}catch(error){if(error instanceof HttpError&&error.code==='transport_busy')return null;throw error;}
   const owner=randomUUID(),claimed=(await c.query(`UPDATE incoming_ai_event SET capture_state='claimed',owner_id=$2,generation=generation+1,lease_until=window_end WHERE id=$1 AND window_end>clock_timestamp() RETURNING generation`,[row.id,owner])).rows[0];
   if(!claimed)throw new HttpError(409,'stale_body_claim');
   const identity:BodyIdentity={tenant:row.tenant_id,mailbox:row.mailbox_id,event:row.id,owner,generation:claimed.generation,runId:row.authenticated_run_id,attempt:row.authenticated_attempt,source:row.source,uidvalidity:row.uidvalidity,uid:Number(row.uid),root:row.root_job_id,enrollment:row.enrollment_id,senderBinding:row.sender_binding};
   return {row,identity,slot};
  });
  if(!admission)return false;
  try{
   if(signal.aborted)throw new Error('transport_cancelled');
   const proof=await adapter.captureBodyPhase(admission.identity,signal,admission.slot);
   await this.commitNative(proof,config);return true;
  }catch(error){
   const interrupted=consumeInterruptedBody(error,admission.slot),b=admission.identity;
   await eligibilityTransaction(this.pool,async c=>{
    await expireCaptureWindowsClient(c);
    let resumable=false;
    if(signal.aborted&&interrupted&&interrupted.validity===b.uidvalidity&&interrupted.uid===b.uid&&config.pollMode==='live_provider'){
     let authority;try{authority=await authorizeTransport(c,config,b.tenant,b.mailbox,'imap_body');await authorizeTransport(c,config,b.tenant,b.mailbox,'imap_headers');}catch(error){if(!(error instanceof HttpError&&error.code==='transport_denied'))throw error;}
     if(authority){
      const row=(await c.query(`SELECT e.*,n.recipient_envelope,n.recipient_hash FROM incoming_ai_event e JOIN enrollment n ON n.tenant_id=e.tenant_id AND n.id=e.enrollment_id JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.enrollment_id=e.enrollment_id AND j.id=e.root_job_id AND j.parent_id IS NULL JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id WHERE e.tenant_id=$1 AND e.mailbox_id=$2 AND e.id=$3 AND e.owner_id=$4 AND e.generation=$5 AND e.capture_state='claimed' AND e.terminal_at IS NULL AND e.window_end>clock_timestamp() AND e.attempt_deadline>clock_timestamp() AND e.expires_at>clock_timestamp() AND e.authenticated_run_id=$6 AND e.authenticated_attempt=$7 AND e.source=$8 AND e.uidvalidity=$9 AND e.uid=$10 AND e.root_job_id=$11 AND e.enrollment_id=$12 AND e.sender_binding=$13 AND r.state='complete' AND r.run_id=e.authenticated_run_id AND r.attempt=e.authenticated_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source AND j.message_id=e.authenticated_root_message_id AND n.recipient_hash=e.authenticated_recipient_hash AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash) AND EXISTS(SELECT 1 FROM mailbox_poll p WHERE p.mailbox_id=e.mailbox_id AND p.scan_complete AND p.uidvalidity=e.uidvalidity AND p.cursor_uid>=e.uid AND p.completed_at=e.window_completed_at) AND NOT EXISTS(SELECT 1 FROM transport_operation t WHERE t.mailbox_id=e.mailbox_id AND t.operation IS NOT NULL) FOR UPDATE OF e`,[b.tenant,b.mailbox,b.event,b.owner,b.generation,b.runId,b.attempt,b.source,b.uidvalidity,b.uid,b.root,b.enrollment,b.senderBinding])).rows[0];
      if(row&&row.capture_phase===(interrupted.kind==='body_text'?'text':'metadata')&&row.window_revision===authority.revision&&row.window_mailbox_revision===authority.mailboxRevision){
       const sender=singleAddress(openRecipient(row.recipient_envelope as Envelope,b.tenant,b.enrollment,this.ring));
       resumable=Boolean(sender&&createHash('sha256').update(sender).digest('hex')===b.senderBinding);
       if(resumable&&row.capture_phase==='text'){
        resumable=row.phase_revision===authority.revision&&row.phase_mailbox_revision===authority.mailboxRevision;
        if(resumable)try{const metadata=decryptContent(row.phase_metadata as Envelope,{tenant:b.tenant,mailbox:b.mailbox,event:b.event,bindingVersion:row.binding_version},this.ring);resumable=metadata.length===1;}catch{resumable=false;}
       }
      }
     }
    }
    if(resumable)await c.query(`UPDATE incoming_ai_event SET capture_state='pending',owner_id=NULL,lease_until=NULL,next_attempt_at=clock_timestamp() WHERE id=$1 AND owner_id=$2 AND generation=$3 AND capture_state='claimed' AND terminal_at IS NULL AND window_end>clock_timestamp() AND attempt_deadline>clock_timestamp()`,[b.event,b.owner,b.generation]);
    else if(signal.aborted)await c.query(`UPDATE incoming_ai_event SET capture_state='held',state='held',reason='capture_cancelled',phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,owner_id=NULL,lease_until=NULL,terminal_at=LEAST(COALESCE(terminal_at,statement_timestamp()),statement_timestamp()),expires_at=LEAST(expires_at,statement_timestamp()+interval '24 hours') WHERE id=$1 AND owner_id=$2 AND generation=$3`,[admission.identity.event,admission.identity.owner,admission.identity.generation]);
    else await c.query(`UPDATE incoming_ai_event e SET capture_state='pending',owner_id=NULL,lease_until=NULL,next_attempt_at=LEAST(e.window_end,clock_timestamp()+interval '1 second') WHERE e.window_end>clock_timestamp() AND e.attempt_deadline>clock_timestamp() AND e.id=$1 AND e.owner_id=$2 AND e.generation=$3`,[admission.identity.event,admission.identity.owner,admission.identity.generation]);
   });
   if(error instanceof HttpError&&['transport_busy','transport_denied','stale_body_claim','stale_body_binding','stale_body_authority'].includes(error.code)||error instanceof Error&&['transport_cancelled','transport_timeout','transport_child_failed','cleanup_blocked','capture_window_expired'].includes(error.message))return true;
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
  return eligibilityTransaction(this.pool,async c=>{await c.query(`UPDATE incoming_ai_event SET terminal_at=LEAST(COALESCE(terminal_at,now()),now()),expires_at=LEAST(expires_at,now()+interval '24 hours'),phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,capture_state=CASE WHEN capture_state IN ('pending','claimed') THEN 'held' ELSE capture_state END,owner_id=NULL,lease_until=NULL WHERE tenant_id=$1 AND id=$2`,[tenant,event]);});
 }
 async purgeExpired(limit=100) {
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new HttpError(400,'invalid_purge_limit');
  return eligibilityTransaction(this.pool,async c=>{
   await expireCaptureWindowsClient(c);
   const lag=(await c.query(`SELECT count(*)::integer AS overdue,COALESCE(EXTRACT(EPOCH FROM now()-min(expires_at)),0)::float8 AS lag FROM incoming_ai_event WHERE (content_envelope IS NOT NULL OR phase_metadata IS NOT NULL) AND expires_at<=now()`)).rows[0];
   const cleared=await c.query(`WITH due AS (SELECT id FROM incoming_ai_event WHERE expires_at<=now() AND capture_state<>'purged' ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE incoming_ai_event e SET phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,content_envelope=NULL,message_bytes=NULL,body_bytes=NULL,thread_message_count=NULL,capture_state='purged',owner_id=NULL,lease_until=NULL FROM due WHERE e.id=due.id`,[limit]);
   const deleted=await c.query(`WITH due AS (SELECT id FROM incoming_ai_event WHERE metadata_expires_at<=now() ORDER BY metadata_expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) DELETE FROM incoming_ai_event e USING due WHERE e.id=due.id`,[limit]);
   return {contentPurged:cleared.rowCount??0,metadataPurged:deleted.rowCount??0,overdueBefore:lag.overdue,oldestLagSeconds:lag.lag};
  });
 }
}

// Called under FIRST(7,1); expiry never waits for physical cleanup and never renews a window.
export async function expireCaptureWindowsClient(c:PoolClient){
 await c.query(`UPDATE incoming_ai_event SET capture_state='held',state='held',reason='capture_window_expired',owner_id=NULL,lease_until=NULL,phase_metadata=NULL,phase_revision=NULL,phase_mailbox_revision=NULL,terminal_at=LEAST(COALESCE(terminal_at,LEAST(window_end,attempt_deadline)),LEAST(window_end,attempt_deadline)),expires_at=LEAST(expires_at,LEAST(window_end,attempt_deadline)+interval '24 hours') WHERE (window_end<=clock_timestamp() OR attempt_deadline<=clock_timestamp()) AND capture_state IN ('pending','claimed')`);
}
export async function openCaptureWindowClient(c:PoolClient,config:Config,tenant:string,mailbox:string,now:Date):Promise<CaptureAdmission|null>{
 await expireCaptureWindowsClient(c);
 if((await c.query("SELECT 1 FROM incoming_ai_event WHERE window_end>clock_timestamp() AND capture_state='pending' AND next_attempt_at<=clock_timestamp() LIMIT 1")).rowCount)return null;
 if(Number((await c.query("SELECT count(*) AS n FROM incoming_ai_event WHERE window_end>clock_timestamp() AND capture_state IN ('pending','claimed')")).rows[0].n)>=3)return null;
 let authority;try{authority=await authorizeTransport(c,config,tenant,mailbox,'imap_body');await authorizeTransport(c,config,tenant,mailbox,'imap_headers');}catch(error){if(error instanceof HttpError&&error.code==='transport_denied')return null;throw error;}
 const row=(await c.query(`SELECT e.*,p.completed_at,n.recipient_envelope,n.recipient_hash FROM incoming_ai_event e JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id JOIN mailbox_poll p ON p.mailbox_id=e.mailbox_id JOIN enrollment n ON n.tenant_id=e.tenant_id AND n.id=e.enrollment_id JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.id=e.root_job_id AND j.enrollment_id=e.enrollment_id AND j.parent_id IS NULL WHERE e.tenant_id=$1 AND e.mailbox_id=$2 AND e.capture_state='pending' AND e.window_start IS NULL AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash) AND e.expires_at>$3 AND e.attempt_deadline>$3 AND e.id IN (SELECT id FROM incoming_ai_event WHERE capture_state='pending' AND window_start IS NULL AND source='imap_headers' AND attempt_deadline>clock_timestamp() ORDER BY capture_service_seq,id LIMIT 3) AND e.source='imap_headers' AND r.state='complete' AND p.scan_complete AND p.uidvalidity=e.uidvalidity AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source AND e.authenticated_run_id=r.run_id AND e.authenticated_attempt=r.attempt AND e.authenticated_root_message_id=j.message_id AND e.authenticated_recipient_hash=n.recipient_hash AND p.completed_at+interval '30 seconds'>$3::timestamptz+interval '17 seconds' ORDER BY e.capture_service_seq,e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1`,[tenant,mailbox,now])).rows[0];
 if(!row)return null;
 const sender=singleAddress(openRecipient(row.recipient_envelope as Envelope,tenant,row.enrollment_id,config.credentialKeyring));if(!sender||createHash('sha256').update(sender).digest('hex')!==row.sender_binding)return null;
 const end=new Date(Math.min(now.getTime()+12000,row.attempt_deadline.getTime(),row.expires_at.getTime()));
 // A full fixed window must fit the inherited deadline; do not shorten or renew it.
 if(end.getTime()!==now.getTime()+12000)return null;
 let slot;try{slot=await acquireTransportSlotInTransaction(c,'imap',tenant,mailbox,'body');}catch(error){if(error instanceof HttpError&&error.code==='transport_busy')return null;throw error;}
 const owner=randomUUID(),claimed=(await c.query(`UPDATE incoming_ai_event SET capture_state='claimed',owner_id=$7,generation=generation+1,lease_until=$3,window_start=$2,window_end=$3,window_completed_at=$4,window_revision=$5,window_mailbox_revision=$6,next_attempt_at=$2 WHERE id=$1 AND window_start IS NULL RETURNING generation`,[row.id,now,end,row.completed_at,authority.revision,authority.mailboxRevision,owner])).rows[0];
 if(!claimed)throw new HttpError(409,'stale_body_claim');
 const identity:BodyIdentity={tenant,mailbox,event:row.id,owner,generation:claimed.generation,runId:row.authenticated_run_id,attempt:row.authenticated_attempt,source:row.source,uidvalidity:row.uidvalidity,uid:Number(row.uid),root:row.root_job_id,enrollment:row.enrollment_id,senderBinding:row.sender_binding};
 return {row:{...row,window_end:end},identity,slot};
}

// Same FIRST(7,1), read-only scheduling preference: never admit or manufacture proof.
export async function captureHeaderFrontierClient(c:PoolClient,config:Config):Promise<{tenant:string;mailbox:string}[]> {
 if(config.pollMode!=='live_provider')return [];
 if((await c.query("SELECT 1 FROM incoming_ai_event WHERE window_end>clock_timestamp() AND capture_state='pending' AND next_attempt_at<=clock_timestamp() LIMIT 1")).rowCount)return [];
 const capacity=(await c.query(`SELECT
  (SELECT count(*) FROM incoming_ai_event WHERE window_end>clock_timestamp() AND capture_state IN ('pending','claimed')) AS windows,
  count(*) FILTER (WHERE header_reserved) AS reserved,
  count(*) FILTER (WHERE operation IS NOT NULL AND (operation_purpose='body' OR operation_purpose IS NULL)) AS bodies,
  count(*) FILTER (WHERE NOT header_reserved AND operation IS NULL) AS free
  FROM transport_operation WHERE protocol='imap'`)).rows[0];
 if(Number(capacity.windows)>=3||Number(capacity.reserved)!==1||Number(capacity.bodies)>=3||Number(capacity.free)===0)return [];
 return authorizedCaptureHeadersClient(c,config,false);
}

// HEADER urgency is read-only and independent of first BODY-window capacity.
export async function captureHeaderContextClient(c:PoolClient,config:Config):Promise<boolean>{
 if(config.pollMode!=='live_provider')return false;
 return (await authorizedCaptureHeadersClient(c,config,true)).length>0;
}
async function authorizedCaptureHeadersClient(c:PoolClient,config:Config,admitted:boolean):Promise<{tenant:string;mailbox:string}[]> {
 // Bound identities before validating them; never promote an unwindowed fourth.
 const rows=(await c.query(`SELECT e.*,n.recipient_envelope,n.recipient_hash FROM
  ((SELECT * FROM incoming_ai_event WHERE capture_state='pending' AND window_start IS NULL AND source='imap_headers' AND attempt_deadline>clock_timestamp() ORDER BY capture_service_seq,id LIMIT 3)
   UNION ALL (SELECT * FROM incoming_ai_event WHERE $1 AND window_start IS NOT NULL AND window_end>clock_timestamp() AND capture_state IN ('pending','claimed') AND source='imap_headers' AND attempt_deadline>clock_timestamp() ORDER BY capture_service_seq,id LIMIT 3)) e
  JOIN enrollment n ON n.tenant_id=e.tenant_id AND n.id=e.enrollment_id
  JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.id=e.root_job_id AND j.enrollment_id=e.enrollment_id AND j.parent_id IS NULL
  WHERE e.expires_at>clock_timestamp() AND e.authenticated_root_message_id=j.message_id AND e.authenticated_recipient_hash=n.recipient_hash
  AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash)
  ORDER BY e.capture_service_seq,e.id`,[admitted])).rows;
 const eligible:{tenant:string;mailbox:string}[]=[];
 for(const row of rows){
  try{await authorizeTransport(c,config,row.tenant_id,row.mailbox_id,'imap_body');await authorizeTransport(c,config,row.tenant_id,row.mailbox_id,'imap_headers');}
  catch(error){if(error instanceof HttpError&&error.code==='transport_denied')continue;throw error;}
  let recipient:unknown;try{recipient=openRecipient(row.recipient_envelope as Envelope,row.tenant_id,row.enrollment_id,config.credentialKeyring);}
  catch(error){if(error instanceof HttpError&&error.code==='credential_unavailable')continue;throw error;}
  const sender=typeof recipient==='string'?singleAddress(recipient):null;
  if(sender&&createHash('sha256').update(sender).digest('hex')===row.sender_binding)eligible.push({tenant:row.tenant_id,mailbox:row.mailbox_id});
 }
 return eligible;
}
