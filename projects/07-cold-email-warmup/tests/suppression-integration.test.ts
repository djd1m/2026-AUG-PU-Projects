import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { newSession } from '../src/auth/session.js';
import { tokenHash } from '../src/dispatch/message.js';
import { DispatchSeams } from '../src/dispatch/seams.js';
import { SubmissionStore } from '../src/dispatch/submission.js';
import { FixtureAdapter,type ReplyAdapter } from '../src/replies/adapter.js';
import { seedFixture } from '../src/replies/fixture.js';
import { PollWorker,identity } from '../src/replies/worker.js';
function barrier() {
 let entered!:()=>void,release!:()=>void;const reached=new Promise<void>(r=>{entered=r;}),resume=new Promise<void>(r=>{release=r;});
 return {reached,release,wait:async()=>{entered();await resume;}};
}
async function waiting(pool:Pool) {
 for(let i=0;i<100;i++) {if(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].count)>0) return;await new Promise(r=>setTimeout(r,5));}
 assert.fail('writer did not wait on actual shared lock');
}
async function operatorCLI(args:string[]) {
 const child=spawn(process.execPath,['--import','tsx','src/replies/operator.ts',...args],{stdio:['ignore','pipe','pipe']});let output='';
 for await(const chunk of child.stdout) output+=chunk.toString();
 const exit=await new Promise<number|null>(r=>child.once('close',r));assert.equal(exit,0);assert.equal(output,'operator_action_complete\n');
}
test('F04B real PostgreSQL public stop and durable local operator polling',async t=>{
 const config={...loadConfig(),dispatchMode:'local_test' as const,pollMode:'local_test' as const},pool=createPool(config.databaseUrl);await migrate(pool);await migrate(pool);
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const address=app.server.address();assert.ok(address && typeof address==='object');const origin=`http://127.0.0.1:${address.port}`;
 const raw={label:'fixture',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'N7_CREDENTIAL_CANARY_F04B',smtpPassword:'N7_CREDENTIAL_CANARY_F04B',imapUsername:'N7_CREDENTIAL_CANARY_F04B',imapPassword:'N7_CREDENTIAL_CANARY_F04B'};
 let tenant='',mailbox='',foreignTenant='',foreignMailbox='',cookie='',now=new Date();
 let sent:{id:string;enrollment_id:string;message_id:string;recipient_hash:string}[]=[];
 const worker=()=>new PollWorker(pool,config.credentialKeyring,'local_test');
 async function setup() {
  await pool.query('TRUNCATE tenant,auth_bucket,public_stop_bucket CASCADE');now=new Date();tenant=randomUUID();foreignTenant=randomUUID();const account=randomUUID(),foreignAccount=randomUUID();
  await pool.query('INSERT INTO tenant(id) VALUES($1),($2)',[tenant,foreignTenant]);
  await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4),($5,$6,$7,$4)',[account,tenant,'owner@example.test','fixture',foreignAccount,foreignTenant,'foreign@example.test']);
  const session=newSession(config.sessionKey);cookie='n7_session='+session.token;
  await pool.query('INSERT INTO session(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[randomUUID(),account,session.digest,session.expiresAt]);
  mailbox=(await app.mailboxes.save(tenant,raw)).id;foreignMailbox=(await app.mailboxes.save(foreignTenant,{...raw,senderAddress:'foreign@example.test'})).id;
  await pool.query("UPDATE mailbox SET state='verified_test'");
  const actor={tenant_id:tenant,account_id:account};
  const campaign=await app.consents.campaign(actor,{steps:[{subject:'First',body:'Fixture',delayHours:24},{subject:'Next',body:'Fixture',delayHours:24}],recipients:['r','s','t'].map(x=>({address:`${x}@example.test`,fields:{}}))});
  await app.consents.act(actor,mailbox,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});
  await app.campaigns.start(actor,campaign.id,{mailboxIds:[mailbox]},now);
  await pool.query("UPDATE send_job SET state='submitted',message_id='<own-'||id::text||'@example.test>' WHERE step=0");await pool.query('UPDATE send_job SET due_at=$1 WHERE step=1',[now]);
  sent=(await pool.query('SELECT j.id,j.enrollment_id,j.message_id,e.recipient_hash FROM send_job j JOIN enrollment e ON e.id=j.enrollment_id WHERE step=0 ORDER BY j.id')).rows;
  await new DispatchSeams(pool).recordPoll(tenant,mailbox,{completedAt:now,scanComplete:true,uidvalidity:'1',cursorUid:0});
  await new DispatchSeams(pool).recordPoll(foreignTenant,foreignMailbox,{completedAt:now,scanComplete:true,uidvalidity:'1',cursorUid:0});
 }
 async function capability(index=0,expires=new Date(Date.now()+30*86400000)) {
  const token=randomBytes(32).toString('base64url'),j=sent[index]!;
  await pool.query('INSERT INTO unsubscribe_token(token_hash,job_id,tenant_id,mailbox_id,enrollment_id,recipient_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[tokenHash(token),j.id,tenant,mailbox,j.enrollment_id,j.recipient_hash,expires]);return token;
 }
 const post=(token:string,form='List-Unsubscribe=One-Click',headers:Record<string,string>={})=>fetch(origin+'/unsubscribe/'+token,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:form});
 const complaint=async(value:unknown,auth=true,headers:Record<string,string>={})=>fetch(origin+'/api/complaints',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim()}:{}),...headers},body:JSON.stringify(value)});
 const business=async()=>JSON.stringify((await pool.query("SELECT jsonb_build_object('suppression',(SELECT jsonb_agg(s) FROM suppression s),'mailbox',(SELECT jsonb_agg(m ORDER BY id) FROM mailbox m),'enrollment',(SELECT jsonb_agg(e ORDER BY id) FROM enrollment e),'jobs',(SELECT jsonb_agg(j ORDER BY id) FROM send_job j),'consent',(SELECT jsonb_agg(c ORDER BY id) FROM consent c),'members',(SELECT jsonb_agg(p ORDER BY mailbox_id) FROM pool_member p),'events',(SELECT jsonb_agg(c) FROM complaint_event c)) AS state")).rows);
 try {
  await t.test('B1/B4 generic accessible GET zero business writes; negative GET/POST and strict Origin',async()=>{
   await setup();const token=await capability(),before=await business();const get=await fetch(origin+'/unsubscribe/'+token);
   assert.equal(get.status,200);assert.equal(get.headers.get('referrer-policy'),'no-referrer');assert.equal(get.headers.get('cache-control'),'no-store');const html=await get.text();assert.match(html,/<button/);assert.ok(!html.includes('@'));assert.equal(await business(),before);
   const invalid=[randomBytes(32).toString('base64url'),cookie.split('=')[1]!,await capability(0,new Date(Date.now()-1)),'bad'];
   for(const bad of invalid) {assert.equal((await fetch(origin+'/unsubscribe/'+bad)).status,400);assert.equal((await post(bad)).status,400);assert.equal(await business(),before);}
   assert.equal((await post(token,'confirm=unsubscribe&tenantId='+tenant)).status,400);
   assert.equal((await post(token,'confirm=unsubscribe',{origin:'https://forged.example'})).status,403);assert.equal(await business(),before);
   assert.equal((await fetch(origin+'/api/auth/logout',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'})).status,403);
   assert.equal((await post(token,'confirm=unsubscribe')).status,200);assert.equal((await post(token)).status,200);
   assert.equal((await pool.query('SELECT count(*) FROM suppression')).rows[0].count,'1');
   assert.equal((await pool.query('SELECT state FROM send_job WHERE enrollment_id=$1 AND step=1',[sent[0]!.enrollment_id])).rows[0].state,'cancelled');
  });
  await t.test('B1 exact30day expiry boundary and corrupted job binding zero business writes',async()=>{
   await setup();const expiry=new Date(now.getTime()+30*86400000),token=await capability(0,expiry);
   const {SuppressionStore}=await import('../src/suppression/store.js');
   await new SuppressionStore(pool,config.recipientHashKey,()=>new Date(expiry.getTime()-1)).confirm(token);
   const before=await business();const expired=new SuppressionStore(pool,config.recipientHashKey,()=>expiry);await assert.rejects(expired.confirm(token));await assert.rejects(expired.unsubscribe(token));assert.equal(await business(),before);
   await pool.query('UPDATE unsubscribe_token SET enrollment_id=$1 WHERE token_hash=$2',[sent[1]!.enrollment_id,tokenHash(token)]);
   assert.equal((await fetch(origin+'/unsubscribe/'+token)).status,400);assert.equal((await post(token)).status,400);assert.equal(await business(),before);
  });
  await t.test('B2 concurrent stable tenant-wide suppression and post-lock expiry',async()=>{
   await setup();const token=await capability();assert.ok((await Promise.all(Array.from({length:12},()=>post(token)))).every(r=>r.status===200));assert.equal((await pool.query('SELECT count(*) FROM suppression')).rows[0].count,'1');
   await setup();const expiring=await capability(0,new Date(Date.now()+150));const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const pending=app.suppression.unsubscribe(expiring);await waiting(pool);await new Promise(r=>setTimeout(r,200));await blocker.query('COMMIT');blocker.release();await assert.rejects(pending);assert.equal((await pool.query('SELECT count(*) FROM suppression')).rows[0].count,'0');
  });
  await t.test('B3 complaints operator auth, closed absent config, durable dedup bound payload and 0 writes',async()=>{
   await setup();const event={eventId:'operator-event-1',tenantId:tenant,mailboxId:mailbox,recipientDigest:sent[0]!.recipient_hash},before=await business();
   assert.equal((await complaint(event,false)).status,401);assert.equal((await complaint(event,false,{cookie,origin:config.origin})).status,401);
   assert.equal((await complaint(event,false,{authorization:'Bearer '+randomBytes(32).toString('base64')})).status,401);
   assert.equal((await complaint({...event,tenantId:foreignTenant})).status,400);assert.equal((await complaint({...event,recipientDigest:'bad'})).status,400);assert.equal(await business(),before);
   assert.equal((await complaint(event,false,{cookie})).status,401);
   const {authenticateOperator}=await import('../src/suppression/store.js');assert.throws(()=>authenticateOperator('Bearer valid',null));
   assert.equal((await complaint(event)).status,200);const after=await business();assert.equal((await complaint(event)).status,200);assert.equal(await business(),after);
   assert.equal((await complaint({...event,recipientDigest:sent[1]!.recipient_hash})).status,400);assert.equal(await business(),after);
   assert.equal((await pool.query('SELECT state FROM mailbox WHERE id=$1',[mailbox])).rows[0].state,'quarantined');assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE state IN ('queued','claimed')")).rows[0].count,'0');
   const second=new (await import('../src/suppression/store.js')).SuppressionStore(pool,config.recipientHashKey);assert.deepEqual(await second.complaint(event),{accepted:true});assert.equal(await business(),after);
  });
  await t.test('B4 concurrent 31st request 429 counts failures and ignores forwarded IP',async()=>{
   await setup();const before=await business();const responses=await Promise.all(Array.from({length:31},(_,i)=>post('forged','confirm=unsubscribe',{'x-forwarded-for':`192.0.2.${i}`})));
   assert.equal(responses.filter(r=>r.status===400).length,30);const limited=responses.filter(r=>r.status===429);assert.equal(limited.length,1);assert.ok(Number(limited[0]!.headers.get('retry-after'))>=1);assert.equal(await business(),before);
   await pool.query('TRUNCATE public_stop_bucket');const failures=await Promise.all(Array.from({length:31},()=>complaint({},false)));assert.equal(failures.filter(r=>r.status===401).length,30);assert.equal(failures.filter(r=>r.status===429).length,1);assert.equal(await business(),before);
  });
  await t.test('B2 pool optout globally withdraws intended recipient, preserves sender and in-flight',async()=>{
   await setup();const actors=(await pool.query('SELECT id,tenant_id FROM account')).rows;
   for(const a of actors) await app.consents.act({tenant_id:a.tenant_id,account_id:a.id},a.tenant_id===tenant?mailbox:foreignMailbox,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});
   const job=randomUUID(),pending=randomUUID(),token=randomBytes(32).toString('base64url');
   await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,payload) VALUES($1,$2,$3,$4,'pool','submitted',$5),($6,$2,$3,$4,'pool','queued',$5)",[job,tenant,mailbox,foreignMailbox,{subject:'test',body:'test'},pending]);
   await pool.query('INSERT INTO unsubscribe_token(token_hash,job_id,tenant_id,mailbox_id,recipient_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[tokenHash(token),job,tenant,mailbox,sent[0]!.recipient_hash,new Date(Date.now()+86400000)]);
   assert.equal((await post(token)).status,200);assert.equal((await pool.query('SELECT count(*) FROM pool_member WHERE mailbox_id=$1',[foreignMailbox])).rows[0].count,'0');assert.equal((await pool.query('SELECT count(*) FROM pool_member WHERE mailbox_id=$1',[mailbox])).rows[0].count,'1');
   assert.equal((await pool.query('SELECT state FROM mailbox WHERE id=$1',[foreignMailbox])).rows[0].state,'verified_test');assert.equal((await pool.query('SELECT state FROM mailbox WHERE id=$1',[mailbox])).rows[0].state,'verified_test');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[pending])).rows[0].state,'cancelled');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[job])).rows[0].state,'submitted');
   assert.equal((await app.cohort.tick(new Date(Date.now()+86400000))).created,0);
  });
  for(const stop of ['unsubscribe','complaint'] as const) for(const ordering of ['before','after'] as const) await t.test(`B2/B3 actual ${stop} shared-lock race ${ordering} final: before0 after1 later0`,async()=>{
   await setup();const job=await app.dispatch.claim(randomUUID(),now);assert.ok(job);const index=sent.findIndex(j=>j.enrollment_id===job.enrollment_id),token=await capability(index);let calls=0;const gate=barrier();
   const submit=new SubmissionStore(pool,config,{adapter:{mode:'local_test',async submit(){calls++;return {kind:'accepted'};}},...ordering==='before'?{beforeFinal:gate.wait}:{afterCommit:gate.wait}});const sending=submit.submit(job.id,job.lease_owner);await gate.reached;
   const lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(7,1)');const writing=stop==='unsubscribe'?app.suppression.unsubscribe(token):app.suppression.complaint({eventId:'race',tenantId:tenant,mailboxId:mailbox,recipientDigest:sent[index]!.recipient_hash});await waiting(pool);await lock.query('COMMIT');lock.release();await writing;gate.release();const result=await sending;
   assert.equal(result.calls,ordering==='before'?0:1);assert.equal(calls,ordering==='before'?0:1);assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE enrollment_id=$1 AND state IN ('queued','claimed')",[job.enrollment_id])).rows[0].count,'0');
  });
  await t.test('B5/B6 actual operator CLI durable seed→poll→ReplyStore stops pending; tenant status safe',async()=>{
   await setup();const e=(await pool.query('SELECT recipient_envelope FROM enrollment WHERE id=$1',[sent[0]!.enrollment_id])).rows[0];const {openRecipient}=await import('../src/campaigns/store.js');const from=openRecipient(e.recipient_envelope,tenant,sent[0]!.enrollment_id,config.credentialKeyring);
   const {writeFile,unlink}=await import('node:fs/promises');const file='/tmp/n7-f04b-fixture-'+randomUUID()+'.json';
   await writeFile(file,JSON.stringify({uidvalidity:'1',uidNext:3,headers:[{uid:2,from:'N7_HEADER_CANARY_F04B <'+from+'>',references:[sent[0]!.message_id]}]}),{mode:0o600});
   try {await operatorCLI(['seed',tenant,mailbox,file]);await operatorCLI(['poll',tenant,mailbox]);} finally {await unlink(file);}
   assert.equal((await pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'1');assert.equal((await pool.query('SELECT state FROM send_job WHERE enrollment_id=$1 AND step=1',[sent[0]!.enrollment_id])).rows[0].state,'cancelled');
   const res=await fetch(origin+`/api/mailboxes/${mailbox}/reply-status`,{headers:{cookie}});assert.equal(res.status,200);const data=await res.text();assert.match(data,/local_test/);assert.match(data,/local_fixture/);assert.ok(!data.includes('N7_HEADER') && !data.includes('references') && !data.includes('credential'));
   assert.equal((await fetch(origin+`/api/mailboxes/${foreignMailbox}/reply-status`,{headers:{cookie}})).status,404);
   await operatorCLI(['poll',tenant,mailbox]);assert.equal((await pool.query('SELECT count(*) FROM reply_effect')).rows[0].count,'1');
  });
  await t.test('B5 default/missing/failure pause, empty explicit complete, reset and incomplete explicit retry',async()=>{
   await setup();const prior=(await pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at;
   assert.equal((await new PollWorker(pool,config.credentialKeyring).poll(tenant,mailbox)).state,'disabled');assert.equal(await app.replies.status(tenant,mailbox),null);
   assert.equal((await worker().poll(tenant,mailbox)).state,'paused');assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);
   await seedFixture(pool,tenant,mailbox,{uidvalidity:'1',uidNext:1,headers:[]});assert.equal((await worker().poll(tenant,mailbox)).state,'complete');
   await pool.query("UPDATE mailbox SET state='quarantined' WHERE id=$1",[mailbox]);await seedFixture(pool,tenant,mailbox,{uidvalidity:'2',uidNext:2,headers:[],failed:true});assert.equal((await worker().poll(tenant,mailbox)).state,'paused');
   await seedFixture(pool,tenant,mailbox,{uidvalidity:'2',uidNext:2002,headers:Array.from({length:2001},(_,i)=>({uid:i+1,from:'unrelated@example.test'}))});assert.equal((await worker().poll(tenant,mailbox)).state,'rescan_incomplete');const r=(await app.replies.status(tenant,mailbox))!;assert.equal(r.highWater,2001);assert.equal(r.cursor,2000);assert.equal(r.pages,20);
   assert.equal((await worker().poll(tenant,mailbox)).state,'rescan_incomplete');assert.deepEqual(await app.replies.status(tenant,mailbox),r);
   await operatorCLI(['retry',tenant,mailbox]);const resumed=(await worker().store.status(tenant,mailbox))!;assert.equal(resumed.runId,r.runId);assert.equal(resumed.cursor,2000);assert.equal(resumed.highWater,2001);assert.equal(resumed.attempt,2);assert.equal((await worker().poll(tenant,mailbox)).state,'complete');assert.equal((await pool.query('SELECT state FROM mailbox WHERE id=$1',[mailbox])).rows[0].state,'quarantined');
   const complete=(await pool.query('SELECT completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].completed_at;assert.ok(complete.getTime()>=prior.getTime());
  });
  await t.test('B5 adapter source 101-tail honest prefix boundary and restart immutable H/tailH',async()=>{
   await setup();await seedFixture(pool,tenant,mailbox,{uidvalidity:'1',uidNext:11,headers:[]});const fixture=new FixtureAdapter(pool);let reads=0;const gate=barrier();
   const adapter:ReplyAdapter={mode:'local_test',snapshot:(a,b)=>fixture.snapshot(a,b),async read(a,b,v,c,h){reads++;if(reads===1) {const scan=await fixture.read(a,b,v,c,h);await seedFixture(pool,a,b,{uidvalidity:'1',uidNext:112,headers:Array.from({length:101},(_,i)=>({uid:11+i,from:'unrelated@example.test'}))});return scan;}if(reads===3) await gate.wait();return fixture.read(a,b,v,c,h);}};
   const pending=new PollWorker(pool,config.credentialKeyring,'local_test',adapter).poll(tenant,mailbox);await gate.reached;const run=(await app.replies.status(tenant,mailbox))!;assert.equal(run.highWater,10);assert.equal(run.tailHighWater,111);assert.equal(run.cursor,110);assert.equal((await pool.query('SELECT scan_complete FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0].scan_complete,false);assert.equal(await app.dispatch.claim(),null);
   const restarted=new PollWorker(pool,config.credentialKeyring,'local_test');assert.deepEqual(await restarted.store.status(tenant,mailbox),run);gate.release();assert.equal((await pending).state,'complete');assert.equal((await pool.query('SELECT count(*) FROM reply_observation')).rows[0].count,'101');
   await app.replies.capture(tenant,mailbox,{uidvalidity:'2',uidNext:2,observedAt:new Date(),provenance:'local_fixture'});await assert.rejects(app.replies.page(tenant,mailbox,{...identity(run),kind:'tail',tailHighWater:111,coveredThrough:111,headers:[],startedAt:new Date(),completedAt:new Date()}));
  });
 } finally {await new Promise<void>(r=>app.server.close(()=>r()));await pool.end();}
});
