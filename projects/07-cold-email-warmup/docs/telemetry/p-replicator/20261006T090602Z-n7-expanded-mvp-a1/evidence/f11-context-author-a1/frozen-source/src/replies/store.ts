import { enqueueCaptureClient } from './context-store.js';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../errors.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { stopEnrollmentClient } from '../dispatch/seams.js';
import { openRecipient } from '../campaigns/store.js';
import type { Envelope, Keyring } from '../mailboxes/crypto.js';
import { date, parsePage, singleAddress, uid, validity, type PageInput, type ReplyHeader } from './input.js';
export interface Rescan {
 runId:string; uidvalidity:string; highWater:number; tailHighWater:number|null; cursor:number;
 state:'scanning'|'rescan_incomplete'|'complete'; attempt:number; pages:number; attemptStartedAt:Date;
 provenance:'local_fixture'|'imap_headers';
}
export interface Capture { uidvalidity:string; uidNext:number; observedAt:Date; provenance:Rescan['provenance'] }
export interface RunIdentity { runId:string; attempt:number; uidvalidity:string; expectedCursor:number }
export type TransactionGuard=(client:PoolClient)=>Promise<void>;
interface Hooks { clock?:()=>Date; beforeCommit?:()=>Promise<void>; afterCommit?:()=>Promise<void> }
const stale=()=>new HttpError(409,'stale_reply_run');
const evidenceError=()=>new HttpError(400,'invalid_reply_evidence');
function view(r:Record<string,unknown>):Rescan {
 return {runId:r.run_id as string,uidvalidity:r.uidvalidity as string,highWater:Number(r.high_water),tailHighWater:r.tail_high_water==null?null:Number(r.tail_high_water),cursor:Number(r.cursor_uid),state:r.state as Rescan['state'],attempt:Number(r.attempt),pages:Number(r.pages),attemptStartedAt:r.attempt_started_at as Date,provenance:r.provenance as Rescan['provenance']};
}
// Internal trusted reader API only. No adapter/network I/O belongs inside these transactions.
export class ReplyStore {
 constructor(readonly pool:Pool,readonly ring:Keyring,readonly hooks:Hooks={}) {}
 private now() {return date(this.hooks.clock?.()??new Date());}
 private async owned(client:PoolClient,tenant:string,mailbox:string) {
  if(!(await client.query('SELECT id FROM mailbox WHERE tenant_id=$1 AND id=$2',[tenant,mailbox])).rowCount) throw new HttpError(404,'not_found');
 }
 private async current(client:PoolClient,tenant:string,mailbox:string,identity?:RunIdentity):Promise<Rescan> {
  await this.owned(client,tenant,mailbox);
  const row=(await client.query('SELECT * FROM reply_rescan WHERE tenant_id=$1 AND mailbox_id=$2 FOR UPDATE',[tenant,mailbox])).rows[0];
  if(!row) throw stale();const run=view(row);
  if(identity && (run.runId!==identity.runId || run.attempt!==identity.attempt || run.uidvalidity!==identity.uidvalidity || run.cursor!==identity.expectedCursor)) throw stale();
  return run;
 }
 async status(tenant:string,mailbox:string):Promise<Rescan|null> {
  const row=(await this.pool.query('SELECT * FROM reply_rescan WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,mailbox])).rows[0];return row?view(row):null;
 }
 // Same validity resumes unfinished work. A completed poll starts bounded incremental coverage.
 async capture(tenant:string,mailbox:string,input:Capture,guard?:TransactionGuard,expected?:RunIdentity):Promise<Rescan> {
  const v=validity(input.uidvalidity),highWater=uid(input.uidNext)-1,observed=date(input.observedAt);
  if(!['local_fixture','imap_headers'].includes(input.provenance)) throw evidenceError();
  return eligibilityTransaction(this.pool,async c=>{
   await guard?.(c);
   await this.owned(c,tenant,mailbox);const now=this.now();
   if(observed.getTime()>now.getTime() || now.getTime()-observed.getTime()>30000) throw evidenceError();
   const prior=(await c.query('SELECT * FROM reply_rescan WHERE tenant_id=$1 AND mailbox_id=$2 FOR UPDATE',[tenant,mailbox])).rows[0];
   if(expected){
    if(!prior)throw stale();const current=view(prior);
    if(current.runId!==expected.runId||current.attempt!==expected.attempt||current.uidvalidity!==expected.uidvalidity||current.cursor!==expected.expectedCursor||current.state==='rescan_incomplete')throw stale();
   }
   if(prior&&prior.provenance!==input.provenance)throw evidenceError();
   if(prior?.state==='rescan_incomplete'){if(prior.uidvalidity===v)return view(prior);throw stale();}
   if(prior && prior.uidvalidity===v && prior.state!=='complete') return view(prior);
   const cursor=prior && prior.uidvalidity===v?Math.min(Number(prior.cursor_uid),highWater):0;
   const id=randomUUID();
   const row=(await c.query(`INSERT INTO reply_rescan(tenant_id,mailbox_id,run_id,uidvalidity,high_water,state,attempt_started_at,provenance,cursor_uid) VALUES($1,$2,$3,$4,$5,'scanning',$6,$7,$8)
    ON CONFLICT(mailbox_id) DO UPDATE SET run_id=$3,uidvalidity=$4,high_water=$5,cursor_uid=$8,state='scanning',attempt=1,attempt_started_at=$6,pages=0,provenance=$7,tail_high_water=NULL RETURNING *`,[tenant,mailbox,id,v,highWater,now,input.provenance,cursor])).rows[0];
   await c.query(`INSERT INTO mailbox_poll(mailbox_id,scan_complete,uidvalidity,cursor_uid) VALUES($1,false,$2,$3)
    ON CONFLICT(mailbox_id) DO UPDATE SET scan_complete=false,uidvalidity=$2,cursor_uid=$3`,[mailbox,v,cursor]);return view(row);
  });
 }
 async checkpointTail(tenant:string,mailbox:string,identity:RunIdentity,input:Capture,guard?:TransactionGuard){
  return eligibilityTransaction(this.pool,async c=>{
   await guard?.(c);const run=await this.current(c,tenant,mailbox,identity),now=this.now();
   if(run.state!=='scanning'||run.cursor<run.highWater||input.uidvalidity!==run.uidvalidity||input.provenance!==run.provenance)throw stale();
   const observed=date(input.observedAt);if(observed>now||now.getTime()-observed.getTime()>30000)throw evidenceError();
   if(now.getTime()-run.attemptStartedAt.getTime()>=120000||run.pages>=20){await this.incomplete(c,tenant,mailbox);return;}
   const horizon=uid(input.uidNext)-1;if(horizon<run.cursor)throw evidenceError();
   await c.query('UPDATE reply_rescan SET tail_high_water=COALESCE(tail_high_water,$3) WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,mailbox,horizon]);
  });
 }
 async retry(tenant:string,mailbox:string,identity:RunIdentity):Promise<Rescan> {
  return eligibilityTransaction(this.pool,async c=>{
   const run=await this.current(c,tenant,mailbox,identity);const now=this.now();
   if(run.state!=='rescan_incomplete' || now.getTime()<run.attemptStartedAt.getTime()) throw stale();
   return view((await c.query("UPDATE reply_rescan SET state='scanning',attempt=attempt+1,pages=0,attempt_started_at=$3 WHERE tenant_id=$1 AND mailbox_id=$2 RETURNING *",[tenant,mailbox,now])).rows[0]);
  });
 }
 private async incomplete(c:PoolClient,tenant:string,mailbox:string) {
  await c.query("UPDATE reply_rescan SET state='rescan_incomplete' WHERE tenant_id=$1 AND mailbox_id=$2",[tenant,mailbox]);
  await c.query('UPDATE mailbox_poll SET scan_complete=false WHERE mailbox_id=$1',[mailbox]);
 }
 // Failed tail evidence has no header writes and cannot manufacture completion.
 async failTail(tenant:string,mailbox:string,identity:RunIdentity,guard?:TransactionGuard) {
  return eligibilityTransaction(this.pool,async c=>{
   await guard?.(c);
   const run=await this.current(c,tenant,mailbox,identity);if(run.state==='complete') throw stale();
   await this.incomplete(c,tenant,mailbox);return {state:'rescan_incomplete' as const,effects:0};
  });
 }
 private async ingest(c:PoolClient,tenant:string,mailbox:string,v:string,headers:ReplyHeader[],now:Date,run:Rescan) {
  let effects=0;
  for(const h of headers) {
   await c.query('INSERT INTO reply_observation(tenant_id,mailbox_id,uidvalidity,uid,message_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[tenant,mailbox,v,h.uid,h.messageId]);
   if(h.messageId) await c.query('INSERT INTO reply_message(tenant_id,mailbox_id,message_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[tenant,mailbox,h.messageId]);
   // Neither observation nor incoming ID is authoritative dedup. Reused IDs must still match S.
   if(!h.sender || !h.references.length) continue;
   const candidates=(await c.query(`SELECT DISTINCT e.id,e.recipient_envelope,j.id AS job_id FROM send_job j JOIN enrollment e ON e.tenant_id=j.tenant_id AND e.id=j.enrollment_id
    WHERE j.tenant_id=$1 AND j.mailbox_id=$2 AND j.message_id=ANY($3::text[]) AND j.state IN ('submitting','submitted','unknown')`,[tenant,mailbox,h.references])).rows;
   const matched:{enrollment:string;job:string}[]=[];
   for(const e of candidates) {
    if(singleAddress(openRecipient(e.recipient_envelope as Envelope,tenant,e.id,this.ring))!==h.sender) continue;
    matched.push({enrollment:e.id,job:e.job_id});
    const inserted=await c.query(`INSERT INTO reply_effect(tenant_id,mailbox_id,enrollment_id,kind,created_at) VALUES($1,$2,$3,'reply',$4) ON CONFLICT DO NOTHING RETURNING enrollment_id`,[tenant,mailbox,e.id,now]);
    if(inserted.rowCount) {await stopEnrollmentClient(c,tenant,e.id,'replied');effects++;}
   }
   if(!matched.length)continue;
   // Follow only own tenant/mailbox/enrollment parents, bounded against cycles.
   const roots=new Set<string>();let invalid=false;
   for(const m of matched){let id=m.job;const visited=new Set<string>();let root:string|null=null;
    for(let depth=0;depth<32;depth++){if(visited.has(id))break;visited.add(id);const j=(await c.query('SELECT id,parent_id FROM send_job WHERE tenant_id=$1 AND mailbox_id=$2 AND enrollment_id=$3 AND id=$4',[tenant,mailbox,m.enrollment,id])).rows[0];if(!j)break;if(j.parent_id===null){root=j.id;break;}id=j.parent_id;}
    if(root)roots.add(root);else invalid=true;
   }
   const enrollments=new Set(matched.map(m=>m.enrollment)),owned=!invalid&&roots.size===1&&enrollments.size===1;
   await enqueueCaptureClient(c,{tenant,mailbox,uidvalidity:v,uid:h.uid,runId:run.runId,attempt:run.attempt,source:run.provenance,observedAt:now,enrollment:owned?matched[0]!.enrollment:null,root:owned?[...roots][0]!:null});
  }
  return effects;
 }
 async page(tenant:string,mailbox:string,input:PageInput,guard?:TransactionGuard) {
  const p=parsePage(input);
  const result=await eligibilityTransaction(this.pool,async c=>{
   await guard?.(c);
   const run=await this.current(c,tenant,mailbox,{runId:p.runId,attempt:p.attempt,uidvalidity:p.uidvalidity,expectedCursor:p.expectedCursor});
   if(run.state!=='scanning') throw stale();const now=this.now(),elapsed=now.getTime()-run.attemptStartedAt.getTime();
   if(elapsed<0 || elapsed>=120000 || run.pages>=20) {
    await this.incomplete(c,tenant,mailbox);return {state:'rescan_incomplete' as const,effects:0,cursor:run.cursor};
   }
   const start=p.startedAt.getTime(),end=p.completedAt.getTime(),clock=now.getTime();
   if(start>end || end>clock || clock-end>30000 || end-start>30000) {
    await this.incomplete(c,tenant,mailbox);return {state:'rescan_incomplete' as const,effects:0,cursor:run.cursor};
   }
   if(p.kind==='scan' && (p.coveredThrough>run.highWater || run.tailHighWater!==null) || p.kind==='tail' && (run.cursor<run.highWater || (run.tailHighWater!==null && p.tailHighWater!==run.tailHighWater))) throw evidenceError();
   const tailHighWater=p.kind==='tail'?p.tailHighWater!:run.tailHighWater;
   const effects=await this.ingest(c,tenant,mailbox,run.uidvalidity,p.headers,now,run);
   const state=p.kind==='tail' && p.coveredThrough===tailHighWater?'complete':run.pages+1>=20?'rescan_incomplete':'scanning';
   await c.query('UPDATE reply_rescan SET cursor_uid=$3,pages=pages+1,state=$4,tail_high_water=$5 WHERE tenant_id=$1 AND mailbox_id=$2',[tenant,mailbox,p.coveredThrough,state,tailHighWater]);
   await c.query('UPDATE mailbox_poll SET cursor_uid=$2,scan_complete=$3,completed_at=CASE WHEN $3 THEN $4 ELSE completed_at END WHERE mailbox_id=$1',[mailbox,p.coveredThrough,state==='complete',now]);
   await this.hooks.beforeCommit?.();return {state,effects,cursor:p.coveredThrough};
  });
  await this.hooks.afterCommit?.();return result;
 }
}
