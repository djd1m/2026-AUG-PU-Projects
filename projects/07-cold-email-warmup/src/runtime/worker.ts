import type { Pool } from 'pg';
import type { Config } from '../config.js';
import type { ChildRequest } from '../mailboxes/transport-lifetime.js';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool,ready } from '../db.js';
import { PollWorker } from '../replies/worker.js';
import { FixtureAdapter,LiveReplyAdapter } from '../replies/adapter.js';
import { DispatchStore } from '../dispatch/store.js';
import { SubmissionStore } from '../dispatch/submission.js';
import { PoolStore } from '../pool/store.js';
import { authorizeTransport } from '../mailboxes/transport-authority.js';
import { retryClosedSlots } from '../mailboxes/transport-lifetime.js';
import { ContextStore } from '../replies/context-store.js';
import { RuntimeStore } from './store.js';
import { runRuntime } from './loop.js';
// Trusted internal composition seam; normal CLI has no fixture selector in env/HTTP/argv.
export async function runWorker(pool:Pool,config:Config,signal:AbortSignal,once=false,fixture?:ChildRequest['fixture']){
  const store=new RuntimeStore(pool,config.pollMode==='live_provider'?(c,tenant,mailbox)=>authorizeTransport(c,config,tenant,mailbox,'imap_headers'):undefined,config.pollMode==='live_provider'?config:undefined),poll=new PollWorker(pool,config.credentialKeyring,config.pollMode,config.pollMode==='live_provider'?new LiveReplyAdapter(pool,config,fixture):new FixtureAdapter(pool));
  await new SubmissionStore(pool,config).recoverAbandoned();await retryClosedSlots(pool);
  // Closed runtime configuration remains authoritative; both current grants gate every phase.
  const context=new ContextStore(pool,config.credentialKeyring);
  await runRuntime(store,{
   maintenance:()=>context.purgeExpired(100),
   ...(config.pollMode==='live_provider'?{body:(signal:AbortSignal,admission?:import('../replies/context-store.js').CaptureAdmission)=>context.quantum(new LiveReplyAdapter(pool,config,fixture),config,signal,admission)}:{}),
   poll:async(c,signal)=>{const admission=store.pollAdmission(c);if(admission?.reason)return {reason:admission.reason};const scoped=admission?.slot?new PollWorker(pool,config.credentialKeyring,config.pollMode,new LiveReplyAdapter(pool,config,fixture,admission.slot)):poll;try{const r=await scoped.quantum(c.tenant_id,c.mailbox_id,store.guard(c,signal),signal);return {reason:r.state==='authority_denied'?'authority_denied':r.state==='cleanup_blocked'?'cleanup_blocked':r.state==='transport_busy'?'transport_busy':r.state==='rescan_incomplete'?'rescan_incomplete':r.state==='paused'?'provider_backoff':'ready',satisfied:r.state==='complete'};}finally{await store.disposeUnusedAdmission(c);}},
   pool:async(c,signal)=>{if(config.dispatchMode==='disabled')return {reason:'authority_denied'};const r=await new PoolStore(pool).tick(undefined,c.mailbox_id,store.guard(c,signal));return {reason:r.status==='waiting'?'waiting_peer':'ready',satisfied:true};},
   dispatch:async(c,signal)=>{if(config.dispatchMode==='disabled')return {reason:'authority_denied'};const j=await new DispatchStore(pool).claim(undefined,undefined,c.mailbox_id,store.guard(c,signal));if(!j)return {reason:'ready'};const result=await new SubmissionStore(pool,config,{signal,guard:store.guard(c,signal),transportFixture:fixture}).submit(j.id,j.lease_owner);return {reason:'reason' in result?result.reason:result.state==='queued'?'provider_backoff':'ready',satisfied:result.state==='submitted'};}
  },signal,once);
}
export async function main(){
 const config=loadConfig(),pool=createPool(config.databaseUrl),abort=new AbortController();
 const stop=()=>abort.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{
  if(!await ready(pool))throw new Error('database_not_ready');
  await runWorker(pool,config,abort.signal,process.argv[2]!=='loop');
 }catch{abort.abort();process.stderr.write('runtime_failed\n');process.exitCode=1;}
 finally{process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();
