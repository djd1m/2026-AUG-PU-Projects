import type { Config } from '../config.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { decryptCredentials,type Envelope } from '../mailboxes/crypto.js';
import type { MailboxInput } from '../mailboxes/input.js';
import { authorizeTransport } from '../mailboxes/transport-authority.js';
import { acquireTransportSlot } from '../mailboxes/transport-slots.js';
import { runTransportChild,type ChildRequest } from '../mailboxes/transport-lifetime.js';
import type { Pool } from 'pg';
import { HttpError } from '../errors.js';
import type { HeaderInput } from './input.js';
export interface Snapshot {uidvalidity:string;uidNext:number;observedAt:Date;provenance:'local_fixture'|'imap_headers'}
export interface HeaderPage {uidvalidity:string;coveredThrough:number;headers:HeaderInput[];startedAt:Date;completedAt:Date}
export interface ReplyAdapter {
 readonly mode:'local_test'|'live_provider'|'protocol_fixture';
 snapshot(tenant:string,mailbox:string):Promise<Snapshot>;
 read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number):Promise<HeaderPage>;
}
export class FixtureAdapter implements ReplyAdapter {
 readonly mode='local_test' as const;
 constructor(readonly pool:Pool) {}
 async snapshot(tenant:string,mailbox:string):Promise<Snapshot> {
  const r=(await this.pool.query('SELECT uidvalidity,uid_next,failed FROM local_reply_fixture WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,mailbox])).rows[0];
  if(!r || r.failed) throw new HttpError(503,'fixture_unavailable');
  return {uidvalidity:r.uidvalidity,uidNext:Number(r.uid_next),observedAt:new Date(),provenance:'local_fixture'};
 }
 async read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number):Promise<HeaderPage> {
  const startedAt=new Date();
  // One source snapshot attests sparse/expunged coverage. Fetch 101 to distinguish a
  // 100-header prefix from a complete range; never derive completion from count alone.
  const r=(await this.pool.query(`SELECT f.uidvalidity,f.uid_next,f.failed,
   (SELECT COALESCE(jsonb_agg(x.header ORDER BY (x.header->>'uid')::bigint),'[]'::jsonb)
    FROM (SELECT h AS header FROM jsonb_array_elements(f.headers) h
     WHERE (h->>'uid')::bigint>$3 AND (h->>'uid')::bigint<=$4 ORDER BY (h->>'uid')::bigint LIMIT 101) x) AS headers
   FROM local_reply_fixture f WHERE tenant_id=$1 AND mailbox_id=$2`,[tenant,mailbox,cursor,horizon])).rows[0];
  if(!r || r.failed || r.uidvalidity!==validity || Number(r.uid_next)-1<horizon) throw new HttpError(503,'fixture_unavailable');
  const rows=r.headers as HeaderInput[],headers=rows.slice(0,100);
  const coveredThrough=rows.length>100?headers[99]!.uid:horizon;
  return {uidvalidity:validity,headers,coveredThrough,startedAt,completedAt:new Date()};
 }
}
export async function boundedOperation<T>(operation:()=>Promise<T>,timeoutMs=30000):Promise<T> {
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {return await Promise.race([operation(),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new HttpError(503,'poll_timeout')),timeoutMs);})]);}
 finally {if(timer) clearTimeout(timer);}
}

export class LiveReplyAdapter implements ReplyAdapter {
 readonly mode:'live_provider'|'protocol_fixture';
 constructor(readonly pool:Pool,readonly config:Config,readonly fixture?:ChildRequest['fixture']){this.mode=fixture?'protocol_fixture':'live_provider';}
 private async operation<T>(tenant:string,mailbox:string,extra:{kind:'snapshot'|'read';validity?:string;cursor?:number;horizon?:number}):Promise<T>{
  if(this.config.pollMode!=='live_provider')throw new HttpError(503,'transport_denied');
  const snapshot=await eligibilityTransaction(this.pool,c=>authorizeTransport(c,this.config,tenant,mailbox,'imap_headers'));
  const input=decryptCredentials<MailboxInput>(snapshot.credentialEnvelope as Envelope,tenant,mailbox,this.config.credentialKeyring);
  const slot=await acquireTransportSlot(this.pool,'imap',tenant,mailbox);
  return runTransportChild<T>(this.pool,slot,{...extra,input,allowlist:[...this.config.providerAllowlist],fixture:this.fixture});
 }
 snapshot(tenant:string,mailbox:string){return this.operation<Snapshot>(tenant,mailbox,{kind:'snapshot'});}
 read(tenant:string,mailbox:string,validity:string,cursor:number,horizon:number){return this.operation<HeaderPage>(tenant,mailbox,{kind:'read',validity,cursor,horizon});}
}
