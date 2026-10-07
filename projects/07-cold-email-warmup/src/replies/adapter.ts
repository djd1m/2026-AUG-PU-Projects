import { createHash } from 'node:crypto';
import { openRecipient } from '../campaigns/store.js';
import type { Config } from '../config.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { decryptCredentials,type Envelope } from '../mailboxes/crypto.js';
import type { MailboxInput } from '../mailboxes/input.js';
import { authorizeTransport } from '../mailboxes/transport-authority.js';
import { acquireTransportSlot,acquireTransportSlotInTransaction,consumePreadmittedSlot,releaseUnusedTransportSlot,type TransportSlot } from '../mailboxes/transport-slots.js';
import { runTransportChild,type ChildRequest } from '../mailboxes/transport-lifetime.js';
import type { TransactionGuard } from './store.js';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import { decryptContent } from './crypto.js';
import {date,uid,validity,singleAddress,type HeaderInput} from './input.js';
export interface Snapshot {uidvalidity:string;uidNext:number;observedAt:Date;provenance:'local_fixture'|'imap_headers'}
export interface HeaderPage {uidvalidity:string;coveredThrough:number;headers:HeaderInput[];startedAt:Date;completedAt:Date}
export type ReadResult={kind:'page';page:HeaderPage;snapshot?:Snapshot}|{kind:'uidvalidity_changed';snapshot:Snapshot};
export function validateReadResult(value:unknown,expected:string,provenance:Snapshot['provenance']):ReadResult {
 if(!value||typeof value!=='object')throw new HttpError(400,'invalid_reply_evidence');
 const r=value as ReadResult;
 if(r.kind==='uidvalidity_changed'){
  const proof=r.snapshot;if(!proof||validity(proof.uidvalidity)===expected||proof.provenance!==provenance)throw new HttpError(400,'invalid_reply_evidence');
  uid(proof.uidNext);date(proof.observedAt);return r;
 }
 if(r.kind!=='page'||!r.page||validity(r.page.uidvalidity)!==expected||!Array.isArray(r.page.headers)||r.page.headers.length>100)throw new HttpError(400,'invalid_reply_evidence');
 uid(r.page.coveredThrough,true);const start=date(r.page.startedAt),end=date(r.page.completedAt);
 if(r.snapshot){const snapshot=r.snapshot,observed=date(snapshot.observedAt);if(validity(snapshot.uidvalidity)!==expected||snapshot.provenance!==provenance||uid(snapshot.uidNext)-1<r.page.coveredThrough||observed<start||observed>end||start>end||end.getTime()-start.getTime()>30000)throw new HttpError(400,'invalid_reply_evidence');}return r;
}
export interface ReplyAdapter {
 readonly mode:'local_test'|'live_provider'|'protocol_fixture';
 fence?(tenant:string,mailbox:string):Promise<TransactionGuard>;
 snapshot(tenant:string,mailbox:string,signal?:AbortSignal):Promise<Snapshot>;
 read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number,signal?:AbortSignal):Promise<ReadResult>;
}
export class FixtureAdapter implements ReplyAdapter {
 readonly mode='local_test' as const;
 constructor(readonly pool:Pool) {}
 async snapshot(tenant:string,mailbox:string,signal?:AbortSignal):Promise<Snapshot> {
  if(signal?.aborted)throw new HttpError(503,'transport_cancelled');
  const r=(await this.pool.query('SELECT uidvalidity,uid_next,failed FROM local_reply_fixture WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,mailbox])).rows[0];
  if(!r || r.failed) throw new HttpError(503,'fixture_unavailable');
  return {uidvalidity:r.uidvalidity,uidNext:Number(r.uid_next),observedAt:new Date(),provenance:'local_fixture'};
 }
 async read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number,signal?:AbortSignal):Promise<ReadResult> {
  if(signal?.aborted)throw new HttpError(503,'transport_cancelled');
  const startedAt=new Date();
  // One source snapshot attests sparse/expunged coverage. Fetch 101 to distinguish a
  // 100-header prefix from a complete range; never derive completion from count alone.
  const r=(await this.pool.query(`SELECT f.uidvalidity,f.uid_next,f.failed,
   (SELECT COALESCE(jsonb_agg(x.header ORDER BY (x.header->>'uid')::bigint),'[]'::jsonb)
    FROM (SELECT h AS header FROM jsonb_array_elements(f.headers) h
     WHERE (h->>'uid')::bigint>$3 AND (h->>'uid')::bigint<=$4 ORDER BY (h->>'uid')::bigint LIMIT 101) x) AS headers
   FROM local_reply_fixture f WHERE tenant_id=$1 AND mailbox_id=$2`,[tenant,mailbox,cursor,horizon])).rows[0];
  if(!r || r.failed) throw new HttpError(503,'fixture_unavailable');
  if(r.uidvalidity!==validity)return validateReadResult({kind:'uidvalidity_changed',snapshot:{uidvalidity:r.uidvalidity,uidNext:Number(r.uid_next),observedAt:new Date(),provenance:'local_fixture'}},validity,'local_fixture');
  if(Number(r.uid_next)-1<horizon)throw new HttpError(503,'fixture_unavailable');
  const rows=r.headers as HeaderInput[],headers=rows.slice(0,100);
  const coveredThrough=rows.length>100?headers[99]!.uid:horizon;
  return {kind:'page',page:{uidvalidity:validity,headers,coveredThrough,startedAt,completedAt:new Date()}};
 }
}
export async function boundedOperation<T>(operation:()=>Promise<T>,timeoutMs=30000):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {return await Promise.race([operation(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new HttpError(503,'poll_timeout')),timeoutMs);})]);}
 finally {if(timer) clearTimeout(timer);}
}

export class LiveReplyAdapter implements ReplyAdapter {
 readonly mode:'live_provider'|'protocol_fixture';
 constructor(readonly pool:Pool,readonly config:Config,readonly fixture?:ChildRequest['fixture'],readonly preadmitted?:TransportSlot){this.mode=fixture?'protocol_fixture':'live_provider';}
 async fence(tenant:string,mailbox:string):Promise<TransactionGuard>{const snapshot=await eligibilityTransaction(this.pool,c=>authorizeTransport(c,this.config,tenant,mailbox,'imap_headers'));return async c=>{const current=await authorizeTransport(c,this.config,tenant,mailbox,'imap_headers');if(current.revision!==snapshot.revision||current.mailboxRevision!==snapshot.mailboxRevision)throw new HttpError(409,'stale_poll_owner');};}
 private async operation<T>(tenant:string,mailbox:string,extra:{kind:'snapshot'|'read';validity?:string;cursor?:number;horizon?:number},signal?:AbortSignal):Promise<T>{
  if(this.config.pollMode!=='live_provider')throw new HttpError(503,'transport_denied');
  const snapshot=await eligibilityTransaction(this.pool,c=>authorizeTransport(c,this.config,tenant,mailbox,'imap_headers'));
  const input=decryptCredentials<MailboxInput>(snapshot.credentialEnvelope as Envelope,tenant,mailbox,this.config.credentialKeyring);
  const slot=this.preadmitted?consumePreadmittedSlot(this.preadmitted,tenant,mailbox):await acquireTransportSlot(this.pool,'imap',tenant,mailbox);
  return runTransportChild<T>(this.pool,slot,{...extra,input,allowlist:[...this.config.providerAllowlist],fixture:this.fixture},signal);
 }
 async captureBodyPhase(identity:BodyIdentity,signal?:AbortSignal,preadmitted?:TransportSlot):Promise<object>{
  identity=Object.freeze({...identity});
  if(this.config.pollMode!=='live_provider'||identity.source!=='imap_headers')throw new HttpError(503,'transport_denied');
  const stage=async()=>{
   const admission=await eligibilityTransaction(this.pool,async c=>{
    const current=await authorizeTransport(c,this.config,identity.tenant,identity.mailbox,'imap_body');await authorizeTransport(c,this.config,identity.tenant,identity.mailbox,'imap_headers');
    const valid=await c.query(`SELECT n.recipient_envelope,e.capture_phase,e.phase_metadata,e.phase_revision,e.phase_mailbox_revision,e.binding_version,e.expires_at,e.attempt_deadline,e.window_end,e.window_revision,e.window_mailbox_revision,e.authenticated_root_message_id,e.authenticated_recipient_hash,n.recipient_hash FROM incoming_ai_event e JOIN enrollment n ON n.tenant_id=e.tenant_id AND n.id=e.enrollment_id JOIN send_job j ON j.tenant_id=e.tenant_id AND j.mailbox_id=e.mailbox_id AND j.id=e.root_job_id AND j.enrollment_id=e.enrollment_id AND j.parent_id IS NULL JOIN reply_rescan r ON r.tenant_id=e.tenant_id AND r.mailbox_id=e.mailbox_id WHERE e.tenant_id=$1 AND e.id=$2 AND e.capture_state='claimed' AND e.owner_id=$3 AND e.generation=$4 AND e.lease_until>clock_timestamp() AND e.expires_at>clock_timestamp() AND e.window_end>clock_timestamp() AND e.authenticated_run_id=$5 AND e.authenticated_attempt=$6 AND e.source=$7 AND e.uidvalidity=$8 AND e.uid=$9 AND e.mailbox_id=$10 AND e.root_job_id=$11 AND e.enrollment_id=$12 AND e.sender_binding=$13 AND r.state='complete' AND r.run_id=e.authenticated_run_id AND r.attempt=e.authenticated_attempt AND r.uidvalidity=e.uidvalidity AND r.provenance=e.source AND j.message_id=e.authenticated_root_message_id AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=e.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM suppression s WHERE s.tenant_id=e.tenant_id AND s.recipient_hash=e.authenticated_recipient_hash) AND EXISTS(SELECT 1 FROM mailbox_poll p WHERE p.mailbox_id=e.mailbox_id AND p.scan_complete AND p.completed_at=e.window_completed_at)`,[identity.tenant,identity.event,identity.owner,identity.generation,identity.runId,identity.attempt,identity.source,identity.uidvalidity,identity.uid,identity.mailbox,identity.root,identity.enrollment,identity.senderBinding]);
    if(!valid.rowCount)throw new HttpError(409,'stale_body_claim');
    const sender=singleAddress(openRecipient(valid.rows[0].recipient_envelope as Envelope,identity.tenant,identity.enrollment,this.config.credentialKeyring));if(!sender||createHash('sha256').update(sender).digest('hex')!==identity.senderBinding)throw new HttpError(409,'stale_body_binding');
    const row=valid.rows[0];if(row.window_revision!==current.revision||row.window_mailbox_revision!==current.mailboxRevision||row.authenticated_recipient_hash!==row.recipient_hash)throw new HttpError(409,'stale_body_authority');
    const phase=row.capture_phase as 'metadata'|'text';
    if(phase==='text'&&(row.phase_revision!==current.revision||row.phase_mailbox_revision!==current.mailboxRevision))throw new HttpError(409,'stale_body_authority');
    const metadata=phase==='text'?Buffer.from(decryptContent(row.phase_metadata as Envelope,{tenant:identity.tenant,mailbox:identity.mailbox,event:identity.event,bindingVersion:row.binding_version},this.config.credentialKeyring)[0]!,'base64'):undefined;
    if(preadmitted&&(await c.query("SELECT 1 FROM mailbox_poll WHERE mailbox_id=$1 AND NOT scan_complete UNION ALL SELECT 1 FROM runtime_due WHERE mailbox_id=$1 AND kind='poll' AND (state='claimed' OR due_at<=clock_timestamp())",[identity.mailbox])).rowCount)throw new HttpError(503,'transport_busy');
    const slot=preadmitted?consumePreadmittedSlot(preadmitted,identity.tenant,identity.mailbox):await acquireTransportSlotInTransaction(c,'imap',identity.tenant,identity.mailbox,'body');return {current,slot,metadata,phase,deadline:Math.min(row.window_end.getTime(),row.expires_at.getTime(),row.attempt_deadline.getTime())};
   });
   try{const input=decryptCredentials<MailboxInput>(admission.current.credentialEnvelope as Envelope,identity.tenant,identity.mailbox,this.config.credentialKeyring);
    const bytes=await runTransportChild<Buffer>(this.pool,admission.slot,{kind:admission.phase==='text'?'body_text':'body_metadata',input,validity:identity.uidvalidity,uid:identity.uid,allowlist:[...this.config.providerAllowlist],fixture:this.fixture,deadline:admission.deadline},signal);return {bytes,current:admission.current,metadata:admission.metadata,phase:admission.phase};
   }catch(error){admission.metadata?.fill(0);throw error;}finally{await releaseUnusedTransportSlot(this.pool,admission.slot);}
  };
  const result=await stage();
  const proof={};bodyProofs.set(proof,{identity:{...identity},phase:result.phase,metadata:result.metadata??result.bytes,bytes:result.metadata?result.bytes:Buffer.alloc(0),revision:result.current.revision,mailboxRevision:result.current.mailboxRevision});return proof;
 }
 // Legacy two-stage inline capture is closed: each phase requires a distinct runtime quantum.
 async captureBody(_identity:BodyIdentity,_signal?:AbortSignal):Promise<object>{throw new HttpError(503,'transport_denied');}
 snapshot(tenant:string,mailbox:string,signal?:AbortSignal){return this.operation<Snapshot>(tenant,mailbox,{kind:'snapshot'},signal);}
 async read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number,signal?:AbortSignal){const result=validateReadResult(await this.operation<ReadResult>(tenant,mailbox,{kind:'read',validity,cursor,horizon},signal),validity,'imap_headers');if(result.kind==='page'&&result.snapshot)nativeHeaderProofs.set(result,createHash('sha256').update(JSON.stringify(result)).digest('hex'));return result;}
}

export interface BodyIdentity {tenant:string;mailbox:string;event:string;owner:string;generation:string;runId:string;attempt:number;source:string;uidvalidity:string;uid:number;root:string;enrollment:string;senderBinding:string}
export interface NativeBodyEvidence {phase?:'metadata'|'text';identity:BodyIdentity;metadata:Buffer;bytes:Buffer;revision:string;mailboxRevision:string}
const bodyProofs=new WeakMap<object,NativeBodyEvidence>();
export function consumeNativeBodyProof(proof:object):NativeBodyEvidence {
 const evidence=bodyProofs.get(proof);if(!evidence)throw new HttpError(403,'body_unproved');bodyProofs.delete(proof);return evidence;
}

// A composition proof is the exact settled child result, consumed once. Caller snapshots cannot substitute it.
const nativeHeaderProofs=new WeakMap<object,string>();
export function consumeNativeHeaderProof(result:Extract<ReadResult,{kind:'page'}>){
 const digest=nativeHeaderProofs.get(result);nativeHeaderProofs.delete(result);
 if(!digest||digest!==createHash('sha256').update(JSON.stringify(result)).digest('hex'))throw new HttpError(403,'header_unproved');
}
