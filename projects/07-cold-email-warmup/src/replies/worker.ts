import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { Keyring } from '../mailboxes/crypto.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { LiveReplyAdapter,FixtureAdapter,boundedOperation,validateReadResult,type ReplyAdapter } from './adapter.js';
import { ReplyStore,type Rescan,type TransactionGuard } from './store.js';
import { claimPoll,observePoll } from './fixture.js';
import { runtimeFailure } from '../runtime/store.js';
import { HttpError } from '../errors.js';
export const identity=(r:Rescan)=>({runId:r.runId,attempt:r.attempt,uidvalidity:r.uidvalidity,expectedCursor:r.cursor});
export class PollWorker {
 readonly store:ReplyStore;
 constructor(readonly pool:Pool,ring:Keyring,readonly mode:'disabled'|'local_test'|'live_provider'='disabled',readonly adapter:ReplyAdapter=new FixtureAdapter(pool)) {this.store=new ReplyStore(pool,ring);}
 async poll(tenant:string,mailbox:string) {
  if(this.mode==='disabled') return {mode:this.mode,state:'disabled'};
  if(this.mode==='live_provider'&&this.adapter.mode==='local_test')return {mode:this.mode,state:'paused'};
  let run=await this.store.status(tenant,mailbox);if(run?.state==='rescan_incomplete')return {mode:this.mode,state:run.state};let guard:TransactionGuard|undefined;let deadline=Date.now()+120000;
  const observe=async(owner:string)=>{const source=await observePoll(this.pool,tenant,mailbox,owner),transport=await this.adapter.fence?.(tenant,mailbox);return async(client:import('pg').PoolClient)=>{await source(client);await transport?.(client);};};
  const operation=<T>(call:()=>Promise<T>)=>boundedOperation(call,Math.max(1,Math.min(30000,deadline-Date.now())));
  try {
   const owner=await claimPoll(this.pool,tenant,mailbox);
   guard=await observe(owner);
   const capture=await operation(()=>this.adapter.snapshot(tenant,mailbox));
   run=await this.store.capture(tenant,mailbox,capture,guard,run?identity(run):undefined);deadline=run.attemptStartedAt.getTime()+120000;
   if(run.state==='rescan_incomplete') return {mode:this.mode,state:run.state};
   for(let pages=0;pages<20;pages++) {
    if(Date.now()>=deadline) {await this.store.failTail(tenant,mailbox,identity(run),guard);return {mode:this.mode,state:'rescan_incomplete'};}
    guard=await observe(owner);
    const kind=run.cursor<run.highWater?'scan':'tail';
    let horizon=run.highWater;
    if(kind==='tail') {
     const tail=await operation(()=>this.adapter.snapshot(tenant,mailbox));
     if(tail.uidvalidity!==run.uidvalidity) {
      run=await this.store.capture(tenant,mailbox,tail,guard,identity(run));return {mode:this.mode,state:run.state};
     }
     horizon=run.tailHighWater??tail.uidNext-1;
    }
    const current=run;
    const read=validateReadResult(await operation(()=>this.adapter.read(tenant,mailbox,current.uidvalidity,current.cursor,horizon)),current.uidvalidity,this.adapter.mode==='local_test'?'local_fixture':'imap_headers');
    if(read.kind==='uidvalidity_changed'){run=await this.store.capture(tenant,mailbox,read.snapshot,guard,identity(current));return {mode:this.mode,state:run.state};}
    const page=read.page;
    const base={...identity(current),...page};
    const result=await this.store.page(tenant,mailbox,kind==='tail'?{...base,kind,tailHighWater:horizon}:{...base,kind},guard);
    if(result.state!=='scanning') return {mode:this.mode,state:result.state};
    run=(await this.store.status(tenant,mailbox))!;
   }
   return {mode:this.mode,state:'rescan_incomplete'};
  } catch(error) {
   if(error instanceof HttpError && ['stale_poll_owner','stale_reply_run'].includes(error.code)) return {mode:this.mode,state:'superseded'};
   // Failure never clears a pause or manufactures evidence, including missing fixture.
   try {
    if(!guard) return {mode:this.mode,state:'paused'};
    if(run && run.state!=='complete') await this.store.failTail(tenant,mailbox,identity(run),guard);
    else await eligibilityTransaction(this.pool,async c=>{await guard!(c);await c.query('UPDATE mailbox_poll SET scan_complete=false WHERE mailbox_id=$1 AND EXISTS(SELECT 1 FROM mailbox WHERE tenant_id=$2 AND id=$1)',[mailbox,tenant]);});
   } catch { /* A superseding run owns its pause. */ }
   return {mode:this.mode,state:'paused'};
  }
 }
 async quantum(tenant:string,mailbox:string,runtimeGuard:TransactionGuard,signal:AbortSignal){
  if(this.mode==='disabled')return {state:'paused'};
  if(this.mode==='live_provider'&&this.adapter.mode==='local_test')return {state:'paused'};
  let run=await this.store.status(tenant,mailbox);
  if(run?.state==='rescan_incomplete')return {state:run.state};
  const owner=await claimPoll(this.pool,tenant,mailbox),source=await observePoll(this.pool,tenant,mailbox,owner),transport=await this.adapter.fence?.(tenant,mailbox);
  const guard:TransactionGuard=async c=>{await runtimeGuard(c);await source(c);await transport?.(c);};
  try{
   if(signal.aborted)throw new Error('aborted');
   if(!run||run.state==='complete'){
    const snapshot=await this.adapter.snapshot(tenant,mailbox,signal);run=await this.store.capture(tenant,mailbox,snapshot,guard,run?identity(run):undefined);return {state:run.state};
   }
   if(this.adapter.mode!=='local_test'){
    const pending=(await this.pool.query(`SELECT uid FROM incoming_ai_event WHERE tenant_id=$1 AND mailbox_id=$2 AND capture_state='pending' AND window_start IS NULL AND expires_at>clock_timestamp() AND (attempt_deadline IS NULL OR attempt_deadline>clock_timestamp()) AND uidvalidity=$3 AND (authenticated_run_id IS DISTINCT FROM $4 OR authenticated_attempt<>$5) ORDER BY created_at,id LIMIT 1`,[tenant,mailbox,run.uidvalidity,run.runId,run.attempt])).rows[0];
    if(pending){const target=Number(pending.uid),read=await this.adapter.read(tenant,mailbox,run.uidvalidity,target-1,target,signal);
     if(read.kind==='page'&&read.page.headers.length===1)return await this.store.revalidate(tenant,mailbox,identity(run),read.page,target,guard);
     await eligibilityTransaction(this.pool,async c=>{await guard(c);await c.query(`UPDATE incoming_ai_event SET capture_state='held',state='held',reason='authentication_unavailable',phase_metadata=NULL,terminal_at=COALESCE(terminal_at,clock_timestamp()),expires_at=LEAST(expires_at,clock_timestamp()+interval '24 hours') WHERE tenant_id=$1 AND mailbox_id=$2 AND uid=$3 AND window_start IS NULL AND capture_state='pending'`,[tenant,mailbox,target]);});return {state:'scanning'};
    }
   }
   if(Date.now()-run.attemptStartedAt.getTime()>=120000){await this.store.failTail(tenant,mailbox,identity(run),guard);return {state:'rescan_incomplete'};}
   if(run.cursor>=run.highWater&&run.tailHighWater===null){
    const snapshot=await this.adapter.snapshot(tenant,mailbox,signal);
    if(snapshot.uidvalidity!==run.uidvalidity){run=await this.store.capture(tenant,mailbox,snapshot,guard,run?identity(run):undefined);return {state:run.state};}
    await this.store.checkpointTail(tenant,mailbox,identity(run),snapshot,guard);return {state:'scanning'};
   }
   const tail=run.cursor>=run.highWater,horizon=tail?run.tailHighWater!:run.highWater;
   const read=validateReadResult(await this.adapter.read(tenant,mailbox,run.uidvalidity,run.cursor,horizon,signal),run.uidvalidity,this.adapter.mode==='local_test'?'local_fixture':'imap_headers');
   if(read.kind==='uidvalidity_changed'){run=await this.store.capture(tenant,mailbox,read.snapshot,guard,identity(run));return {state:run.state};}
   const page=read.page;
   const base={...identity(run),...page};
   return await this.store.page(tenant,mailbox,tail?{...base,kind:'tail',tailHighWater:horizon}:{...base,kind:'scan'},guard);
  }catch(error){const reason=runtimeFailure(error);if(reason===null)throw error;if(reason==='ready')return {state:'superseded'};if(reason==='authority_denied')return {state:'authority_denied'};if(error instanceof Error&&error.message==='cleanup_blocked')return {state:'cleanup_blocked'};if(error instanceof HttpError&&error.code==='transport_busy')return {state:'transport_busy'};try{if(run&&run.state!=='complete')await this.store.failTail(tenant,mailbox,identity(run),guard);}catch(error){if(runtimeFailure(error)===null)throw error;}return {state:'paused'};}
 }
 async tick() {
  if(this.mode==='disabled') return {mode:this.mode,processed:0};
  // At most one attempt per tick keeps this process bounded by the A attempt budget.
  // Due-time claim is durable; no transaction remains over adapter I/O.
  if(this.mode==='live_provider'){const rows=(await this.pool.query("SELECT tenant_id,mailbox_id FROM transport_grant WHERE state='active' ORDER BY mailbox_id LIMIT 1")).rows;for(const row of rows)await this.poll(row.tenant_id,row.mailbox_id);return {mode:this.mode,processed:rows.length};}
  const rows=(await this.pool.query(`UPDATE local_reply_fixture SET next_poll_at=clock_timestamp()+interval '30 seconds'
   WHERE mailbox_id IN (SELECT mailbox_id FROM local_reply_fixture WHERE next_poll_at<=clock_timestamp() ORDER BY next_poll_at,mailbox_id LIMIT 1 FOR UPDATE SKIP LOCKED)
   RETURNING tenant_id,mailbox_id`)).rows;
  for(const row of rows) await this.poll(row.tenant_id,row.mailbox_id);
  return {mode:this.mode,processed:rows.length};
 }
}
async function main() {
 const config=loadConfig(),pool=createPool(config.databaseUrl);
 try {
  if(!await ready(pool) || !config.pollMode || config.pollMode==='disabled') throw new Error();
  const worker=new PollWorker(pool,config.credentialKeyring,config.pollMode,config.pollMode==='live_provider'?new LiveReplyAdapter(pool,config):new FixtureAdapter(pool));
  const loop=process.argv[2]==='loop';let stopped=false;
  process.once('SIGTERM',()=>{stopped=true;});process.once('SIGINT',()=>{stopped=true;});
  do {const start=Date.now();process.stdout.write(JSON.stringify(await worker.tick())+'\n');if(loop && !stopped) await new Promise(r=>setTimeout(r,Math.max(0,30000-(Date.now()-start))));} while(loop && !stopped);
 } catch {process.stderr.write('poll_worker_failed\n');process.exitCode=1;} finally {await pool.end();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) void main();
