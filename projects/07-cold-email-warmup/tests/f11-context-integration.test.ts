import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test,type TestContext } from 'node:test';
import { LiveReplyAdapter } from '../src/replies/adapter.js';
import { publishTransportGrant,transportFingerprint } from '../src/mailboxes/transport-authority.js';
import { authorizeTransport } from '../src/mailboxes/transport-authority.js';
import { runRuntime } from '../src/runtime/loop.js';
import { RuntimeStore } from '../src/runtime/store.js';
import { PollWorker } from '../src/replies/worker.js';
import { bodyFixture } from './f11-body-fixture.js';
import { readFile,writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { createPool,migrate,ready } from '../src/db.js';
import { application } from '../src/server.js';
import { ReplyStore } from '../src/replies/store.js';
import { ContextStore } from '../src/replies/context-store.js';
import { runWorker } from '../src/runtime/worker.js';
import { sealRecipient } from '../src/campaigns/store.js';
import { releaseUnusedTransportSlot } from '../src/mailboxes/transport-slots.js';
import { encryptContent } from '../src/replies/crypto.js';
import { seedCapacity } from './capacity-fixture.js';
export async function runF11ContextIntegration(t:TestContext){
 const config={...loadConfig(),dispatchMode:'local_test' as const},pool=createPool(config.databaseUrl);
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'n7f11_a8');
 await migrate(pool);await migrate(pool);assert.equal(await ready(pool),true);
 const lease=JSON.parse(await readFile(process.env.N7_DB_OWNERSHIP_LEASE!,'utf8'));assert.equal(lease.database,'n7f11_a8');assert.equal(lease.owner_role,(await pool.query('SELECT current_user AS role')).rows[0].role);
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 const tenant=randomUUID(),foreign=randomUUID(),account=randomUUID(),now=new Date();let mailbox='',job='',enrollment='',message='';
 const store=new ReplyStore(pool,config.credentialKeyring,{clock:()=>now}),context=new ContextStore(pool,config.credentialKeyring);
 async function assertResetOwnership(){
  const lease=JSON.parse(await readFile(process.env.N7_DB_OWNERSHIP_LEASE!,'utf8'));
  const identity=(await pool.query("SELECT current_database() AS db,current_user AS role,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner")).rows[0];
  assert.equal(identity.db,'n7f11_a8');assert.equal(lease.database,identity.db);assert.equal(identity.role,lease.owner_role);assert.equal(identity.owner,lease.owner_role);
  assert.equal((await pool.query('SELECT count(*) AS n FROM tenant WHERE id<>ALL($1::uuid[])',[[tenant,foreign]])).rows[0].n,'0','no foreign tenant reset');
 }
 async function setup(){
  await assertResetOwnership();
  assert.equal((await pool.query('SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL')).rows[0].n,'0');assert.equal((await pool.query("SELECT count(*) AS n FROM runtime_due WHERE state='claimed'")).rows[0].n,'0');
  await pool.query('TRUNCATE tenant,auth_bucket CASCADE');
  await pool.query("INSERT INTO transport_operation(protocol,slot,header_reserved) VALUES('smtp',1,false),('smtp',2,false),('imap',1,false),('imap',2,false),('imap',3,false),('imap',4,true) ON CONFLICT DO NOTHING");
  await pool.query('INSERT INTO tenant(id) VALUES($1),($2)',[tenant,foreign]);await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)',[account,tenant,'f11@example.test','fixture']);
  mailbox=(await app.mailboxes.save(tenant,{label:'F11',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'synthetic',smtpPassword:'synthetic',imapUsername:'synthetic',imapPassword:'synthetic'})).id;
  await pool.query("UPDATE mailbox SET state='verified_test'");await seedCapacity(pool,new Date());
  const actor={tenant_id:tenant,account_id:account};const campaign=await app.consents.campaign(actor,{steps:[{subject:'First',body:'Fixture',delayHours:24},{subject:'Next',body:'Fixture',delayHours:24}],recipients:[{address:'reply@example.test',fields:{}}]});
  await app.consents.act(actor,mailbox,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});await app.campaigns.start(actor,campaign.id,{mailboxIds:[mailbox]},now);
  const j=(await pool.query("UPDATE send_job SET state='submitted',message_id='<f11-'||id::text||'@example.test>' WHERE step=0 RETURNING *")).rows[0];job=j.id;enrollment=j.enrollment_id;message=j.message_id;
 }
 const provenance:'local_fixture'|'imap_headers'='local_fixture';
 const run=async(v:string)=>store.capture(tenant,mailbox,{uidvalidity:v,uidNext:2,observedAt:now,provenance});
 async function page(v:string,sender='reply@example.test') {const r=await run(v);return store.page(tenant,mailbox,{runId:r.runId,attempt:r.attempt,uidvalidity:v,expectedCursor:0,coveredThrough:1,kind:'scan',startedAt:now,completedAt:now,headers:[{uid:1,from:sender,references:[message],messageId:'<reused@example.test>'}]});}
 try {
  await setup();
  await t.test('stop and intent rollback together, replay creates no second physical intent',async()=>{
   const r=await run('1');const crashing=new ReplyStore(pool,config.credentialKeyring,{clock:()=>now,beforeCommit:async()=>{throw new Error('crash');}});
   const input={runId:r.runId,attempt:r.attempt,uidvalidity:'1',expectedCursor:0,coveredThrough:1,kind:'scan' as const,startedAt:now,completedAt:now,headers:[{uid:1,from:'reply@example.test',references:[message]}]};
   await assert.rejects(crashing.page(tenant,mailbox,input),/crash/);assert.equal((await pool.query('SELECT count(*) FROM incoming_ai_event')).rows[0].count,'0');assert.equal((await pool.query('SELECT state FROM enrollment WHERE id=$1',[enrollment])).rows[0].state,'active');
   const results=await Promise.allSettled([store.page(tenant,mailbox,input),store.page(tenant,mailbox,input)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const event=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0];assert.equal(event.root_job_id,job);assert.equal(event.enrollment_id,enrollment);assert.equal(event.capture_state,'pending');assert.equal(event.arrival_at,null);assert.equal(event.eligible_at_arrival,null);
   assert.equal((await pool.query('SELECT state FROM enrollment WHERE id=$1',[enrollment])).rows[0].state,'replied');assert.equal((await pool.query('SELECT state FROM send_job WHERE step=1')).rows[0].state,'cancelled');
   await assert.rejects(store.page(tenant,mailbox,input));assert.equal((await pool.query('SELECT count(*) FROM incoming_ai_event')).rows[0].count,'1');
  });
  await t.test('wrong sender receives no intent; UID generation remains separate from semantic identity',async()=>{
   await page('2','wrong@example.test');assert.equal((await pool.query('SELECT count(*) FROM incoming_ai_event')).rows[0].count,'1');await page('3');assert.equal((await pool.query('SELECT count(*) FROM incoming_ai_event')).rows[0].count,'2');
   // Content reconciliation remains closed until the authenticated transport slice.
   assert.equal((await pool.query('SELECT count(DISTINCT semantic_event_id) FROM incoming_ai_event')).rows[0].count,'2');
   const pending=(await pool.query("SELECT * FROM incoming_ai_event WHERE uidvalidity='3'")).rows[0];await page('2','wrong@example.test');await assert.rejects(context.claim(tenant,pending.id));await page('3');
   const refreshed=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[pending.id])).rows[0];assert.equal(refreshed.origin_run_id,pending.origin_run_id);assert.notEqual(refreshed.authenticated_run_id,pending.authenticated_run_id);assert.equal(refreshed.generation, String(Number(pending.generation)+1));assert.deepEqual(refreshed.expires_at,pending.expires_at);assert.deepEqual(refreshed.metadata_expires_at,pending.metadata_expires_at);assert.equal(refreshed.semantic_event_id,pending.semantic_event_id);
   await pool.query("UPDATE incoming_ai_event SET capture_phase='text',phase_metadata=$2,phase_revision='stale',phase_mailbox_revision='stale' WHERE id=$1",[pending.id,{synthetic:'stale encrypted-phase sentinel'}]);await page('2','wrong@example.test');await page('3');const freshPhase=(await pool.query('SELECT capture_phase,phase_metadata,expires_at FROM incoming_ai_event WHERE id=$1',[pending.id])).rows[0];assert.equal(freshPhase.capture_phase,'metadata');assert.equal(freshPhase.phase_metadata,null);assert.deepEqual(freshPhase.expires_at,pending.expires_at);
   await assert.rejects(context.claim(tenant,pending.id));

  });
  await t.test('tenant reads deny; ready nonterminal; expiry denies before idempotent concurrent purge',async()=>{
   const e=(await pool.query('SELECT * FROM incoming_ai_event ORDER BY created_at,id LIMIT 1')).rows[0],body='N7_BODY_CANARY_F11';
   const envelope=encryptContent([body],{tenant,mailbox,event:e.id,bindingVersion:1},config.credentialKeyring);
   await pool.query("UPDATE incoming_ai_event SET capture_state='ready',content_envelope=$2,message_bytes=ARRAY[18],body_bytes=18,thread_message_count=1,captured_at=now() WHERE id=$1",[e.id,envelope]);
   assert.ok(!JSON.stringify((await pool.query('SELECT row_to_json(e) AS value FROM incoming_ai_event e WHERE id=$1',[e.id])).rows).includes(body));
   assert.deepEqual(await context.readContext(tenant,e.id),[body]);await assert.rejects(context.readContext(foreign,e.id));assert.equal((await pool.query('SELECT terminal_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0].terminal_at,null);
   await context.markTerminal(tenant,e.id);const first=(await pool.query('SELECT terminal_at,expires_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0];await context.markTerminal(tenant,e.id);assert.deepEqual((await pool.query('SELECT terminal_at,expires_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0],first);
   await pool.query("UPDATE incoming_ai_event SET created_at=now()-interval '8 days',metadata_expires_at=now()+interval '22 days',terminal_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[e.id]);await assert.rejects(context.readContext(tenant,e.id));
   const results=await Promise.all([context.purgeExpired(),new ContextStore(pool,config.credentialKeyring).purgeExpired()]);assert.equal(results.reduce((a,r)=>a+r.contentPurged,0),1);assert.equal((await pool.query('SELECT content_envelope FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0].content_envelope,null);assert.equal((await context.purgeExpired()).contentPurged,0);
   await pool.query("UPDATE incoming_ai_event SET created_at=now()-interval '31 days',expires_at=now()-interval '25 days',metadata_expires_at=now()-interval '1 day' WHERE id=$1",[e.id]);assert.equal((await context.purgeExpired()).metadataPurged,1);
  });
  await t.test('fresh full SQL install through v16 in transaction-isolated schema',async()=>{
   const c=await pool.connect(),schema='f11_'+randomUUID().replaceAll('-','');
   try{await c.query('BEGIN');await c.query('CREATE SCHEMA '+schema);await c.query('SET LOCAL search_path TO '+schema);
    const files=['001-init','002-mailboxes-consent','003-dispatch','004-claim-order','005-submission','006-replies','007-reply-tail-horizon','008-suppression-fixture','009-poll-owner','010-billing','011-evidence','012-connected-capacity','013-live-diagnostics','014-live-transport','015-durable-runtime','016-inbound-context'];
    for(const file of files)await c.query(await readFile(new URL('../db/'+file+'.sql',import.meta.url),'utf8'));
    assert.equal((await c.query('SELECT count(*) FROM schema_migration')).rows[0].count,'16');assert.equal((await c.query('SELECT count(*) FROM incoming_ai_event')).rows[0].count,'0');await c.query('ROLLBACK');
   }finally{c.release();}
  });
  await t.test('schema rejects NULL/oversize content and cross tenant root; migration rollback preserves rows',async()=>{
   const e=(await pool.query('SELECT * FROM incoming_ai_event LIMIT 1')).rows[0];
   await assert.rejects(pool.query("UPDATE incoming_ai_event SET capture_state='ready',content_envelope='{}',message_bytes=NULL,body_bytes=NULL,thread_message_count=NULL WHERE id=$1",[e.id]));
   await assert.rejects(pool.query("UPDATE incoming_ai_event SET tenant_id=$2 WHERE id=$1",[e.id,foreign]));
   const c=await pool.connect();try{await c.query('BEGIN');await c.query('DROP TABLE incoming_ai_event');await c.query('DROP INDEX send_job_context_ownership');await c.query('DELETE FROM schema_migration WHERE version=16');await c.query(await readFile(new URL('../db/016-inbound-context.sql',import.meta.url),'utf8'));await assert.rejects(c.query('SELECT missing_f11_column FROM incoming_ai_event'));await c.query('ROLLBACK');}finally{c.release();}
   assert.equal(await ready(pool),true);assert.equal((await pool.query('SELECT count(*) FROM incoming_ai_event')).rows[0].count,'1');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[job])).rows[0].state,'submitted');
  });
  await t.test('ambiguous authenticated own roots preserve stops and hold without content authority',async()=>{
   const other=randomUUID();await pool.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,scope,campaign_id,state,enrollment_id,campaign_version,step,kind,message_id)
    SELECT $2,tenant_id,mailbox_id,scope,campaign_id,'submitted',enrollment_id,campaign_version,99,'initial','<ambiguous@example.test>' FROM send_job WHERE id=$1`,[job,other]);
   const r=await run('4');await store.page(tenant,mailbox,{runId:r.runId,attempt:r.attempt,uidvalidity:'4',expectedCursor:0,coveredThrough:1,kind:'scan',startedAt:now,completedAt:now,headers:[{uid:1,from:'reply@example.test',references:[message,'<ambiguous@example.test>']}]});
   const e=(await pool.query("SELECT * FROM incoming_ai_event WHERE uidvalidity='4'")).rows[0];assert.equal(e.capture_state,'held');assert.equal(e.root_job_id,null);assert.equal(e.content_envelope,null);assert.equal(e.enrollment_id,null);assert.equal((await pool.query('SELECT state FROM enrollment WHERE id=$1',[enrollment])).rows[0].state,'replied');await assert.rejects(context.readContext(tenant,e.id));
  });
  await t.test('normal and startup maintenance physically purge encrypted copies without renewing retention',async()=>{
   await setup();await page('71');
   const e=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0],phase=encryptContent(['PRIVATE_PHASE_CANARY'],{tenant,mailbox,event:e.id,bindingVersion:1},config.credentialKeyring);
   await pool.query("UPDATE incoming_ai_event SET capture_state='ready',content_envelope=$2,phase_metadata=$2,message_bytes=ARRAY[20],body_bytes=20,thread_message_count=1,created_at=statement_timestamp()-interval '6 days',terminal_at=statement_timestamp()-interval '1 day 1 second',expires_at=statement_timestamp()-interval '1 second',metadata_expires_at=statement_timestamp()+interval '21 days' WHERE id=$1",[e.id,phase]);
   const before=(await pool.query('SELECT terminal_at,expires_at,metadata_expires_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0];
   await assert.rejects(new ContextStore(pool,{...config.credentialKeyring,keys:new Map()}).readContext(tenant,e.id),/context_unavailable/,'expired read rejects before decrypt even with unavailable keys');
   const lag=await context.purgeExpired(1);assert.equal(lag.overdueBefore,1);assert.ok(lag.oldestLagSeconds>=1);
   // Restore expired encrypted copies to exercise the actual normal worker startup composition.
   await pool.query("UPDATE incoming_ai_event SET capture_state='ready',content_envelope=$2,phase_metadata=$2,message_bytes=ARRAY[20],body_bytes=20,thread_message_count=1 WHERE id=$1",[e.id,phase]);
   await runWorker(pool,{...config,pollMode:'disabled',dispatchMode:'disabled'},new AbortController().signal,true);
   let after=(await pool.query('SELECT capture_state,content_envelope,phase_metadata,terminal_at,expires_at,metadata_expires_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0];assert.equal(after.capture_state,'purged');assert.equal(after.content_envelope,null);assert.equal(after.phase_metadata,null);assert.deepEqual({terminal_at:after.terminal_at,expires_at:after.expires_at,metadata_expires_at:after.metadata_expires_at},before);
   await pool.query("UPDATE incoming_ai_event SET capture_state='ready',content_envelope=$2,phase_metadata=$2,message_bytes=ARRAY[20],body_bytes=20,thread_message_count=1 WHERE id=$1",[e.id,phase]);
   const abort=new AbortController();let ticks=0;
   await runRuntime(new RuntimeStore(pool),{maintenance:async()=>{ticks++;if(ticks===1)return;await context.purgeExpired(100);abort.abort();},poll:async()=>({reason:'authority_denied'}),pool:async()=>({}),dispatch:async()=>({})},abort.signal);
   assert.equal(ticks,2);after=(await pool.query('SELECT content_envelope,phase_metadata,expires_at,terminal_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0];assert.equal(after.content_envelope,null);assert.equal(after.phase_metadata,null);assert.deepEqual(after.expires_at,before.expires_at);assert.deepEqual(after.terminal_at,before.terminal_at);
   await runWorker(pool,{...config,pollMode:'disabled',dispatchMode:'disabled'},new AbortController().signal,true);assert.equal((await pool.query('SELECT count(*) FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0].count,'1','metadata survives until 30-day deadline');
  });
  await t.test('current authority mutations deny preIO and real native result commit',async()=>{
   const token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
   const cases=['body_revoked','headers_revoked','grant_revoked','grant_expired','config','mailbox_revision','rescan_incomplete','poll_incomplete','poll_completed','source','uid','uidvalidity','run','attempt','root','recipient','owner','generation'];
   for(const boundary of ['preIO','resultcommit','textresultcommit','finitefault'])for(const mutation of boundary==='finitefault'?['one_closed_socket']:cases){
    await setup();let live={...config,pollMode:'live_provider' as const};
    const f=await bodyFixture({... (boundary==='finitefault'?{bodyFaults:1,phaseDelayMs:2800}:{}),headers:Buffer.from(`From: reply@example.test\r\nMessage-ID: <mutation@example.test>\r\nReferences: ${message}\r\n\r\n`)}),runtime=new RuntimeStore(pool,(c,t,m)=>authorizeTransport(c,live,t,m,'imap_headers'),live);
    let admission:import('../src/replies/context-store.js').CaptureAdmission|undefined;
    try{
     await publishTransportGrant(pool,live,token,tenant,mailbox,'0',{scope:'transport',tenant,mailbox,capabilities:['imap_headers','imap_body'],smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()});await runtime.maintenance();
     for(let n=0;n<8&&!admission;n++){const claim=await runtime.claim('poll');assert.ok(claim);const slot=runtime.pollAdmission(claim)!.slot!;const result=await new PollWorker(pool,config.credentialKeyring,'live_provider',new LiveReplyAdapter(pool,live,f.fixture,slot)).quantum(tenant,mailbox,runtime.guard(claim),new AbortController().signal);await runtime.finish(claim,'ready',result.state==='complete');admission=runtime.takeCaptureAdmission(claim);}
     assert.ok(admission);const original=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[admission.identity.event])).rows[0];
     if(boundary==='finitefault'){
      const adapter=new LiveReplyAdapter(pool,live,f.fixture);assert.equal(await context.quantum(adapter,live,new AbortController().signal,admission),true);
      const failed=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[admission.identity.event])).rows[0];assert.equal(failed.capture_state,'pending');assert.deepEqual(failed.window_end,original.window_end);assert.deepEqual(failed.attempt_deadline,original.attempt_deadline);assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
      await new Promise(r=>setTimeout(r,1050));await context.quantum(adapter,live,new AbortController().signal);await context.quantum(adapter,live,new AbortController().signal);
      const ready=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[admission.identity.event])).rows[0];assert.equal(ready.capture_state,'ready');assert.deepEqual(ready.window_end,original.window_end);assert.deepEqual(ready.attempt_deadline,original.attempt_deadline);assert.ok(ready.captured_at<ready.window_end);const fault=f.wire.find(e=>e.phase==='fault_injected')!,closed=f.wire.find(e=>e.connection===fault.connection&&e.phase==='socket_close')!;assert.ok(closed.monotonicMs>=fault.monotonicMs);assert.equal(f.wire.filter(e=>e.phase==='fault_injected').length,1);assert.equal(f.wire.filter(e=>e.phase==='phase_response').length,2);assert.ok(f.wire.filter(e=>e.phase==='phase_start').every(e=>e.monotonicMs>closed.monotonicMs));assert.equal(f.sockets.size,0);console.info(JSON.stringify({witness:'finite_native_fault_recovery',windowEnd:ready.window_end,attemptDeadline:ready.attempt_deadline,ready:true,wire:f.wire}));continue;
     }
     let proof:object|undefined;if(boundary==='resultcommit')proof=await new LiveReplyAdapter(pool,live,f.fixture).captureBodyPhase(admission.identity,new AbortController().signal,admission.slot);
     const mutate=async()=>{
     if(mutation==='grant_revoked')await pool.query("UPDATE transport_grant SET state='revoked',scope=NULL WHERE mailbox_id=$1",[mailbox]);
     else if(mutation.endsWith('_revoked'))await pool.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{capabilities}',$2::jsonb) WHERE mailbox_id=$1",[mailbox,JSON.stringify([mutation==='body_revoked'?'imap_headers':'imap_body'])]);
     else if(mutation==='grant_expired')await pool.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb((clock_timestamp()-interval '1 second')::text)) WHERE mailbox_id=$1",[mailbox]);
     else if(mutation==='config')live={...live,providerAllowlist:new Map([['imap.gmail.com',29],['smtp.gmail.com',30]])};
     else if(mutation==='mailbox_revision')await pool.query('UPDATE mailbox SET transport_revision=transport_revision+1 WHERE id=$1',[mailbox]);
     else if(mutation==='poll_incomplete')await pool.query('UPDATE mailbox_poll SET scan_complete=false WHERE mailbox_id=$1',[mailbox]);
     else if(mutation==='poll_completed')await pool.query("UPDATE mailbox_poll SET completed_at=completed_at-interval '1 second' WHERE mailbox_id=$1",[mailbox]);
     else if(mutation==='rescan_incomplete')await pool.query("UPDATE reply_rescan SET state='rescan_incomplete' WHERE mailbox_id=$1",[mailbox]);
     else if(mutation==='root')await pool.query("UPDATE send_job SET message_id='<changed@example.test>' WHERE id=$1",[job]);
     else if(mutation==='recipient')await pool.query('UPDATE enrollment SET recipient_envelope=$2 WHERE id=$1',[enrollment,sealRecipient('changed@example.test',tenant,enrollment,config.credentialKeyring)]);
     else {const assignments:Record<string,string>={source:"source='local_fixture'",uid:'uid=2',uidvalidity:"uidvalidity='2'",run:'authenticated_run_id=gen_random_uuid()',attempt:'authenticated_attempt=authenticated_attempt+1',owner:'owner_id=gen_random_uuid()',generation:'generation=generation+1'};await pool.query('UPDATE incoming_ai_event SET '+assignments[mutation]+' WHERE id=$1',[admission!.identity.event]);}
     };
     if(boundary==='textresultcommit'){
      const adapter=new LiveReplyAdapter(pool,live,f.fixture);await context.quantum(adapter,live,new AbortController().signal,admission);
      const native=adapter.captureBodyPhase.bind(adapter);let rejected=false;
      adapter.captureBodyPhase=async(...args)=>{const realProof=await native(...args);await mutate();const commands=f.commands.length;let stale:unknown;await assert.rejects(async()=>{try{await context.commitNative(realProof,live);}catch(error){stale=error;throw error;}});rejected=true;assert.equal(f.commands.length,commands);throw stale;};
      await context.quantum(adapter,live,new AbortController().signal);assert.equal(rejected,true,'real native text proof reaches rejecting result fence');
     }else await mutate();
     const commands=f.commands.length;
     if(boundary==='preIO')await assert.rejects(new LiveReplyAdapter(pool,live,f.fixture).captureBodyPhase(admission.identity,new AbortController().signal,admission.slot));
     else if(boundary==='resultcommit')await assert.rejects(context.commitNative(proof!,live));
     assert.equal(f.commands.length,commands,'stale authority starts zero new IO');const stale=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[admission.identity.event])).rows[0];assert.notEqual(stale.capture_state,'ready');assert.equal(stale.content_envelope,null);if(boundary==='textresultcommit'){assert.equal(stale.capture_phase,'text');assert.ok(stale.phase_metadata);}else assert.equal(stale.phase_metadata,null);assert.deepEqual(stale.expires_at,original.expires_at);assert.deepEqual(stale.window_end,original.window_end);
     console.info(JSON.stringify({witness:'current_authority_mutation',boundary,mutation,newIO:0,ready:false}));
    }finally{if(admission)await releaseUnusedTransportSlot(pool,admission.slot);await f.close();await pool.query("UPDATE incoming_ai_event SET capture_state='held',owner_id=NULL,lease_until=NULL WHERE capture_state='claimed'");}
   }
  });
  await t.test('C1 actual native complete proof opens one window; two separate physical phases ready and no-body finish immediate',async()=>{
   await setup();
   const live={...config,pollMode:'live_provider' as const},f=await bodyFixture({phaseDelayMs:2800,headers:Buffer.from(`From: reply@example.test\r\nMessage-ID: <owned@example.test>\r\nReferences: ${message}\r\n\r\n`)}),token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
   const grant={scope:'transport',tenant,mailbox,capabilities:['imap_headers'],smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()};
   const runtime=new RuntimeStore(pool,(c,t,m)=>authorizeTransport(c,live,t,m,'imap_headers'),live);
   let firstCapture:import('../src/replies/context-store.js').CaptureAdmission|undefined;const outcomes:unknown[]=[];
   const complete=async()=>{for(let n=0;n<8;n++){
    const claim=await runtime.claim('poll');assert.ok(claim);const admission=runtime.pollAdmission(claim);assert.ok(admission?.slot);
    const native=new LiveReplyAdapter(pool,live,f.fixture,admission.slot),read=native.read.bind(native);
    native.read=async(...args)=>{try{const value=await read(...args);outcomes.push({boundary:'native_read',kind:value.kind,snapshot:value.snapshot,page:value.kind==='page'?{coveredThrough:value.page.coveredThrough,uids:value.page.headers.map(h=>h.uid)}:null});return value;}catch(error){outcomes.push({boundary:'native_read',errorName:error instanceof Error?error.name:'unknown',code:error instanceof Object&&'code' in error?error.code:null});throw error;}};
    const worker=new PollWorker(pool,config.credentialKeyring,'live_provider',native),empty=worker.store.completeNativeEmptyTail.bind(worker.store);
    worker.store.completeNativeEmptyTail=async(...args)=>{try{return await empty(...args);}catch(error){outcomes.push({boundary:'empty_tail_commit',errorName:error instanceof Error?error.name:'unknown',code:error instanceof Object&&'code' in error?error.code:null});throw error;}};
    const outcome=await worker.quantum(tenant,mailbox,runtime.guard(claim),new AbortController().signal);
    outcomes.push({utc:new Date().toISOString(),iteration:n,outcome,owner:claim.owner_id,generation:claim.generation,commands:f.commands.length});
    const turn=(await pool.query("SELECT service_seq FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[mailbox])).rows[0].service_seq;
    await runtime.finish(claim,'ready',outcome.state==='complete');firstCapture=runtime.takeCaptureAdmission(claim)??firstCapture;
    assert.equal((await pool.query("SELECT service_seq FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[mailbox])).rows[0].service_seq,turn);
    if(outcome.state==='complete')return;
   }throw new Error('native_poll_not_complete');};
   try{
    await publishTransportGrant(pool,live,token,tenant,mailbox,'0',grant);await runtime.maintenance();await complete();
    const pending=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0];assert.ok(pending);assert.equal(pending.window_end,null);
    const noBody=(await pool.query("SELECT due_at,next_check_at FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[mailbox])).rows[0];assert.deepEqual(noBody.due_at,noBody.next_check_at);assert.ok(noBody.due_at<=new Date());
    const adapter=new LiveReplyAdapter(pool,live,f.fixture),before=f.commands.length;assert.equal(await context.quantum(adapter,live,new AbortController().signal),false);assert.equal(f.commands.length,before);
    // Incremental completion omits UID1, so old pending UID requires actual native revalidation.
    await publishTransportGrant(pool,live,token,tenant,mailbox,'1',{...grant,capabilities:['imap_headers','imap_body']});
    const invalidated=(await pool.query('SELECT p.scan_complete,r.state,r.run_id FROM mailbox_poll p JOIN reply_rescan r ON r.mailbox_id=p.mailbox_id WHERE p.mailbox_id=$1',[mailbox])).rows[0];assert.equal(invalidated.scan_complete,false);assert.equal(invalidated.state,'complete');
    const fallbackStart=outcomes.length;await complete();
    const fallback=outcomes.slice(fallbackStart) as {boundary?:string;outcome?:{state:string}}[];
    assert.equal(fallback.find(x=>x.outcome)?.outcome?.state,'scanning','invalidated complete prefix must take finite native capture');
    assert.equal(fallback.some(x=>x.boundary==='empty_tail_commit'),false,'incomplete durable prefix never selects either shortcut');
    assert.ok(fallback.some(x=>x.boundary==='native_read'),'ordinary fallback reauthenticates old UID and reads native tail');
    const opened=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0];assert.notEqual(opened.authenticated_run_id,pending.authenticated_run_id);assert.equal(opened.origin_run_id,pending.origin_run_id);assert.equal(opened.window_end.getTime()-opened.window_start.getTime(),12000);assert.equal(opened.attempt_deadline.getTime()-opened.queue_eligible_at.getTime(),450000);assert.deepEqual(opened.queue_eligible_at,pending.queue_eligible_at);assert.deepEqual(opened.attempt_deadline,pending.attempt_deadline);
    assert.ok(f.commands.filter(c=>c==='a4 UID FETCH 1:1 (UID BODY.PEEK[HEADER.FIELDS (FROM MESSAGE-ID IN-REPLY-TO REFERENCES)])').length>=2);
    const pollBefore=(await pool.query('SELECT cursor_uid,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0];
    const metadataStarted=Date.now();
    const workers=[context,new ContextStore(pool,config.credentialKeyring)];const peer=(await app.mailboxes.save(tenant,{label:'Peer due',senderAddress:'peer@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'synthetic',smtpPassword:'synthetic',imapUsername:'synthetic',imapPassword:'synthetic'})).id;
    await pool.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[peer]);await pool.query("INSERT INTO capacity_lease(id,tenant_id,mailbox_id,state,expires_at) VALUES(gen_random_uuid(),$1,$2,'active',clock_timestamp()+interval '120 seconds')",[tenant,peer]);await runtime.maintenance();
    const peerDue=(await pool.query("SELECT due_at<=clock_timestamp() AS due FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[peer])).rows[0];assert.equal(peerDue.due,true);
    let bodySelectedWhilePeerDue=false,bodyCalls=0,peerTurns=0;
    await runRuntime(runtime,{body:async signal=>{const due=(await pool.query("SELECT due_at<=clock_timestamp() AS due FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[peer])).rows[0].due;const admission=firstCapture;firstCapture=undefined;const selected=await workers[bodyCalls++%2]!.quantum(adapter,live,signal,admission);if(selected&&due)bodySelectedWhilePeerDue=true;return selected;},poll:async claim=>{assert.equal(claim.mailbox_id,peer);peerTurns++;return {reason:'authority_denied'};},pool:async()=>({satisfied:true}),dispatch:async()=>({satisfied:false})},new AbortController().signal,true);
    assert.equal(bodySelectedWhilePeerDue,true,'existing IMAP lane selects legal body even while another mailbox is due');assert.ok(peerTurns>0);
    const metadataFinished=Date.now(),middle=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0];assert.equal(middle.capture_phase,'text');assert.ok(middle.phase_metadata);assert.equal(f.commands.filter(c=>c.includes('BODY.PEEK[TEXT]')).length,0);
    assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
    // Exercise the actual production continuation SELECT against real PG, with
    // every counterexample rolled back to the same authenticated pending text.
    const foreignBox=randomUUID();await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope) VALUES($1,$2,'Foreign HEADER counterproof','verified_test','{}')",[foreignBox,foreign]);
    const bodyBoxes=[randomUUID(),randomUUID(),randomUUID()];for(const id of bodyBoxes)await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope) VALUES($1,$2,'Occupied BODY counterproof','verified_test','{}')",[id,tenant]);
    const urgent=randomUUID();await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope) VALUES($1,$2,'Urgent counterproof','verified_test','{}')",[urgent,tenant]);
    await pool.query("INSERT INTO mailbox_poll(mailbox_id,scan_complete,completed_at) VALUES($1,true,clock_timestamp()-interval '30 seconds')",[urgent]);
    await pool.query("INSERT INTO runtime_due(tenant_id,mailbox_id,kind,due_at,next_check_at) VALUES($1,$2,'poll',clock_timestamp(),clock_timestamp())",[tenant,urgent]);
    await publishTransportGrant(pool,live,token,tenant,peer,'0',{...grant,mailbox:peer});
    await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp() WHERE mailbox_id=$1 AND kind='poll'",[peer]);
    await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp()+interval '1 minute' WHERE mailbox_id=$1 AND kind='poll'",[urgent]);
    const header=await runtime.claim('poll');assert.ok(header);assert.equal(header.mailbox_id,peer);const headerSlot=runtime.pollAdmission(header)!.slot!;assert.equal(header.owner_id,headerSlot.operation);
    await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp() WHERE mailbox_id=$1 AND kind='poll'",[urgent]);
    const text=await readFile(new URL('../src/replies/context-store.ts',import.meta.url),'utf8'),sql=/`(SELECT e\.\* FROM incoming_ai_event e JOIN reply_rescan r[\s\S]*?LIMIT 1)`/.exec(text)![1]!;
    const client=await pool.connect();try{await client.query('BEGIN');assert.equal((await client.query(sql)).rows[0]?.id,middle.id,'current known reserved header plus free BODY allows original text');
     for(const [name,mutation,args] of [
      ['legacy owner',"UPDATE runtime_due SET owner_id=gen_random_uuid() WHERE mailbox_id=$1 AND kind='poll'",[peer]],
      ['expired lease',"UPDATE runtime_due SET lease_until=clock_timestamp()-interval '1 second' WHERE mailbox_id=$1 AND kind='poll'",[peer]],
      ['blocked claim',"UPDATE runtime_due SET state='blocked',owner_id=NULL,lease_until=NULL WHERE mailbox_id=$1 AND kind='poll'",[peer]],
      ['cleanup',"UPDATE runtime_due SET reason='cleanup_blocked' WHERE mailbox_id=$1 AND kind='poll'",[peer]],
      ['incomplete',"UPDATE runtime_due SET reason='rescan_incomplete' WHERE mailbox_id=$1 AND kind='poll'",[peer]],
      ['foreign tenant',"UPDATE transport_operation SET tenant_id=$1,mailbox_id=$2 WHERE header_reserved",[foreign,foreignBox]],
      ['foreign mailbox',"UPDATE transport_operation SET mailbox_id=$1 WHERE header_reserved",[urgent]],
      ['UNKNOWN',"UPDATE transport_operation SET operation_purpose=NULL WHERE header_reserved",[]],
      ['nonheader',"UPDATE transport_operation SET operation_purpose='body' WHERE header_reserved",[]],
      ['reserved free',"UPDATE transport_operation SET operation=NULL,tenant_id=NULL,mailbox_id=NULL,owner_process=NULL,owner_host=NULL,expires_at=NULL,operation_purpose=NULL WHERE header_reserved",[]],
      ['no BODY slot',"UPDATE transport_operation SET operation=gen_random_uuid(),tenant_id=$1,mailbox_id=($2::uuid[])[slot],owner_process=gen_random_uuid(),owner_host='fixture',expires_at=clock_timestamp()+interval '1 minute',operation_purpose='body' WHERE protocol='imap' AND NOT header_reserved",[tenant,bodyBoxes]],
      ['local due',"UPDATE runtime_due SET due_at=clock_timestamp() WHERE mailbox_id=$1 AND kind='poll'",[mailbox]],
      ['local claimed',"UPDATE runtime_due SET state='claimed',owner_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 minute' WHERE mailbox_id=$1 AND kind='poll'",[mailbox]],
      ['local incomplete',"UPDATE mailbox_poll SET scan_complete=false WHERE mailbox_id=$1",[mailbox]],
     ] as [string,string,unknown[]][]){await client.query('SAVEPOINT counterproof');await client.query(mutation,args);assert.equal((await client.query(sql)).rowCount,0,name);
      const mutant=name==='legacy owner'?sql.replace('AND d.owner_id=t.operation ',''):name==='UNKNOWN'||name==='nonheader'?sql.replace("AND t.operation_purpose='header' ",''):name==='local due'||name==='local claimed'?sql.replace("AND NOT EXISTS(SELECT 1 FROM runtime_due d WHERE d.mailbox_id=e.mailbox_id AND d.kind='poll' AND (d.state='claimed' OR d.due_at<=clock_timestamp()))",''):null;
      if(mutant){assert.notEqual(mutant,sql);assert.equal((await client.query(mutant)).rowCount,1,'material mutant exposes '+name);console.info(JSON.stringify({materialMutant:name,rejectedByCounterproof:true}));}
      await client.query('ROLLBACK TO SAVEPOINT counterproof');}
    await client.query('SAVEPOINT unknown_owner');await assert.rejects(client.query("UPDATE transport_operation SET owner_process=NULL WHERE header_reserved"),/transport_operation_check1/);await client.query('ROLLBACK TO SAVEPOINT unknown_owner');
    }finally{await client.query('ROLLBACK');client.release();await runtime.cancel(header);await pool.query("UPDATE runtime_due SET next_check_at=clock_timestamp()+interval '1 minute' WHERE mailbox_id=ANY($1::uuid[]) AND kind='poll'",[[urgent,peer]]);}
    // Restart resumes this exact nonrenewable window from fresh encrypted server metadata.
    assert.equal(await new ContextStore(pool,config.credentialKeyring).quantum(new LiveReplyAdapter(pool,live,f.fixture),live,new AbortController().signal),true);
    const final=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0];assert.equal(final.capture_state,'ready');assert.equal(final.phase_metadata,null);assert.deepEqual(final.window_end,opened.window_end);assert.deepEqual(await context.readContext(tenant,final.id),['What does the product do?']);assert.equal(f.commands.filter(c=>c.includes('BODY.PEEK[TEXT]')).length,1);assert.deepEqual((await pool.query('SELECT cursor_uid,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0],pollBefore);
    console.info(JSON.stringify({witness:'native_two_phase_fixed_window',participants:1,ready:1,windowStart:opened.window_start.toISOString(),windowEnd:opened.window_end.toISOString(),metadataStarted,metadataFinished,textFinished:Date.now(),physicalPeak:f.peak,occupiedAfter:0,competingStores:2,competingProcesses:0}));
    assert.ok(Date.now()<opened.window_end.getTime());assert.ok(f.peak<=1);assert.equal(f.sockets.size,0);
    await new Promise(r=>setTimeout(r,Math.max(0,opened.window_end.getTime()-Date.now()+10)));
    await complete();const immediate=(await pool.query("SELECT due_at,next_check_at FROM runtime_due WHERE mailbox_id=$1 AND kind='poll'",[mailbox])).rows[0];assert.deepEqual(immediate.due_at,immediate.next_check_at);assert.ok(immediate.due_at<=new Date());assert.deepEqual((await pool.query('SELECT window_end FROM incoming_ai_event')).rows[0].window_end,opened.window_end);
   }finally{
    if(process.env.F10_EVIDENCE_DIR){
     const poll=(await pool.query('SELECT mailbox_id,uidvalidity,cursor_uid,scan_complete,completed_at,poll_owner FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows;
     const rescan=(await pool.query('SELECT mailbox_id,run_id,attempt,state,uidvalidity,cursor_uid,high_water,tail_high_water,provenance FROM reply_rescan WHERE mailbox_id=$1',[mailbox])).rows;
     const events=(await pool.query('SELECT id,capture_state,capture_phase,reason,owner_id,generation,source,uidvalidity,uid,authenticated_run_id,authenticated_attempt,window_start,window_end,window_revision,window_mailbox_revision,queue_eligible_at,attempt_deadline,terminal_at,expires_at FROM incoming_ai_event WHERE mailbox_id=$1',[mailbox])).rows;
     const grants=(await pool.query("SELECT mailbox_id,revision,state,scope->'capabilities' capabilities,scope->>'mailboxTransportRevision' mailbox_revision,scope->>'configFingerprint' fingerprint FROM transport_grant WHERE mailbox_id=$1",[mailbox])).rows;
     await writeFile(`${process.env.F10_EVIDENCE_DIR}/c1-native-diagnostic.json`,JSON.stringify({utc:new Date().toISOString(),outcomes,commands:f.commands,wire:f.wire,poll,rescan,events,grants,config:{pollMode:live.pollMode,fingerprint:transportFingerprint(live.providerAllowlist)},physical:(await pool.query('SELECT protocol,slot,operation,owner_process,mailbox_id FROM transport_operation WHERE operation IS NOT NULL')).rows},null,2)+'\n');
    }
    if(firstCapture)await runtime.disposeCaptureAdmission(firstCapture);await f.close();
   }
  });
  await t.test('fixed expired window holds phase bytes and establishes earliest terminal clock without renewal',async()=>{
   const e=(await pool.query('SELECT * FROM incoming_ai_event LIMIT 1')).rows[0];const phase=encryptContent([Buffer.from('PRIVATE_PHASE_CANARY').toString('base64')],{tenant,mailbox,event:e.id,bindingVersion:1},config.credentialKeyring);
   await pool.query("UPDATE incoming_ai_event SET capture_state='pending',content_envelope=NULL,message_bytes=NULL,body_bytes=NULL,thread_message_count=NULL,capture_phase='text',phase_metadata=$2 WHERE id=$1",[e.id,phase]);
   const first=await context.purgeExpired(),held=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0];assert.equal(held.capture_state,'held');assert.equal(held.reason,'capture_window_expired');assert.equal(held.phase_metadata,null);assert.deepEqual(held.terminal_at,e.window_end);assert.ok(held.expires_at<=new Date(e.window_end.getTime()+86400000));await context.purgeExpired();assert.deepEqual((await pool.query('SELECT terminal_at,expires_at FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0],{terminal_at:held.terminal_at,expires_at:held.expires_at});assert.ok(first.metadataPurged===0);
   await pool.query("UPDATE incoming_ai_event SET capture_phase='metadata' WHERE id=$1",[e.id]);
   await assert.rejects(pool.query("UPDATE incoming_ai_event SET capture_phase='text',phase_metadata=$2 WHERE id=$1",[e.id,phase]),/capture_window_expired/,'deferred COMMIT fence rejects a phase transition after actual absolute deadline');
   assert.equal((await pool.query('SELECT phase_metadata FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0].phase_metadata,null);
  });
  await t.test('durable native semantic replay, stop, complaint and failed stop transaction retain source-current coverage',async()=>{
   const live={...config,pollMode:'live_provider' as const},token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();
   for(const scenario of ['replay','stop','complaint','rollback']){
    await setup();const text=scenario==='replay'?'What does the product do?':scenario==='complaint'?'this is spam':'unsubscribe';
    const f=await bodyFixture({body:Buffer.from(text),headers:Buffer.from(`From: reply@example.test\r\nMessage-ID: <semantic@example.test>\r\nReferences: ${message}\r\n\r\n`)}),runtime=new RuntimeStore(pool,(c,t,m)=>authorizeTransport(c,live,t,m,'imap_headers'),live),adapter=new LiveReplyAdapter(pool,live,f.fixture);
    const capture=async()=>{let admission:import('../src/replies/context-store.js').CaptureAdmission|undefined;for(let n=0;n<12;n++){const claim=await runtime.claim('poll');assert.ok(claim);const slot=runtime.pollAdmission(claim)!.slot!;const worker=new PollWorker(pool,config.credentialKeyring,'live_provider',new LiveReplyAdapter(pool,live,f.fixture,slot));const result=await worker.quantum(tenant,mailbox,runtime.guard(claim),new AbortController().signal);await runtime.finish(claim,'ready',result.state==='complete');admission=runtime.takeCaptureAdmission(claim);if(admission)break;}assert.ok(admission);await new Promise<void>(r=>setImmediate(r));await context.quantum(adapter,live,new AbortController().signal,admission);return (await pool.query('SELECT * FROM incoming_ai_event ORDER BY created_at DESC,id DESC LIMIT 1')).rows[0];};
    try{
     await publishTransportGrant(pool,live,token,tenant,mailbox,'0',{scope:'transport',tenant,mailbox,capabilities:['imap_headers','imap_body'],smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()});await runtime.maintenance();let event=await capture();
     if(scenario==='rollback'){await pool.query(`CREATE FUNCTION f11_stop_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='stop' THEN RAISE EXCEPTION 'stop_commit_rejected'; END IF; RETURN NEW; END $$`);await pool.query('CREATE TRIGGER f11_stop_rollback BEFORE UPDATE ON incoming_ai_event FOR EACH ROW EXECUTE FUNCTION f11_stop_rollback()');await assert.rejects(context.quantum(adapter,live,new AbortController().signal),/stop_commit_rejected/);assert.equal((await pool.query('SELECT count(*) FROM suppression')).rows[0].count,'0');await pool.query('DROP TRIGGER f11_stop_rollback ON incoming_ai_event');await pool.query('DROP FUNCTION f11_stop_rollback()');await new Promise(r=>setTimeout(r,1050));}
     await context.quantum(adapter,live,new AbortController().signal);event=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[event.id])).rows[0];
     if(scenario==='replay'){assert.equal(event.capture_state,'ready');await new Promise(r=>setTimeout(r,Math.max(0,event.window_end.getTime()-Date.now()+10)));f.behavior.validity='2';const duplicate=await capture();await context.quantum(adapter,live,new AbortController().signal);const replay=(await pool.query('SELECT * FROM incoming_ai_event WHERE id=$1',[duplicate.id])).rows[0];assert.equal(replay.reason,'semantic_replay');assert.equal(replay.semantic_event_id,event.semantic_event_id);assert.ok(replay.expires_at<=event.expires_at);assert.equal(replay.content_envelope,null);}
     else{assert.equal(event.reason,scenario==='complaint'?'complaint':'stop');assert.equal(event.capture_state,'held');assert.equal(event.content_envelope,null);assert.equal((await pool.query('SELECT count(*) FROM suppression')).rows[0].count,'1');assert.ok(event.expires_at<=new Date(event.terminal_at.getTime()+86400000));}
     assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
    }finally{await pool.query('DROP TRIGGER IF EXISTS f11_stop_rollback ON incoming_ai_event');await pool.query('DROP FUNCTION IF EXISTS f11_stop_rollback()');await f.close();}
   }
  });
 }finally{await assertResetOwnership();await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.end();}
}
test('F11 real PG additive migration, stop-first authenticated intent and retention',runF11ContextIntegration);
