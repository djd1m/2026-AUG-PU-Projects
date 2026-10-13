import { randomUUID } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { eligibilityTransaction } from '../consent/transaction.js';
import { dispatchProjection } from '../dispatch/store.js';
import { acquireTransportSlotInTransaction,releaseUnusedTransportSlot,type TransportSlot } from '../mailboxes/transport-slots.js';
import type { Config } from '../config.js';
import { openCaptureWindowClient,captureHeaderFrontierClient,type CaptureAdmission } from '../replies/context-store.js';
import { HttpError } from '../errors.js';
export type RuntimeKind='poll'|'pool'|'dispatch';
export type RuntimeReason='ready'|'waiting_peer'|'waiting_budget'|'waiting_capacity'|'waiting_pacing'|'transport_busy'|'provider_backoff'|'authority_denied'|'rescan_incomplete'|'cleanup_blocked'|'db_unavailable';
export interface RuntimeClaim {tenant_id:string;mailbox_id:string;kind:RuntimeKind;owner_id:string;generation:string;due_at:Date;service_seq:string;failure_count:number}
// Only enumerated provider/stale outcomes are recoverable; an unknown/DB fault is fatal.
export function runtimeFailure(error:unknown):RuntimeReason|null{
 if(error instanceof HttpError){
  if(['stale_poll_owner','stale_reply_run'].includes(error.code))return 'ready';
  if(error.code==='transport_busy')return 'transport_busy';
  if(error.code==='transport_denied')return 'authority_denied';
  if(['fixture_unavailable','poll_timeout'].includes(error.code))return 'provider_backoff';
 }
 if(error instanceof Error){
  if(error.message==='cleanup_blocked')return 'cleanup_blocked';
  if(['transport_child_failed','transport_timeout'].includes(error.message))return 'provider_backoff';
  if(['transport_cancelled','aborted'].includes(error.message))return 'ready';
 }
 return null;
}
export class RuntimeStore {
 private readonly captures=new WeakMap<RuntimeClaim,CaptureAdmission>();
 async disposeCaptureAdmission(capture:CaptureAdmission){await releaseUnusedTransportSlot(this.pool,capture.slot);}
 takeCaptureAdmission(claim:RuntimeClaim){const capture=this.captures.get(claim);this.captures.delete(claim);return capture;}
 private readonly admissions=new WeakMap<RuntimeClaim,{slot?:TransportSlot;reason?:RuntimeReason}>();
 constructor(readonly pool:Pool,readonly nativePollAuthority?:(c:PoolClient,tenant:string,mailbox:string)=>Promise<unknown>,readonly captureConfig?:Config){}
 pollAdmission(claim:RuntimeClaim){return this.admissions.get(claim);}
 async disposeUnusedAdmission(claim:RuntimeClaim){const slot=this.admissions.get(claim)?.slot;if(slot)await releaseUnusedTransportSlot(this.pool,slot);}
 // Presence of an existing activity request is required: this never creates leases.
 async maintenance(){return eligibilityTransaction(this.pool,async c=>{
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
  if(!(await c.query('SELECT id FROM installation_capacity WHERE id=1 AND active_limit=30 FOR UPDATE')).rowCount)throw new HttpError(503,'service_unavailable');
  await c.query(`UPDATE capacity_lease l SET state='waiting_capacity',expires_at=NULL FROM mailbox m
   WHERE l.mailbox_id=m.id AND l.state='active' AND (m.state<>'verified_test' OR m.credential_envelope IS NULL OR l.expires_at<=$1)`,[now]);
  await c.query(`UPDATE capacity_lease l SET expires_at=$1::timestamptz+interval '120 seconds' FROM mailbox m
   WHERE l.mailbox_id=m.id AND l.state='active' AND l.expires_at>$1 AND m.state='verified_test' AND m.credential_envelope IS NOT NULL`,[now]);
  let active=Number((await c.query("SELECT count(*) FROM capacity_lease WHERE state='active' AND expires_at>$1",[now])).rows[0].count);
  if(active>30)throw new HttpError(503,'service_unavailable');
  while(active<30){
   const row=(await c.query(`SELECT l.tenant_id,l.mailbox_id FROM capacity_lease l JOIN mailbox m ON m.id=l.mailbox_id
    LEFT JOIN runtime_tenant_turn t ON t.tenant_id=l.tenant_id AND t.kind='capacity'
    WHERE l.state='waiting_capacity' AND m.state='verified_test' AND m.credential_envelope IS NOT NULL
    ORDER BY COALESCE(t.service_seq,0),l.created_at,l.mailbox_id LIMIT 1`)).rows[0];if(!row)break;
   await c.query("INSERT INTO runtime_tenant_turn(tenant_id,kind,service_seq) VALUES($1,'capacity',nextval('runtime_service_seq')) ON CONFLICT(tenant_id,kind) DO UPDATE SET service_seq=EXCLUDED.service_seq",[row.tenant_id]);
   await c.query("UPDATE capacity_lease SET state='active',expires_at=$2::timestamptz+interval '120 seconds' WHERE mailbox_id=$1 AND state='waiting_capacity'",[row.mailbox_id,now]);active++;
  }
  const cursor=(await c.query('SELECT * FROM runtime_reconcile WHERE id=1 FOR UPDATE')).rows[0];
  const page=(await c.query(`SELECT m.id,m.tenant_id,m.created_at FROM mailbox m WHERE m.credential_envelope IS NOT NULL
   AND ($1::timestamptz IS NULL OR (m.created_at,m.id)>($1,$2::uuid)) ORDER BY m.created_at,m.id LIMIT 100`,[cursor.after_created_at,cursor.after_mailbox])).rows;
  const activeRows=(await c.query("SELECT tenant_id,mailbox_id AS id FROM capacity_lease WHERE state='active' AND expires_at>$1 ORDER BY mailbox_id LIMIT 30",[now])).rows;
  const ids=[...new Set([...page,...activeRows].map(r=>r.id))];
  for(const row of activeRows){
   await c.query('INSERT INTO runtime_mailbox(tenant_id,mailbox_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.tenant_id,row.id]);
   for(const kind of ['poll','pool','dispatch']){
    await c.query('INSERT INTO runtime_tenant_turn(tenant_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.tenant_id,kind]);
    await c.query('INSERT INTO runtime_due(tenant_id,mailbox_id,kind,due_at,next_check_at) VALUES($1,$2,$3,$4,$4) ON CONFLICT DO NOTHING',[row.tenant_id,row.id,kind,now]);
   }
  }
  await c.query(`UPDATE runtime_due d SET state='blocked',owner_id=NULL,lease_until=NULL,generation=generation+1,reason='waiting_capacity'
   WHERE d.mailbox_id=ANY($2::uuid[]) AND NOT EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=d.mailbox_id AND l.state='active' AND l.expires_at>$1) AND d.reason<>'waiting_capacity'`,[now,ids]);
  await c.query(`UPDATE runtime_due d SET state='ready',reason='ready',next_check_at=$1 WHERE d.mailbox_id=ANY($2::uuid[]) AND reason='waiting_capacity'
   AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=d.mailbox_id AND l.state='active' AND l.expires_at>$1)`,[now,ids]);
  await c.query("UPDATE runtime_due d SET state='ready',reason='ready',next_check_at=$1 WHERE d.mailbox_id=ANY($2::uuid[]) AND d.reason='rescan_incomplete' AND EXISTS(SELECT 1 FROM reply_rescan r WHERE r.mailbox_id=d.mailbox_id AND r.state='scanning')",[now,ids]);
  for(const row of activeRows)await this.projectDispatch(c,row.id,now);
  const last=page.length===100?page[99]:null;
  await c.query('UPDATE runtime_reconcile SET after_created_at=$1,after_mailbox=$2 WHERE id=1',[last?.created_at??null,last?.id??null]);
  return active;
 });}
 private async projectDispatch(c:PoolClient,mailbox:string,now:Date,claimed?:RuntimeClaim){
  const projection=await dispatchProjection(c,mailbox,now);
  const reset="(($2::uuid IS NOT NULL AND job_id IS DISTINCT FROM $2) OR EXISTS(SELECT 1 FROM send_job prior WHERE prior.id=runtime_due.job_id AND prior.state IN ('submitted','cancelled')))";
  const updated=await c.query(`UPDATE runtime_due SET failure_count=CASE WHEN ${reset} THEN 0 ELSE failure_count END,job_id=CASE WHEN $2::uuid IS NULL THEN job_id ELSE $2 END,
   due_at=CASE WHEN $2::uuid IS NOT NULL AND job_id IS DISTINCT FROM $2 THEN $3 ELSE due_at END,
   reason=CASE WHEN reason IN ('provider_backoff','authority_denied') AND next_check_at>$4 AND failure_count>0 AND NOT(${reset}) THEN reason ELSE $5 END,
   next_check_at=CASE WHEN reason IN ('provider_backoff','authority_denied') AND failure_count>0 AND NOT(${reset}) THEN GREATEST(next_check_at,$6) ELSE $6 END,
   state='ready',owner_id=NULL,lease_until=NULL
   WHERE mailbox_id=$1 AND kind='dispatch' AND (state='ready' OR (state='claimed' AND owner_id=$7 AND generation=$8))`,
   [mailbox,projection.job,projection.due,now,projection.reason,projection.next,claimed?.owner_id??null,claimed?.generation??null]);
  return {...projection,updated:updated.rowCount};
 }
 async claim(kind:RuntimeKind):Promise<RuntimeClaim|null>{return eligibilityTransaction(this.pool,async c=>{
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
  // Reclaim only the logical scheduler lease; physical transport rows are untouched.
  await c.query("UPDATE runtime_due SET state='ready',owner_id=NULL,lease_until=NULL,generation=generation+1 WHERE kind=$1 AND state='claimed' AND lease_until<=$2",[kind,now]);
  if(kind==='poll'&&this.nativePollAuthority&&!(await c.query("SELECT 1 FROM transport_operation WHERE protocol='imap' AND operation IS NULL LIMIT 1")).rowCount)return null;
  const frontier=kind==='poll'&&this.nativePollAuthority&&this.captureConfig?await captureHeaderFrontierClient(c,this.captureConfig):[];
  let row=frontier.length?(await c.query(`SELECT d.* FROM runtime_due d JOIN runtime_tenant_turn t ON t.tenant_id=d.tenant_id AND t.kind=d.kind
   LEFT JOIN mailbox_poll p ON p.mailbox_id=d.mailbox_id
   WHERE d.kind=$1 AND d.state='ready' AND d.next_check_at<=$2
   AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=d.mailbox_id AND l.state='active' AND l.expires_at>$2)
   ORDER BY CASE WHEN p.completed_at IS NULL OR p.completed_at+interval '30 seconds'<=$2::timestamptz+interval '5 seconds' THEN 0
    WHEN EXISTS(SELECT 1 FROM unnest($3::uuid[],$4::uuid[]) f(tenant,mailbox) WHERE f.tenant=d.tenant_id AND f.mailbox=d.mailbox_id) THEN 1 ELSE 2 END,
    t.service_seq,d.service_seq,d.due_at,d.mailbox_id FOR UPDATE OF d SKIP LOCKED LIMIT 1`,[kind,now,frontier.map(f=>f.tenant),frontier.map(f=>f.mailbox)])).rows[0]:
   (await c.query(`SELECT d.* FROM runtime_due d JOIN runtime_tenant_turn t ON t.tenant_id=d.tenant_id AND t.kind=d.kind
   WHERE d.kind=$1 AND d.state='ready' AND d.next_check_at<=$2
   AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=d.mailbox_id AND l.state='active' AND l.expires_at>$2)
   ORDER BY t.service_seq,d.service_seq,d.due_at,d.mailbox_id FOR UPDATE OF d SKIP LOCKED LIMIT 1`,[kind,now])).rows[0];
  if(!row)return null;
  let admission:{slot?:TransportSlot;reason?:RuntimeReason}|undefined;
  if(kind==='poll'&&this.nativePollAuthority){
   admission={};try{await this.nativePollAuthority(c,row.tenant_id,row.mailbox_id);}
   catch(error){if(error instanceof HttpError&&error.code==='transport_denied')admission.reason='authority_denied';else throw error;}
   if(!admission.reason){
    if((await c.query("SELECT 1 FROM transport_operation WHERE protocol='imap' AND mailbox_id=$1 AND operation IS NOT NULL",[row.mailbox_id])).rowCount)admission.reason='transport_busy';
    else admission.slot=await acquireTransportSlotInTransaction(c,'imap',row.tenant_id,row.mailbox_id);
   }
  }
  await c.query("UPDATE runtime_tenant_turn SET service_seq=nextval('runtime_service_seq') WHERE tenant_id=$1 AND kind=$2",[row.tenant_id,kind]);
  await c.query("UPDATE runtime_due SET service_seq=nextval('runtime_service_seq') WHERE mailbox_id=$1 AND kind=$2",[row.mailbox_id,kind]);
  if(kind==='dispatch'){
   await this.projectDispatch(c,row.mailbox_id,now);
   row=(await c.query("SELECT * FROM runtime_due WHERE mailbox_id=$1 AND kind='dispatch'",[row.mailbox_id])).rows[0];
   // The considered sender consumes its turn even if fresh quota/authority defers it.
   if(row.state!=='ready'||row.next_check_at>now)return null;
  }
  const claim=(await c.query(`UPDATE runtime_due SET state='claimed',owner_id=$3,generation=generation+1,lease_until=$4::timestamptz+interval '120 seconds',last_served_at=$4 WHERE mailbox_id=$1 AND kind=$2 RETURNING *`,[row.mailbox_id,kind,admission?.slot?.operation??randomUUID(),now])).rows[0] as RuntimeClaim;
  if(admission)this.admissions.set(claim,admission);return claim;
 });}
 guard(claim:RuntimeClaim,signal?:AbortSignal){return async(c:PoolClient)=>{
  if(signal?.aborted)throw new HttpError(409,'stale_poll_owner');
  const result=await c.query(`SELECT 1 FROM runtime_due d WHERE mailbox_id=$1 AND kind=$2 AND owner_id=$3 AND generation=$4 AND state='claimed' AND lease_until>clock_timestamp()
   AND EXISTS(SELECT 1 FROM capacity_lease l WHERE l.mailbox_id=d.mailbox_id AND l.state='active' AND l.expires_at>clock_timestamp())`,[claim.mailbox_id,claim.kind,claim.owner_id,claim.generation]);
  if(!result.rowCount)throw new HttpError(409,'stale_poll_owner');
 };}
 // Called only before an operation starts or after its promise and cleanup settle.
 // Cancellation consumes no additional turn and supplies no synthetic poll freshness.
 async cancel(claim:RuntimeClaim,reason:RuntimeReason='ready'){
  await this.disposeUnusedAdmission(claim);
  if(reason!=='ready')return this.finish(claim,reason);
  return eligibilityTransaction(this.pool,async c=>{
   const occupied="EXISTS(SELECT 1 FROM transport_operation t WHERE t.mailbox_id=runtime_due.mailbox_id AND t.protocol=$6 AND t.operation IS NOT NULL)";
   return (await c.query(`UPDATE runtime_due SET state=CASE WHEN ${occupied} THEN 'blocked' ELSE 'ready' END,
    reason=CASE WHEN ${occupied} THEN 'cleanup_blocked' ELSE reason END,owner_id=NULL,lease_until=NULL
    WHERE tenant_id=$1 AND mailbox_id=$2 AND kind=$3 AND owner_id=$4 AND generation=$5 AND state='claimed'`,
    [claim.tenant_id,claim.mailbox_id,claim.kind,claim.owner_id,claim.generation,claim.kind==='poll'?'imap':claim.kind==='dispatch'?'smtp':null])).rowCount;
  });
 }
 async finish(claim:RuntimeClaim,reason:RuntimeReason='ready',satisfied=false){await this.disposeUnusedAdmission(claim);return eligibilityTransaction(this.pool,async c=>{
  if(claim.kind==='dispatch'&&!['provider_backoff','authority_denied','db_unavailable','cleanup_blocked','rescan_incomplete','transport_busy'].includes(reason)){const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;return (await this.projectDispatch(c,claim.mailbox_id,now,claim)).updated;}
  const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now;
  if(claim.kind==='poll')satisfied=satisfied&&reason==='ready'&&Boolean((await c.query("SELECT 1 FROM reply_rescan r JOIN mailbox_poll p ON p.mailbox_id=r.mailbox_id WHERE r.mailbox_id=$1 AND r.state='complete' AND p.scan_complete AND p.uidvalidity=r.uidvalidity AND EXISTS(SELECT 1 FROM runtime_due d WHERE d.mailbox_id=r.mailbox_id AND d.kind='poll' AND d.state='claimed' AND d.owner_id=$2 AND d.generation=$3 AND p.completed_at>=d.last_served_at)",[claim.mailbox_id,claim.owner_id,claim.generation])).rowCount);
  const failed=reason==='provider_backoff'||reason==='authority_denied'||reason==='db_unavailable';
  const count=failed?Math.min(5,claim.failure_count+1):0;
  let capture:CaptureAdmission|null=null;
  if(claim.kind==='poll'&&satisfied&&this.captureConfig){
   // Only settled complete proof reaches this branch. Header finish and real first
   // body claim/slot are one FIRST(7,1) transaction; denial restores immediate due.
   const finished=await c.query(`UPDATE runtime_due SET state='ready',owner_id=NULL,lease_until=NULL,reason='ready',failure_count=0,due_at=$5::timestamptz+interval '12 seconds',next_check_at=$5::timestamptz+interval '12 seconds' WHERE mailbox_id=$1 AND kind=$2 AND owner_id=$3 AND generation=$4 AND state='claimed'`,[claim.mailbox_id,claim.kind,claim.owner_id,claim.generation,now]);
   if(!finished.rowCount)return 0;
   capture=await openCaptureWindowClient(c,this.captureConfig,claim.tenant_id,claim.mailbox_id,now);
   if(capture)this.captures.set(claim,capture);
   else await c.query("UPDATE runtime_due SET due_at=$2::timestamptz+interval '12 seconds',next_check_at=$2::timestamptz+interval '12 seconds' WHERE mailbox_id=$1 AND kind='poll' AND state='ready' AND generation=$3",[claim.mailbox_id,now,claim.generation]);
   return 1;
  }
  const delay=reason==='transport_busy'?1:failed?[30,60,120,300,300][count-1]!:satisfied?(claim.kind==='poll'?30:claim.kind==='pool'?60:1):0;
  const next="CASE WHEN $9 AND kind='poll' THEN $10::timestamptz ELSE clock_timestamp()+$8*interval '1 second' END";
  return (await c.query(`UPDATE runtime_due SET state=$5,owner_id=NULL,lease_until=NULL,reason=$6,failure_count=$7,
   next_check_at=${next},due_at=CASE WHEN $9 AND kind<>'dispatch' THEN ${next} ELSE due_at END
   WHERE mailbox_id=$1 AND kind=$2 AND owner_id=$3 AND generation=$4 AND state='claimed'`,[claim.mailbox_id,claim.kind,claim.owner_id,claim.generation,['rescan_incomplete','cleanup_blocked'].includes(reason)?'blocked':'ready',reason,count,delay,satisfied,now])).rowCount;
 });}
}
