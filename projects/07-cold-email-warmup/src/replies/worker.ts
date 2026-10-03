import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import type { Keyring } from '../mailboxes/crypto.js';
import { eligibilityTransaction } from '../consent/transaction.js';
import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { FixtureAdapter,boundedOperation,type ReplyAdapter } from './adapter.js';
import { ReplyStore,type Rescan,type TransactionGuard } from './store.js';
import { claimPoll,observePoll } from './fixture.js';
import { HttpError } from '../errors.js';
export const identity=(r:Rescan)=>({runId:r.runId,attempt:r.attempt,uidvalidity:r.uidvalidity,expectedCursor:r.cursor});
export class PollWorker {
 readonly store:ReplyStore;
 constructor(readonly pool:Pool,ring:Keyring,readonly mode:'disabled'|'local_test'='disabled',readonly adapter:ReplyAdapter=new FixtureAdapter(pool)) {this.store=new ReplyStore(pool,ring);}
 async poll(tenant:string,mailbox:string) {
  if(this.mode!=='local_test') return {mode:this.mode,state:'disabled'};
  let run:Rescan|null=null;let guard:TransactionGuard|undefined;let deadline=Date.now()+120000;
  const operation=<T>(call:()=>Promise<T>)=>boundedOperation(call,Math.max(1,Math.min(30000,deadline-Date.now())));
  try {
   const owner=await claimPoll(this.pool,tenant,mailbox);
   guard=await observePoll(this.pool,tenant,mailbox,owner);
   const capture=await operation(()=>this.adapter.snapshot(tenant,mailbox));
   run=await this.store.capture(tenant,mailbox,capture,guard);deadline=run.attemptStartedAt.getTime()+120000;
   if(run.state==='rescan_incomplete') return {mode:this.mode,state:run.state};
   for(let pages=0;pages<20;pages++) {
    if(Date.now()>=deadline) {await this.store.failTail(tenant,mailbox,identity(run),guard);return {mode:this.mode,state:'rescan_incomplete'};}
    guard=await observePoll(this.pool,tenant,mailbox,owner);
    const kind=run.cursor<run.highWater?'scan':'tail';
    let horizon=run.highWater;
    if(kind==='tail') {
     const tail=await operation(()=>this.adapter.snapshot(tenant,mailbox));
     if(tail.uidvalidity!==run.uidvalidity) {
      run=await this.store.capture(tenant,mailbox,tail,guard);return {mode:this.mode,state:run.state};
     }
     horizon=run.tailHighWater??tail.uidNext-1;
    }
    const current=run;
    const page=await operation(()=>this.adapter.read(tenant,mailbox,current.uidvalidity,current.cursor,horizon));
    const base={...identity(current),...page};
    const result=await this.store.page(tenant,mailbox,kind==='tail'?{...base,kind,tailHighWater:horizon}:{...base,kind},guard);
    if(result.state!=='scanning') return {mode:this.mode,state:result.state};
    run=(await this.store.status(tenant,mailbox))!;
   }
   return {mode:this.mode,state:'rescan_incomplete'};
  } catch(error) {
   if(error instanceof HttpError && error.code==='stale_poll_owner') return {mode:this.mode,state:'superseded'};
   // Failure never clears a pause or manufactures evidence, including missing fixture.
   try {
    if(!guard) return {mode:this.mode,state:'paused'};
    if(run && run.state!=='complete') await this.store.failTail(tenant,mailbox,identity(run),guard);
    else await eligibilityTransaction(this.pool,async c=>{await guard!(c);await c.query('UPDATE mailbox_poll SET scan_complete=false WHERE mailbox_id=$1 AND EXISTS(SELECT 1 FROM mailbox WHERE tenant_id=$2 AND id=$1)',[mailbox,tenant]);});
   } catch { /* A superseding run owns its pause. */ }
   return {mode:this.mode,state:'paused'};
  }
 }
 async tick() {
  if(this.mode!=='local_test') return {mode:this.mode,processed:0};
  // At most one attempt per tick keeps this process bounded by the A attempt budget.
  // Due-time claim is durable; no transaction remains over adapter I/O.
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
  if(!await ready(pool) || config.pollMode!=='local_test') throw new Error();
  const worker=new PollWorker(pool,config.credentialKeyring,config.pollMode);
  const loop=process.argv[2]==='loop';let stopped=false;
  process.once('SIGTERM',()=>{stopped=true;});process.once('SIGINT',()=>{stopped=true;});
  do {const start=Date.now();process.stdout.write(JSON.stringify(await worker.tick())+'\n');if(loop && !stopped) await new Promise(r=>setTimeout(r,Math.max(0,30000-(Date.now()-start))));} while(loop && !stopped);
 } catch {process.stderr.write('poll_worker_failed\n');process.exitCode=1;} finally {await pool.end();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) void main();
