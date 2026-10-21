import { seedCapacity } from './capacity-fixture.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { DispatchSeams } from '../src/dispatch/seams.js';
import { SubmissionStore } from '../src/dispatch/submission.js';
import { ReplyStore,type Rescan } from '../src/replies/store.js';
import type { HeaderInput,PageInput } from '../src/replies/input.js';
function barrier() {
 let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>{entered=r;});const resume=new Promise<void>(r=>{release=r;});
 return {reached,release,wait:async()=>{entered();await resume;}};
}
async function waiting(pool:Pool) {
 for(let i=0;i<100;i++) {if(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].count)>0) return;await new Promise(r=>setTimeout(r,5));}
 assert.fail('production writer did not wait on actual lock');
}
test('F04a real PG reply matching, durable rescan, crash atomicity and stop serialization',async t=>{
 const config={...loadConfig(),dispatchMode:'local_test' as const},pool=createPool(config.databaseUrl);assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7f10_a2','only owned A15 fixture database may reset');await migrate(pool);await migrate(pool);
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 let now=new Date('2026-10-02T12:00:00Z'),tenant='',mailbox='',foreignTenant='',foreignMailbox='',otherMailbox='',calls=0;
 let sent:{id:string;enrollment_id:string;message_id:string}[]=[];
 const store=new ReplyStore(pool,config.credentialKeyring,{clock:()=>now}),seams=new DispatchSeams(pool);
 const submit=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){calls++;return {kind:'accepted'};}}});
 const raw={label:'fixture',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'N7_CREDENTIAL_CANARY_F04A',smtpPassword:'N7_CREDENTIAL_CANARY_F04A',imapUsername:'N7_CREDENTIAL_CANARY_F04A',imapPassword:'N7_CREDENTIAL_CANARY_F04A'};
 async function setup() {
  await pool.query('TRUNCATE tenant,auth_bucket CASCADE');now=new Date('2026-10-02T12:00:00Z');calls=0;
  tenant=randomUUID();foreignTenant=randomUUID();const account=randomUUID();
  await pool.query('INSERT INTO tenant(id) VALUES($1),($2)',[tenant,foreignTenant]);
  await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)',[account,tenant,'owner@example.test','fixture']);
  mailbox=(await app.mailboxes.save(tenant,raw)).id;otherMailbox=(await app.mailboxes.save(tenant,{...raw,senderAddress:'other@example.test'})).id;
  foreignMailbox=(await app.mailboxes.save(foreignTenant,{...raw,senderAddress:'foreign@example.test'})).id;
  await pool.query("UPDATE mailbox SET state='verified_test'");
   await seedCapacity(pool,now);
  const actor={tenant_id:tenant,account_id:account};
  const campaign=await app.consents.campaign(actor,{steps:[{subject:'First',body:'Fixture',delayHours:24},{subject:'Next',body:'Fixture',delayHours:24}],recipients:['r','s','t'].map(x=>({address:`${x}@example.test`,fields:{}}))});
  await app.consents.act(actor,mailbox,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});
  await app.campaigns.start(actor,campaign.id,{mailboxIds:[mailbox]},now);
  // Explicit trusted fixture: durable own sent headers, never a real SMTP claim.
  await pool.query("UPDATE send_job SET state='submitted',message_id='<own-'||id::text||'@example.test>' WHERE step=0");
  await pool.query('UPDATE send_job SET due_at=$1 WHERE step=1',[now]);
  sent=(await pool.query('SELECT j.id,j.enrollment_id,j.message_id FROM send_job j JOIN enrollment e ON e.id=j.enrollment_id WHERE j.step=0 ORDER BY e.recipient_hash')).rows;
  // Locate normalized addresses via decrypt through the same production recipient helper below.
  const {openRecipient}=await import('../src/campaigns/store.js');
  const entries=await Promise.all(sent.map(async j=>{const e=(await pool.query('SELECT recipient_envelope FROM enrollment WHERE id=$1',[j.enrollment_id])).rows[0];return {j,address:openRecipient(e.recipient_envelope,tenant,j.enrollment_id,config.credentialKeyring)};}));
  sent=entries.sort((a,b)=>a.address.localeCompare(b.address)).map(x=>x.j);
  await seams.recordPoll(tenant,mailbox,{completedAt:now,scanComplete:true,uidvalidity:'1',cursorUid:0});
 }
 const identity=(r:Rescan)=>({runId:r.runId,attempt:r.attempt,uidvalidity:r.uidvalidity,expectedCursor:r.cursor});
 const capture=(v='1',h=10)=>store.capture(tenant,mailbox,{uidvalidity:v,uidNext:h+1,observedAt:now,provenance:'local_fixture'});
 const page=(r:Rescan,through:number,headers:HeaderInput[]=[],...tail:[]|[kind:'tail',tailHighWater:number]):PageInput=>({...identity(r),coveredThrough:through,headers,...tail.length?{kind:'tail' as const,tailHighWater:tail[1]}:{kind:'scan' as const},startedAt:now,completedAt:now});
 const header=(uid:number,index=0,messageId?:string):HeaderInput=>({uid,from:`${['r','s','t'][index]}@example.test`,references:[sent[index]!.message_id],...(messageId===undefined?{}:{messageId})});
 const counts=async()=>({effects:Number((await pool.query('SELECT count(*) FROM reply_effect')).rows[0].count),observations:Number((await pool.query('SELECT count(*) FROM reply_observation')).rows[0].count),messages:Number((await pool.query('SELECT count(*) FROM reply_message')).rows[0].count)});
 try {
  await t.test('A1 exact sender + own tenant/mailbox references; no/malformed/reused IDs',async()=>{
   await setup();let run=await capture();
   const wrong=[{...header(1),from:'wrong@example.test'},{...header(2),references:['<unrelated@example.test>']}];
   await pool.query('UPDATE send_job SET mailbox_id=$1 WHERE id=$2',[otherMailbox,sent[1]!.id]);
   wrong.push(header(3,1));
   // A foreign tenant cannot pass even when the supplied reference is a real own send.
   const foreign=await store.capture(foreignTenant,foreignMailbox,{uidvalidity:'1',uidNext:2,observedAt:now,provenance:'local_fixture'});
   assert.equal((await store.page(foreignTenant,foreignMailbox,page(foreign,1,[header(1)]))).effects,0);
   assert.equal((await store.page(tenant,mailbox,page(run,3,wrong))).effects,0);
   await assert.rejects(store.page(foreignTenant,mailbox,page(run,4,[header(4)])));
   await pool.query('UPDATE send_job SET mailbox_id=$1 WHERE id=$2',[mailbox,sent[1]!.id]);run=(await store.status(tenant,mailbox))!;
   assert.equal((await store.page(tenant,mailbox,page(run,6,[header(4),header(5,1,'malformed'),header(6,2,'<shared@example.test>')]))).effects,3);
   run=await capture('2',10);
   assert.equal((await store.page(tenant,mailbox,page(run,10,[header(1,0,'<shared@example.test>'),header(2,1,'<changed@example.test>'),header(3,2)]))).effects,0);
   assert.equal((await counts()).effects,3);
   assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE step=1 AND state='cancelled'")).rows[0].count,'3');
   // Reused incoming ID cannot suppress a distinct new semantic effect.
   await setup();run=await capture();await store.page(tenant,mailbox,page(run,1,[header(1,0,'<shared@example.test>')]));run=(await store.status(tenant,mailbox))!;
   assert.equal((await store.page(tenant,mailbox,page(run,2,[header(2,1,'<shared@example.test>')]))).effects,1);assert.deepEqual(await counts(),{effects:2,observations:2,messages:1});
  });
  for(const boundary of ['before','after'] as const) await t.test(`A2/A3/A5 SC-US-006-3 R1/S0 → R1/S1 crash ${boundary} COMMIT`,async()=>{
   await setup();let run=await capture('1',1);await store.page(tenant,mailbox,page(run,1,[header(1)]));
   run=await capture('2',10);await store.page(tenant,mailbox,page(run,2));run=(await store.status(tenant,mailbox))!;
   const p=page(run,10,[header(4,0,'<changed@example.test>'),header(9,1)]);
   const crash=async()=>{throw new Error('injected_crash');};
   const crashing=new ReplyStore(pool,config.credentialKeyring,{clock:()=>now,...boundary==='before'?{beforeCommit:crash}:{afterCommit:crash}});
   await assert.rejects(crashing.page(tenant,mailbox,p),/injected_crash/);
   const resumed=await capture('2',999);assert.equal(resumed.runId,run.runId);assert.equal(resumed.highWater,10);assert.equal(resumed.cursor,boundary==='before'?2:10);
   assert.equal((await counts()).effects,boundary==='before'?1:2);assert.equal((await counts()).observations,boundary==='before'?1:3);
   assert.equal(await app.dispatch.claim(randomUUID(),now),null);
   if(boundary==='before') await store.page(tenant,mailbox,p);else await assert.rejects(store.page(tenant,mailbox,p));
   assert.equal((await counts()).effects,2);run=(await store.status(tenant,mailbox))!;
   assert.equal((await store.page(tenant,mailbox,page(run,10,[],'tail',10))).state,'complete');
   assert.ok(await app.dispatch.claim(randomUUID(),now));
  });
  await t.test('A2 concurrent duplicate page/effect has no partial writes or budget advance',async()=>{
   await setup();const run=await capture();const p=page(run,10,[header(2,0,'<same@example.test>'),header(9,0,'<different@example.test>')]);
   const results=await Promise.allSettled([store.page(tenant,mailbox,p),store.page(tenant,mailbox,p)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await counts(),{effects:1,observations:2,messages:2});
   const state=(await store.status(tenant,mailbox))!;assert.equal(state.pages,1);assert.equal(state.cursor,10);
  });
  await t.test('A3 sparse/expunged and initial empty trusted fixture coverage; no unquarantine',async()=>{
   await setup();await pool.query("UPDATE mailbox SET state='quarantined' WHERE id=$1",[mailbox]);let run=await capture('1',0);
   assert.equal((await store.page(tenant,mailbox,page(run,0,[],'tail',0))).state,'complete');
   assert.equal((await pool.query('SELECT state FROM mailbox WHERE id=$1',[mailbox])).rows[0].state,'quarantined');
   run=await capture('2',100000);await store.page(tenant,mailbox,page(run,90000,[]));run=(await store.status(tenant,mailbox))!;
   await store.page(tenant,mailbox,page(run,100000,[header(99999)]));run=(await store.status(tenant,mailbox))!;
   await store.page(tenant,mailbox,page(run,100005,[header(100005,1)],'tail',100005));assert.equal((await counts()).effects,2);
  });
  await t.test('A3 stale page/tail and second validity reset cannot complete current run',async()=>{
   await setup();const old=await capture('1',1);await store.page(tenant,mailbox,page(old,1));const oldTail=(await store.status(tenant,mailbox))!;
   const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const resetting=capture('2',10);await waiting(pool);const pending=store.page(tenant,mailbox,page(oldTail,1,[],'tail',1));const observed=pending.then(()=>false,()=>true);
   await blocker.query('COMMIT');blocker.release();const fresh=await resetting;assert.equal(await observed,true);
   await assert.rejects(store.page(tenant,mailbox,page(old,1,[header(1)])));await assert.rejects(store.failTail(tenant,mailbox,identity(oldTail)));
   assert.equal((await store.status(tenant,mailbox))!.runId,fresh.runId);assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);
  });
  await t.test('A4 exact twenty pages, explicit retry preserves H/run/cursor; crash restart same attempt',async()=>{
   await setup();let run=await capture('1',21);const id=run.runId;
   for(let i=1;i<=20;i++) {await store.page(tenant,mailbox,page(run,i));run=(await store.status(tenant,mailbox))!;}
   assert.equal(run.state,'rescan_incomplete');assert.equal(run.pages,20);assert.equal(run.cursor,20);assert.equal(await app.dispatch.claim(randomUUID(),now),null);
   await assert.rejects(store.page(tenant,mailbox,page(run,21,[header(21)])));
   assert.equal((await capture('1',999)).state,'rescan_incomplete');const prior=run;
   run=await store.retry(tenant,mailbox,identity(run));assert.equal(run.runId,id);assert.equal(run.highWater,21);assert.equal(run.cursor,20);assert.equal(run.pages,0);assert.equal(run.attempt,2);
   await assert.rejects(store.page(tenant,mailbox,page(prior,21)));await store.page(tenant,mailbox,page(run,21));run=(await store.status(tenant,mailbox))!;await store.page(tenant,mailbox,page(run,21,[],'tail',21));
   assert.ok(await app.dispatch.claim(randomUUID(),now));
  });
  await t.test('A4 post-lock exact120s, future clock, failed/future/slow tail fail closed',async()=>{
   await setup();let run=await capture();const base=now.getTime();now=new Date(base+119999);
   const p=page(run,10,[header(1)]);const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const pending=store.page(tenant,mailbox,p);await waiting(pool);now=new Date(base+120000);await blocker.query('COMMIT');blocker.release();
   assert.equal((await pending).state,'rescan_incomplete');assert.equal((await counts()).observations,0);assert.equal((await store.status(tenant,mailbox))!.cursor,0);
   run=await store.retry(tenant,mailbox,identity(run));now=new Date(now.getTime()-1);assert.equal((await store.page(tenant,mailbox,page(run,10))).state,'rescan_incomplete');
   for(const kind of ['failed','future','slow'] as const) {
    await setup();run=await capture('1',1);await store.page(tenant,mailbox,page(run,1));run=(await store.status(tenant,mailbox))!;
    if(kind==='failed') await store.failTail(tenant,mailbox,identity(run));else {const tail=page(run,1,[],'tail',1);if(kind==='future') tail.completedAt=new Date(now.getTime()+1);else tail.startedAt=new Date(now.getTime()-30001);assert.equal((await store.page(tenant,mailbox,tail)).state,'rescan_incomplete');}
    assert.equal(await app.dispatch.claim(randomUUID(),now),null);assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);
   }
  });
  await t.test('A4 successful tail completion timestamp samples actual post-lock clock',async()=>{
   await setup();let run=await capture('1',1);await store.page(tenant,mailbox,page(run,1));run=(await store.status(tenant,mailbox))!;
   const tail=page(run,1,[],'tail',1),base=now.getTime();const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const pending=store.page(tenant,mailbox,tail);await waiting(pool);now=new Date(base+1000);await blocker.query('COMMIT');blocker.release();assert.equal((await pending).state,'complete');
   assert.equal((await pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at.getTime(),now.getTime());
  });
  await t.test('R1 P1 101 tail headers: first100 stays paused S0 and dispatch/submission calls0; last coverage S1 completes',async()=>{
   await setup();
   const claimed=await app.dispatch.claim(randomUUID(),now);assert.ok(claimed);
   // The claimed recipient remains active until S at the final unread UID.
   const index=sent.findIndex(j=>j.enrollment_id===claimed.enrollment_id);assert.ok(index>=0);
   const prior=(await pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at;
   let run=await capture('1',10);await store.page(tenant,mailbox,page(run,10));run=(await store.status(tenant,mailbox))!;
   now=new Date(now.getTime()+1000);
   const headers=Array.from({length:100},(_,i)=>({uid:11+i,from:'unrelated@example.test'}));
   const prefix=await store.page(tenant,mailbox,page(run,110,headers,'tail',111));
   assert.notEqual(prefix.state,'complete');assert.equal(prefix.effects,0);assert.equal(prefix.cursor,110);
   assert.equal((await counts()).observations,100);assert.equal((await counts()).effects,0);
   const poll=(await pool.query('SELECT scan_complete,completed_at,cursor_uid FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0];
   assert.equal(poll.scan_complete,false);assert.equal(poll.completed_at.getTime(),prior.getTime());assert.equal(Number(poll.cursor_uid),110);
   assert.equal(await app.dispatch.claim(randomUUID(),now),null);
   assert.equal((await submit.submit(claimed.id,claimed.lease_owner)).calls,0);assert.equal(calls,0);
   run=(await store.status(tenant,mailbox))!;assert.equal(run.tailHighWater,111);assert.equal(run.highWater,10);
   const complete=await store.page(tenant,mailbox,page(run,111,[header(111,index)],'tail',111));
   assert.equal(complete.effects,1);assert.equal(complete.state,'complete');assert.equal((await counts()).observations,101);
   assert.equal((await pool.query('SELECT state FROM enrollment WHERE id=$1',[claimed.enrollment_id])).rows[0].state,'replied');
   const done=(await pool.query('SELECT scan_complete,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0];
   assert.equal(done.scan_complete,true);assert.equal(done.completed_at.getTime(),now.getTime());
   assert.ok(await app.dispatch.claim(randomUUID(),now));
   // Completed incremental capture gets a new run/horizon; old callbacks cannot replay.
   const incremental=await capture('1',120);assert.notEqual(incremental.runId,run.runId);assert.equal(incremental.cursor,111);assert.equal(incremental.tailHighWater,null);
   await assert.rejects(store.page(tenant,mailbox,page(run,111,[],'tail',111)));
  });
  await t.test('R1 empty/sparse tail prefix stays paused; immutable snapshot survives failure/retry and rejects changed horizon/epoch',async()=>{
   await setup();let run=await capture('1',10);await store.page(tenant,mailbox,page(run,10));run=(await store.status(tenant,mailbox))!;
   assert.notEqual((await store.page(tenant,mailbox,page(run,10,[],'tail',30))).state,'complete');run=(await store.status(tenant,mailbox))!;
   assert.equal(run.cursor,10);assert.equal(run.tailHighWater,30);
   await assert.rejects(store.page(tenant,mailbox,page(run,20,[],'tail',20)));
   await assert.rejects(store.page(tenant,mailbox,page(run,20,[],'tail',31)));
   await assert.rejects(store.page(tenant,mailbox,{...page(run,20,[],'tail',30),uidvalidity:'2'}));
   assert.notEqual((await store.page(tenant,mailbox,page(run,20,[{uid:15,from:'unrelated@example.test'}],'tail',30))).state,'complete');run=(await store.status(tenant,mailbox))!;
   assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);
   await store.failTail(tenant,mailbox,identity(run));const old=run;
   run=await store.retry(tenant,mailbox,identity(run));assert.equal(run.tailHighWater,30);assert.equal(run.cursor,20);assert.equal(run.highWater,10);assert.equal(run.runId,old.runId);
   assert.equal((await capture('1',999)).tailHighWater,30);
   await assert.rejects(store.page(tenant,mailbox,page(old,30,[],'tail',30)));
   await assert.rejects(store.page(tenant,mailbox,page(run,20,[],'tail',20)));
   assert.equal((await store.page(tenant,mailbox,page(run,30,[],'tail',30))).state,'complete');
   await setup();run=await capture('1',0);assert.equal((await store.page(tenant,mailbox,page(run,0,[],'tail',0))).state,'complete');
  });
  await t.test('A6 header display/body/credential canaries never enter durable reply data',async()=>{
   await setup();const run=await capture('1',1);
   const p=page(run,1,[{...header(1),from:'N7_HEADER_CANARY_F04A <r@example.test>'}]);
   assert.equal((await store.page(tenant,mailbox,p)).effects,1);
   const data=(await pool.query('SELECT row_to_json(r) AS data FROM reply_observation r UNION ALL SELECT row_to_json(r) FROM reply_message r UNION ALL SELECT row_to_json(r) FROM reply_effect r')).rows;
   for(const canary of ['N7_HEADER_CANARY_F04A','N7_BODY_CANARY_F04A','N7_CREDENTIAL_CANARY_F04A']) assert.ok(!JSON.stringify(data).includes(canary));
   const forbidden=page((await store.status(tenant,mailbox))!,2,[header(2,1)]);Object.assign(forbidden.headers[0]!,{body:'N7_BODY_CANARY_F04A'});
   await assert.rejects(store.page(tenant,mailbox,forbidden));assert.equal((await counts()).observations,1);
  });
  for(const ordering of ['before','after'] as const) await t.test(`A5 production ingestion stop ${ordering} final submitting: calls ${ordering==='before'?0:1}, later0`,async()=>{
   await setup();const job=await app.dispatch.claim(randomUUID(),now);assert.ok(job);
   const index=sent.findIndex(j=>j.enrollment_id===job.enrollment_id);assert.ok(index>=0);
   const gate=barrier();const dispatcher=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){calls++;return {kind:'accepted'};}},...ordering==='before'?{beforeFinal:gate.wait}:{afterCommit:gate.wait}});
   const pending=dispatcher.submit(job.id,job.lease_owner);await gate.reached;
   // Capture pauses poll but never cancels the already submitting job.
   const run=await capture('2',1);const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const writing=store.page(tenant,mailbox,page(run,1,[header(1,index)]));await waiting(pool);await blocker.query('COMMIT');blocker.release();assert.equal((await writing).effects,1);
   const covered=(await store.status(tenant,mailbox))!;await store.page(tenant,mailbox,page(covered,1,[],'tail',1));gate.release();const result=await pending;
   assert.equal(result.calls,ordering==='before'?0:1);assert.equal(calls,ordering==='before'?0:1);assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);
   assert.equal((await pool.query('SELECT state FROM enrollment WHERE id=$1',[job.enrollment_id])).rows[0].state,'replied');
   assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE enrollment_id=$1 AND state IN ('queued','claimed')",[job.enrollment_id])).rows[0].count,'0');
  });
 } finally {await pool.end();}
});
