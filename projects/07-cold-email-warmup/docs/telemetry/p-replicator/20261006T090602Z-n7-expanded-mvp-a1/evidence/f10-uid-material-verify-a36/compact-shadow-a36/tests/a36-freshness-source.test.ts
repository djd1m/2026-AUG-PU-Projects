import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { acquireTransportSlot,bindTransportChild,closedOwnerProof,type TransportSlot,releaseTransportSlot } from '../src/mailboxes/transport-slots.js';
import { authorizeTransport,publishTransportGrant } from '../src/mailboxes/transport-authority.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import { LiveReplyAdapter } from '../src/replies/adapter.js';
import { SubmissionStore } from '../src/dispatch/submission.js';
import { ReplyStore } from '../src/replies/store.js';
import { identity } from '../src/replies/worker.js';
import { transportFixture,transportInput,recoveryScenario,transportContext } from './f09-transport-fixture.js';
test('transport grants are separate scoped expiring authority',grantScenario);
test('final live submission preserves all eligibility fences',()=>finalFenceScenario());
test('UID reset crash and replay preserve atomic stop effects',atomicPageScenario);
test('expired occupied slots survive actual SIGSTOP120s until exact child exit',{timeout:160000},async()=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl),f=await transportFixture({stall:true});
 const children:{child:ReturnType<typeof fork>;slot:TransportSlot;exit:Promise<void>}[]=[];
 try{
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f10_a2');await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");
  const tenant=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
  for(const protocol of ['smtp','smtp','imap','imap','imap','imap'] as const){
   const mailbox=randomUUID();await pool.query("INSERT INTO mailbox(id,tenant_id,label,state,daily_limit,provider_limit) VALUES($1,$2,'f09','configured',10,30)",[mailbox,tenant]);
   const slot=await acquireTransportSlot(pool,protocol,tenant,mailbox),child=fork(new URL('./f09-slot-owner-fixture.ts',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc'],serialization:'advanced'});bindTransportChild(slot,child);
   const exit=new Promise<void>(r=>child.once('exit',()=>r()));children.push({child,slot,exit});
   const ready=new Promise<void>((resolve,reject)=>{child.once('message',()=>resolve());child.once('error',reject);});child.send({port:protocol==='smtp'?f.options!.smtp465:f.options!.imap993,ca:f.cert.cert,servername:protocol==='smtp'?'smtp.gmail.com':'imap.gmail.com'});await ready;
   await assert.rejects(acquireTransportSlot(pool,protocol,tenant,mailbox));assert.throws(()=>closedOwnerProof(slot),/closure_unproved/);
  }
  assert.equal(f.sockets.size,6);assert.equal(f.maxConnections,6);assert.equal(children.filter(x=>x.slot.protocol==='smtp').length,2);assert.equal(children.filter(x=>x.slot.protocol==='imap').length,4);
  const owner=children[0]!;assert.ok(owner.child.pid);process.kill(owner.child.pid,'SIGSTOP');const started=Date.now();await new Promise(r=>setTimeout(r,120100));assert.ok(Date.now()-started>=120000);
  assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE expires_at<clock_timestamp() AND operation IS NOT NULL')).rows[0].count,'6');
  for(const protocol of ['smtp','imap'] as const)await assert.rejects(acquireTransportSlot(pool,protocol,tenant,randomUUID()),/transport_busy/);assert.equal(f.sockets.size,6);
  owner.child.kill('SIGTERM');assert.throws(()=>closedOwnerProof(owner.slot),/closure_unproved/);await assert.rejects(acquireTransportSlot(pool,'smtp',tenant,owner.slot.mailbox));owner.child.kill('SIGKILL');await owner.exit;
  await new Promise(r=>setTimeout(r,50));assert.equal(f.sockets.size,5);const proof=closedOwnerProof(owner.slot);
  await pool.query("CREATE FUNCTION n7_f09_release_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'release_unavailable'; END $$");await pool.query('CREATE TRIGGER n7_f09_release_fail BEFORE UPDATE ON transport_operation FOR EACH ROW EXECUTE FUNCTION n7_f09_release_fail()');
  await assert.rejects(releaseTransportSlot(pool,proof));await assert.rejects(acquireTransportSlot(pool,'smtp',tenant,owner.slot.mailbox));await pool.query('DROP TRIGGER n7_f09_release_fail ON transport_operation');await pool.query('DROP FUNCTION n7_f09_release_fail()');assert.equal(await releaseTransportSlot(pool,proof),true);
  const replacement=await acquireTransportSlot(pool,'smtp',tenant,owner.slot.mailbox);assert.equal(await releaseTransportSlot(pool,closedOwnerProof(owner.slot)),false);assert.throws(()=>closedOwnerProof({...replacement}),/closure_unproved/);assert.throws(()=>closedOwnerProof({...replacement,ownerHost:'unreachable-other-host'}),/closure_unproved/);await releaseTransportSlot(pool,closedOwnerProof(replacement));
  for(const x of children.slice(1)){x.child.kill('SIGTERM');await x.exit;assert.equal(await releaseTransportSlot(pool,closedOwnerProof(x.slot)),true);}
  await new Promise(r=>setTimeout(r,50));assert.equal(f.sockets.size,0);assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{for(const x of children)if(x.child.exitCode===null&&x.child.signalCode===null)x.child.kill('SIGKILL');await f.close();await pool.query('DROP TRIGGER IF EXISTS n7_f09_release_fail ON transport_operation');await pool.query('DROP FUNCTION IF EXISTS n7_f09_release_fail()');await pool.end();}
});

async function grantScenario(){
 const c=await transportContext('campaign',false),f=await transportFixture();try{
  const tenant=c.actors[0]!.tenant_id,mailbox=c.boxes[0]!,authorize=()=>eligibilityTransaction(c.pool,client=>authorizeTransport(client,c.config,tenant,mailbox,'smtp_submit'));
  await assert.rejects(authorize(),/transport_denied/);await assert.rejects(new LiveReplyAdapter(c.pool,c.config,f.options).snapshot(tenant,mailbox),/transport_denied/);assert.equal(f.sockets.size,0);assert.equal(f.verbs.length,0);
  const {publishAuthority,configFingerprint}=await import('../src/mailboxes/diagnostic-authority.js');const rev=(await c.pool.query('SELECT authority_revision FROM diagnostic_authority')).rows[0].authority_revision;
  await publishAuthority(c.pool,rev,{scope:'diagnostics',tenant,mailbox,smtpHost:'smtp.gmail.com',smtpPort:465,imapHost:'imap.gmail.com',imapPort:993,configFingerprint:configFingerprint(c.config.providerAllowlist),expiresAt:new Date(Date.now()+60000).toISOString()});await assert.rejects(authorize(),/transport_denied/);
  await assert.rejects(publishTransportGrant(c.pool,c.config,'wrong',tenant,mailbox,'0',null),/operator_denied/);await assert.rejects(publishTransportGrant(c.pool,{...c.config,operatorTokenDigest:null},c.token,tenant,mailbox,'0',null),/operator_denied/);assert.equal((await c.pool.query('SELECT count(*) FROM transport_grant')).rows[0].count,'0');
  assert.equal(await c.publish(0,['imap_headers']),'1');await assert.rejects(authorize(),/transport_denied/);assert.equal(await c.publish(0),'2');const snapshot=await authorize();assert.equal(snapshot.revision,'2');
  const envelope=(await c.pool.query('SELECT credential_envelope FROM mailbox WHERE id=$1',[mailbox])).rows[0].credential_envelope;await c.pool.query('UPDATE mailbox SET credential_envelope=$2 WHERE id=$1',[mailbox,{...envelope,tag:Buffer.alloc(16).toString('base64')}]);await assert.rejects(new LiveReplyAdapter(c.pool,c.config,f.options).snapshot(tenant,mailbox));assert.equal(f.verbs.length,0);await c.pool.query('UPDATE mailbox SET credential_envelope=$2 WHERE id=$1',[mailbox,envelope]);
  const rows=(await c.pool.query('SELECT metadata,diagnostic_result FROM mailbox')).rows;assert.ok(!JSON.stringify(rows).includes('CREDENTIAL_'));assert.ok(!JSON.stringify(rows).includes(Buffer.from('\0'+transportInput.smtpUsername+'\0'+transportInput.smtpPassword).toString('base64')));
  await assert.rejects(publishTransportGrant(c.pool,c.config,c.token,tenant,mailbox,'1',snapshot.grant),/authority_changed/);await assert.rejects(eligibilityTransaction(c.pool,client=>authorizeTransport(client,c.config,c.actors[1]!.tenant_id,mailbox,'smtp_submit')),/transport_denied/);
  await assert.rejects(eligibilityTransaction(c.pool,client=>authorizeTransport(client,{...c.config,providerAllowlist:new Map([['smtp.gmail.com',29],['imap.gmail.com',30]])},tenant,mailbox,'smtp_submit')),/transport_denied/);
  await c.pool.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE mailbox_id=$1",[mailbox]);await assert.rejects(authorize(),/transport_denied/);await c.publish(0);
  await c.app.mailboxes.save(tenant,{...transportInput,senderAddress:'a@example.com'},mailbox);await assert.rejects(authorize(),/transport_denied/);assert.equal((await c.pool.query('SELECT transport_revision FROM mailbox WHERE id=$1',[mailbox])).rows[0].transport_revision,'1');
  await c.pool.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[mailbox]);await c.publish(0);const current=(await c.pool.query('SELECT revision FROM transport_grant WHERE mailbox_id=$1',[mailbox])).rows[0].revision;
  await assert.rejects(publishTransportGrant(c.pool,c.config,c.token,tenant,mailbox,current,{scope:'diagnostics'}),/invalid_transport_grant/);assert.equal((await c.pool.query('SELECT state FROM transport_grant WHERE mailbox_id=$1',[mailbox])).rows[0].state,'revoked');await assert.rejects(authorize());assert.equal(f.verbs.length,0);
 }finally{await f.close();await c.close();}
}
async function finalFenceScenario(only?:string[]){
 const cases=['senderConsent','recipientConsent','senderConsentPredicate','recipientConsentPredicate','senderCapacity','recipientCapacity','senderGrant','recipientGrant','grantExpiry','pollStale','providerCap','pause','suppression','beforeCommitAbort','revokeBefore','revokeAfter','accepted','finalRejected','preDataRetry','preDataPermanent','grantExpiryDuringLock','finalQueryAbort'] as const;
 for(const kind of cases){if(only&&!only.includes(kind))continue;const scope=['senderConsent','recipientConsent','senderConsentPredicate','recipientConsentPredicate','recipientCapacity','recipientGrant'].includes(kind)?'pool':'campaign',c=await transportContext(scope),behavior={...(kind==='finalRejected'?{finalCode:550}:{}),...(kind==='preDataRetry'?{mailCode:450}:{}),...(kind==='preDataPermanent'?{mailCode:550}:{})},f=await transportFixture(behavior);try{
  const job=await c.claim(),tenant=c.actors[0]!.tenant_id,mailbox=c.boxes[0]!,signal=new AbortController();
  const revoke=async(i:number)=>{const box=c.boxes[i]!,r=(await c.pool.query('SELECT revision FROM transport_grant WHERE mailbox_id=$1',[box])).rows[0].revision;await publishTransportGrant(c.pool,c.config,c.token,c.actors[i]!.tenant_id,box,r,null);};
  if(kind==='senderConsent'||kind==='recipientConsent'){const i=kind==='senderConsent'?0:1;await c.app.consents.act(c.actors[i]!,c.boxes[i]!,{scope:'pool',action:'revoke'});}
  if(kind==='senderConsentPredicate'||kind==='recipientConsentPredicate')await c.pool.query("UPDATE consent SET revoked_at=clock_timestamp() WHERE mailbox_id=$1 AND scope='pool'",[c.boxes[kind==='senderConsentPredicate'?0:1]]);
  if(kind==='senderCapacity'||kind==='recipientCapacity')await c.pool.query("UPDATE capacity_lease SET expires_at=clock_timestamp() WHERE mailbox_id=$1",[c.boxes[kind==='senderCapacity'?0:1]]);
  if(kind==='senderGrant')await revoke(0);if(kind==='recipientGrant')await revoke(1);
  if(kind==='grantExpiry')await c.pool.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE mailbox_id=$1",[mailbox]);
  if(kind==='pollStale')await c.pool.query("UPDATE mailbox_poll SET completed_at=clock_timestamp()-interval '60 seconds' WHERE mailbox_id=$1",[mailbox]);
  if(kind==='providerCap'){await c.pool.query('UPDATE mailbox SET provider_limit=1 WHERE id=$1',[mailbox]);await c.pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,scope,campaign_id,state,reserved_day) VALUES($1,$2,$3,'campaign',$4,'unknown',CURRENT_DATE)",[randomUUID(),tenant,mailbox,c.campaign.id]);}
  if(kind==='pause')await c.app.mailboxes.change(tenant,mailbox,{state:'paused'});
  if(kind==='suppression'){const {DispatchSeams}=await import('../src/dispatch/seams.js');const digest=(await c.pool.query('SELECT recipient_hash FROM enrollment WHERE id=$1',[job.enrollment_id])).rows[0].recipient_hash;await new DispatchSeams(c.pool).suppress(tenant,digest,'reply');}
  if(kind==='beforeCommitAbort')signal.abort();
  let clock=new Date();
  if(kind==='finalQueryAbort'){await c.pool.query("CREATE FUNCTION n7_f09_final_wait() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.1); RETURN NEW; END $$");await c.pool.query("CREATE TRIGGER n7_f09_final_wait BEFORE UPDATE ON send_job FOR EACH ROW WHEN (NEW.state='submitting') EXECUTE FUNCTION n7_f09_final_wait()");setTimeout(()=>signal.abort(),40);}
  if(kind==='grantExpiryDuringLock'){const blocker=await c.pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');await blocker.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb((clock_timestamp()+interval '80 milliseconds')::text)) WHERE mailbox_id=$1",[mailbox]);setTimeout(()=>{void blocker.query('COMMIT').finally(()=>blocker.release());},150);}
  const submit=new SubmissionStore(c.pool,c.config,{...(kind==='preDataRetry'?{clock:()=>clock}:{}),transportFixture:f.options,signal:signal.signal,...(kind==='revokeBefore'?{beforeFinal:()=>revoke(0)}:{}),...(kind==='revokeAfter'?{afterCommit:()=>revoke(0)}:{})});
  let result:{state:string;calls:number};try{result=await submit.submit(job.id,job.lease_owner);}catch{assert.ok(['beforeCommitAbort','finalQueryAbort'].includes(kind));result={state:'blocked',calls:0};}
  const allowed=['accepted','finalRejected','revokeAfter','preDataRetry','preDataPermanent'].includes(kind);assert.equal(result.calls,allowed?1:0,kind);assert.equal(f.verbs.filter(v=>v==='DATA').length,allowed&&!['preDataRetry','preDataPermanent'].includes(kind)?1:0,kind);
  if(kind==='preDataPermanent'){assert.equal(result.state,'cancelled');assert.equal((await c.pool.query('SELECT reserved_day FROM send_job WHERE id=$1',[job.id])).rows[0].reserved_day,null);}
  if(kind==='preDataRetry'){assert.equal(result.state,'queued');const first=(await c.pool.query('SELECT * FROM send_job WHERE id=$1',[job.id])).rows[0];assert.equal(first.due_at.getTime()-clock.getTime(),60000);behavior.mailCode=250;clock=new Date(clock.getTime()+60000);await c.refresh(clock);const retry=await c.claim(clock);assert.equal(retry.id,job.id);assert.equal((await submit.submit(retry.id,retry.lease_owner)).state,'submitted');assert.equal((await c.pool.query('SELECT message_id FROM send_job WHERE id=$1',[job.id])).rows[0].message_id,first.message_id);assert.equal(f.verbs.filter(v=>v==='DATA').length,1);}
  if(kind==='accepted'||kind==='revokeAfter'){assert.equal(result.state,'submitted');const receipt=(await c.pool.query('SELECT * FROM transport_receipt WHERE job_id=$1',[job.id])).rows[0];assert.equal(receipt.mode,'protocol_fixture');assert.match(receipt.message_id,/@example.com>$/);assert.equal((await c.pool.query('SELECT count(*) FROM local_test_message')).rows[0].count,'0');}
  if(kind==='finalRejected'){assert.equal(result.state,'cancelled');assert.equal((await c.pool.query('SELECT outcome FROM send_job WHERE id=$1',[job.id])).rows[0].outcome,'rejected_after_data');assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);}
  assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
 }finally{await c.pool.query('DROP TRIGGER IF EXISTS n7_f09_final_wait ON send_job');await c.pool.query('DROP FUNCTION IF EXISTS n7_f09_final_wait()');await f.close();await c.close();}}
}
async function atomicPageScenario(){
 const c=await transportContext(),f=await transportFixture();try{
  const job=await c.claim();await new SubmissionStore(c.pool,c.config,{transportFixture:f.options}).submit(job.id,job.lease_owner);const sent=(await c.pool.query('SELECT message_id,enrollment_id FROM send_job WHERE id=$1',[job.id])).rows[0],tenant=c.actors[0]!.tenant_id,mailbox=c.boxes[0]!;
  const store=new ReplyStore(c.pool,c.config.credentialKeyring);let run=await store.capture(tenant,mailbox,{uidvalidity:'1',uidNext:2,observedAt:new Date(),provenance:'imap_headers'});
  const fence=await new LiveReplyAdapter(c.pool,c.config,f.options).fence(tenant,mailbox);await c.publish(0);await assert.rejects(store.page(tenant,mailbox,{...identity(run),kind:'scan',coveredThrough:1,headers:[],startedAt:new Date(),completedAt:new Date()},fence),/stale_poll_owner/);assert.equal((await store.status(tenant,mailbox))!.cursor,0);
  const expiryFence=await new LiveReplyAdapter(c.pool,c.config,f.options).fence(tenant,mailbox);await c.pool.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE mailbox_id=$1",[mailbox]);await assert.rejects(store.page(tenant,mailbox,{...identity(run),kind:'scan',coveredThrough:1,headers:[],startedAt:new Date(),completedAt:new Date()},expiryFence),/transport_denied/);await c.publish(0);
  const page=()=>({...identity(run),kind:'scan' as const,coveredThrough:1,headers:[{uid:1,from:'b@example.com',references:[sent.message_id],messageId:'<same@example.com>'}],startedAt:new Date(),completedAt:new Date()});
  const crash=new ReplyStore(c.pool,c.config.credentialKeyring,{beforeCommit:async()=>{throw new Error('before_page_commit');}});await assert.rejects(crash.page(tenant,mailbox,page()),/before_page_commit/);assert.equal((await store.status(tenant,mailbox))!.cursor,0);assert.equal((await c.pool.query('SELECT count(*) FROM reply_observation')).rows[0].count,'0');assert.equal((await c.pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'0');
  const after=new ReplyStore(c.pool,c.config.credentialKeyring,{afterCommit:async()=>{throw new Error('after_page_commit');}});await assert.rejects(after.page(tenant,mailbox,page()),/after_page_commit/);assert.equal((await store.status(tenant,mailbox))!.cursor,1);assert.equal((await c.pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'1');await assert.rejects(store.page(tenant,mailbox,page()));
  run=await store.capture(tenant,mailbox,{uidvalidity:'2',uidNext:2,observedAt:new Date(),provenance:'imap_headers'});assert.equal((await c.pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);await store.page(tenant,mailbox,page());assert.equal((await c.pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'1');assert.equal((await c.pool.query('SELECT count(*) FROM reply_observation')).rows[0].count,'2');
 }finally{await f.close();await c.close();}await recoveryScenario();
}

test('independent capacity and consent predicates deny live transport',()=>finalFenceScenario(['senderCapacity','recipientCapacity','senderConsentPredicate','recipientConsentPredicate']));
test('expired slot age alone cannot replace its allocated identity',async()=>{const c=await transportContext();try{const first=await acquireTransportSlot(c.pool,'smtp',c.actors[0]!.tenant_id,c.boxes[0]!),second=await acquireTransportSlot(c.pool,'smtp',c.actors[1]!.tenant_id,c.boxes[1]!);await c.pool.query("UPDATE transport_operation SET expires_at=clock_timestamp()-interval '1 second' WHERE operation IS NOT NULL");const third=randomUUID();await c.pool.query("INSERT INTO mailbox(id,tenant_id,label,state,daily_limit,provider_limit) VALUES($1,$2,'third','configured',10,30)",[third,c.actors[0]!.tenant_id]);await assert.rejects(acquireTransportSlot(c.pool,'smtp',c.actors[0]!.tenant_id,third),/transport_busy/);await releaseTransportSlot(c.pool,closedOwnerProof(first));await releaseTransportSlot(c.pool,closedOwnerProof(second));}finally{await c.close();}});

test('native pool fixture uses canonical current UTC pair day and malformed initial keys stay denied',async()=>{
 const c=await transportContext('pool');try{
  const day=(await c.pool.query("SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
  const before=(await c.pool.query("SELECT id,pair_key FROM send_job WHERE scope='pool' AND kind='initial'")).rows[0];
  assert.equal(before.pair_key,[...c.boxes].sort().join(':')+':'+day,'fixture must follow canonical pool current-day identity');
  await c.pool.query('UPDATE send_job SET pair_key=$2 WHERE id=$1',[before.id,randomUUID()]);
  assert.equal(await c.app.dispatch.claim(),null,'malformed legacy key must fail current-day fence before live transport');
  const denied=(await c.pool.query('SELECT state,outcome FROM send_job WHERE id=$1',[before.id])).rows[0];assert.equal(denied.state,'cancelled');assert.equal(denied.outcome,'expired_pool_day');
 }finally{await c.close();}
});

test('full poll captures a reset between snapshot and read and incomplete entry performs no IO',async()=>{
 const {PollWorker}=await import('../src/replies/worker.js');const c=await transportContext(),behavior={uidvalidity:'1',uidNext:2,headers:[]},f=await transportFixture(behavior);try{
  const tenant=c.actors[0]!.tenant_id,mailbox=c.boxes[0]!,adapter=new LiveReplyAdapter(c.pool,c.config,f.options),snapshot=adapter.snapshot.bind(adapter);let snapshots=0;
  adapter.snapshot=async(...args)=>{const proof=await snapshot(...args);snapshots++;if(snapshots===1)behavior.uidvalidity='2';return proof;};
  const worker=new PollWorker(c.pool,c.config.credentialKeyring,'live_provider',adapter);
  const a36BeforeFresh=(await c.pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at.getTime();const a36Outcome=await worker.poll(tenant,mailbox);const a36AfterFresh=(await c.pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at.getTime();console.log('A36_FRESHNESS_COUNTS '+JSON.stringify({changed:a36AfterFresh!==a36BeforeFresh,deltaMs:a36AfterFresh-a36BeforeFresh}));assert.equal(a36AfterFresh,a36BeforeFresh,'reset capture never supplies completed_at freshness');console.log('A36_UID_COUNTS '+JSON.stringify({state:a36Outcome.state,snapshots,fetches:f.verbs.filter(v=>v==='UID').length}));assert.equal(a36Outcome.state,'scanning');assert.equal(snapshots,1);assert.equal(f.verbs.filter(v=>v==='UID').length,0);
  const reset=(await worker.store.status(tenant,mailbox))!;assert.equal(reset.uidvalidity,'2');assert.equal(reset.cursor,0);assert.equal(reset.tailHighWater,null);assert.equal((await c.pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);
  assert.equal((await worker.poll(tenant,mailbox)).state,'complete');
  const current=(await worker.store.status(tenant,mailbox))!;await c.pool.query("UPDATE reply_rescan SET state='rescan_incomplete' WHERE mailbox_id=$1",[mailbox]);const before=f.verbs.length;
  const a36Held=await worker.poll(tenant,mailbox);console.log('A36_HELD_COUNTS '+JSON.stringify({state:a36Held.state,additionalVerbs:f.verbs.length-before}));assert.equal(a36Held.state,'rescan_incomplete');assert.equal(f.verbs.length,before);assert.equal((await worker.store.status(tenant,mailbox))!.runId,current.runId);
 }finally{await f.close();await c.close();}
});

test('settled native UID reset proof cannot bypass runtime poll source run grant or mailbox fences',async()=>{
 const {RuntimeStore}=await import('../src/runtime/store.js');const {PollWorker,identity}=await import('../src/replies/worker.js');const {seedFixture}=await import('../src/replies/fixture.js');
 for(const fence of ['runtime','poll','source','run','grant','mailbox','expiry'] as const){
  const c=await transportContext(),f=await transportFixture({uidvalidity:'2',uidNext:2,headers:[]});try{
   const tenant=c.actors[0]!.tenant_id,mailbox=c.boxes[0]!;await c.pool.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[c.boxes[1]]);
   const runtime=new RuntimeStore(c.pool),adapter=new LiveReplyAdapter(c.pool,c.config,f.options),worker=new PollWorker(c.pool,c.config.credentialKeyring,'live_provider',adapter);await runtime.maintenance();
   let run=await worker.store.capture(tenant,mailbox,{uidvalidity:'1',uidNext:1,observedAt:new Date(),provenance:'imap_headers'});await worker.store.checkpointTail(tenant,mailbox,identity(run),{uidvalidity:'1',uidNext:1,observedAt:new Date(),provenance:'imap_headers'});
   const read=adapter.read.bind(adapter);adapter.read=async(...args)=>{const result=await read(...args);assert.equal(result.kind,'uidvalidity_changed');
    if(fence==='runtime')await c.pool.query("UPDATE runtime_due SET generation=generation+1 WHERE mailbox_id=$1 AND kind='poll'",[mailbox]);
    if(fence==='poll')await c.pool.query('UPDATE mailbox_poll SET poll_owner=$2 WHERE mailbox_id=$1',[mailbox,randomUUID()]);
    if(fence==='source')await seedFixture(c.pool,tenant,mailbox,{uidvalidity:'1',uidNext:1,headers:[]});
    if(fence==='run'){await worker.store.failTail(tenant,mailbox,identity(run));run=await worker.store.retry(tenant,mailbox,identity(run));}
    if(fence==='grant')await c.publish(0);
    if(fence==='mailbox')await c.pool.query('UPDATE mailbox SET transport_revision=transport_revision+1 WHERE id=$1',[mailbox]);
    if(fence==='expiry')await c.pool.query("UPDATE transport_grant SET scope=jsonb_set(scope,'{expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE mailbox_id=$1",[mailbox]);
    return result;};
   const claim=await runtime.claim('poll');assert.ok(claim);const outcome=await worker.quantum(tenant,mailbox,runtime.guard(claim),new AbortController().signal);assert.ok(['superseded','authority_denied'].includes(outcome.state),fence);
   const current=(await worker.store.status(tenant,mailbox))!;assert.equal(current.uidvalidity,'1',fence);assert.equal(current.runId,run.runId,fence);assert.equal(current.attempt,run.attempt,fence);assert.equal(current.cursor,0,fence);assert.equal(current.tailHighWater,0,fence);assert.equal(f.verbs.filter(v=>v==='UID').length,0);assert.equal((await c.pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
  }finally{await f.close();await c.close();}
 }
});
