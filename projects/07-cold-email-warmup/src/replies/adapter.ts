import type { Config } from '../config.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { decryptCredentials,type Envelope } from '../mailboxes/crypto.js';
import type { MailboxInput } from '../mailboxes/input.js';
import { authorizeTransport } from '../mailboxes/transport-authority.js';
import { acquireTransportSlot,consumePreadmittedSlot,type TransportSlot } from '../mailboxes/transport-slots.js';
import { runTransportChild,type ChildRequest } from '../mailboxes/transport-lifetime.js';
import type { TransactionGuard } from './store.js';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import {date,uid,validity,type HeaderInput} from './input.js';
export interface Snapshot {uidvalidity:string;uidNext:number;observedAt:Date;provenance:'local_fixture'|'imap_headers'}
export interface HeaderPage {uidvalidity:string;coveredThrough:number;headers:HeaderInput[];startedAt:Date;completedAt:Date}
export type ReadResult={kind:'page';page:HeaderPage}|{kind:'uidvalidity_changed';snapshot:Snapshot};
export function validateReadResult(value:unknown,expected:string,provenance:Snapshot['provenance']):ReadResult {
 if(!value||typeof value!=='object')throw new HttpError(400,'invalid_reply_evidence');
 const r=value as ReadResult;
 if(r.kind==='uidvalidity_changed'){
  const proof=r.snapshot;if(!proof||validity(proof.uidvalidity)===expected||proof.provenance!==provenance)throw new HttpError(400,'invalid_reply_evidence');
  uid(proof.uidNext);date(proof.observedAt);return r;
 }
 if(r.kind!=='page'||!r.page||validity(r.page.uidvalidity)!==expected||!Array.isArray(r.page.headers)||r.page.headers.length>100)throw new HttpError(400,'invalid_reply_evidence');
 uid(r.page.coveredThrough,true);date(r.page.startedAt);date(r.page.completedAt);return r;
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
 snapshot(tenant:string,mailbox:string,signal?:AbortSignal){return this.operation<Snapshot>(tenant,mailbox,{kind:'snapshot'},signal);}
 async read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number,signal?:AbortSignal){return validateReadResult(await this.operation<ReadResult>(tenant,mailbox,{kind:'read',validity,cursor,horizon},signal),validity,'imap_headers');}
}
