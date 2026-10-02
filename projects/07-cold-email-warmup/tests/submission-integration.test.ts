import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import type { Identity } from '../src/auth/store.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import { DispatchSeams } from '../src/dispatch/seams.js';
import { SubmissionStore } from '../src/dispatch/submission.js';
import { newSession,COOKIE_NAME } from '../src/auth/session.js';
import { tokenHash } from '../src/dispatch/message.js';
import type { TestOutcome } from '../src/dispatch/adapter.js';
function barrier() {
 let entered!:()=>void,release!:()=>void;
 const reached=new Promise<void>(r=>{entered=r;});const resume=new Promise<void>(r=>{release=r;});
 return {reached,release,wait:async()=>{entered();await resume;}};
}
async function waitingForLock(pool:Pool,expected=1) {
 for(let i=0;i<100;i++) {
  if(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].count)>=expected) return;
  await new Promise(r=>setTimeout(r,5));
 }
 assert.fail('writer did not wait on actual shared advisory lock');
}
test('F03b real PG durable final authority, all stop races, sink privacy and outcomes',async t=>{
 const config={...loadConfig(),dispatchMode:'local_test' as const};const pool=createPool(config.databaseUrl);await migrate(pool);await migrate(pool);
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 const seams=new DispatchSeams(pool);let now=new Date('2026-10-02T12:00:00Z');let calls=0;
 const adapter={mode:'local_test' as const,async submit(){calls++;return {kind:'accepted'} as TestOutcome;}};
 const submit=new SubmissionStore(pool,config,{clock:()=>now,adapter});
 const raw={label:'N7 local test',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'N7_CREDENTIAL_CANARY_B',smtpPassword:'N7_CREDENTIAL_CANARY_B',imapUsername:'N7_CREDENTIAL_CANARY_B',imapPassword:'N7_CREDENTIAL_CANARY_B'};
 const input={steps:[{subject:'Hello {{firstName}}',body:'N7_PRIVATE_CANARY_B {{firstName}}',delayHours:24}],recipients:[{address:'private-b@example.test',fields:{firstName:'Ada'}}]};
 let actors:Identity[],boxes:string[],campaign:{id:string;content_version:number;recipient_fingerprint:string};
 const grant=async(i:number,scope:'pool'|'campaign')=>app.consents.act(actors[i]!,boxes[i]!,{scope,action:'grant',affirmative:true,scopeVersion:scope==='pool'?1:campaign.content_version,...(scope==='campaign'?{campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint}:{})});
 async function setup(scope:'campaign'|'pool'='campaign',recipients=1,claimOffsetMs=0) {
  await pool.query('TRUNCATE tenant,auth_bucket CASCADE');calls=0;actors=[];boxes=[];now=new Date('2026-10-02T12:00:00Z');
  for(let i=0;i<3;i++) {
   const tenant=randomUUID(),account=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[tenant]);
   await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)',[account,tenant,`actor-${i}@example.test`,'not-a-login-hash']);
   actors.push({tenant_id:tenant,account_id:account});
   boxes.push((await app.mailboxes.save(tenant,{...raw,senderAddress:`sender-${i}@example.test`})).id);
   await eligibilityTransaction(pool,async c=>{await c.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[boxes[i]]);});
   await seams.recordPoll(tenant,boxes[i]!,{completedAt:now,scanComplete:true,uidvalidity:'fixture',cursorUid:1});
  }
  campaign=await app.consents.campaign(actors[0]!,{...input,recipients:Array.from({length:recipients},(_,i)=>({address:`private-b-${i}@example.test`,fields:{firstName:'Ada'}}))});
  await grant(0,'campaign');await grant(0,'pool');await grant(1,'pool');
  if(scope==='campaign') await app.campaigns.start(actors[0]!,campaign.id,{mailboxIds:[boxes[0]]},now);
  else {
   await pool.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state,due_at,payload,pair_key) VALUES($1,$2,$3,$4,'pool','queued',$5,$6,$7)`,[randomUUID(),actors[0]!.tenant_id,boxes[0],boxes[1],now,{subject:'N7 warmup',body:'This is a consented N7 warmup test message.'},[boxes[0],boxes[1]].sort().join(':')+':'+now.toISOString().slice(0,10)]);
  }
  now=new Date(now.getTime()+claimOffsetMs);
  const job=await app.dispatch.claim(randomUUID(),now);assert.ok(job);return job;
 }
 async function submitAfterLockWait(jobs:{id:string;lease_owner:string}[],fresh:Date) {
  const blocker=await pool.connect();let pending:Promise<{state:string;calls:number}>[]=[];
  try {
   await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   pending=jobs.map(job=>submit.submit(job.id,job.lease_owner));
   await waitingForLock(pool,jobs.length);now=fresh;
  } finally {
   await blocker.query('COMMIT');blocker.release();
  }
  return Promise.all(pending);
 }
 const stopCases=['revoke','version','pause','sender_withdraw','recipient_withdraw','reply','unsubscribe','complaint','disable','limit'] as const;
 async function stop(kind:typeof stopCases[number],job:Record<string,unknown>) {
  switch(kind) {
   case 'revoke':await app.consents.act(actors[0]!,boxes[0]!,{scope:'campaign',campaignId:campaign.id,action:'revoke'});break;
   case 'version':await app.consents.campaign(actors[0]!,{...input,steps:[{subject:'Changed',body:'Changed',delayHours:24}]},campaign.id);break;
   case 'pause':await app.campaigns.pause(actors[0]!.tenant_id,campaign.id);break;
   case 'sender_withdraw':await app.consents.act(actors[0]!,boxes[0]!,{scope:'pool',action:'revoke'});break;
   case 'recipient_withdraw':await app.consents.act(actors[1]!,boxes[1]!,{scope:'pool',action:'revoke'});break;
   case 'reply':await seams.stopEnrollment(actors[0]!.tenant_id,job.enrollment_id as string,'replied');break;
   case 'unsubscribe': {
    const e=(await pool.query('SELECT recipient_hash FROM enrollment WHERE id=$1',[job.enrollment_id])).rows[0];
    await seams.suppress(actors[0]!.tenant_id,e.recipient_hash,'unsubscribe');break;
   }
   case 'complaint':await seams.complaint(actors[0]!.tenant_id,boxes[0]!);break;
   case 'disable':await app.mailboxes.change(actors[0]!.tenant_id,boxes[0]!,{state:'paused'});break;
   case 'limit':await app.mailboxes.change(actors[0]!.tenant_id,boxes[0]!,{dailyLimit:1});break;
  }
 }
 try {
  for(const kind of stopCases) for(const ordering of ['before','after'] as const) await t.test(`B1/B2 SC-US-003-${ordering==='before'?4:5} ${kind}`,async()=>{
   const scope=kind.endsWith('withdraw')?'pool':'campaign';const job=await setup(scope);
   await eligibilityTransaction(pool,async c=>{
    await c.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,campaign_id,enrollment_id,campaign_version,step,state,due_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,'queued',$9,$10)`,[randomUUID(),job.tenant_id,job.mailbox_id,job.recipient_mailbox_id,job.scope,job.campaign_id,job.enrollment_id,job.campaign_version,now,job.payload]);
   });
   if(kind==='limit') await eligibilityTransaction(pool,async c=>{
    await c.query(`INSERT INTO send_job(id,tenant_id,mailbox_id,scope,campaign_id,state,reserved_day) VALUES($1,$2,$3,'campaign',$4,'submitted',$5)`,[randomUUID(),actors[0]!.tenant_id,boxes[0],campaign.id,now.toISOString().slice(0,10)]);
   });
   const gate=barrier();const dispatcher=new SubmissionStore(pool,config,{clock:()=>now,adapter,...(ordering==='before'?{beforeFinal:gate.wait}:{afterCommit:gate.wait})});
   const pending=dispatcher.submit(job.id,job.lease_owner);await gate.reached;
   // A separate real connection owns lock; shared production writer waits behind it.
   const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const writer=stop(kind,job);await waitingForLock(pool);await blocker.query('COMMIT');blocker.release();await writer;
   gate.release();const result=await pending;
   assert.equal(calls,ordering==='before'?0:1);assert.equal(result.calls,ordering==='before'?0:1);
   assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);
   assert.equal(await app.dispatch.claim(randomUUID(),now),null);assert.equal(calls,ordering==='before'?0:1);
   const row=(await pool.query('SELECT claim_order,state FROM send_job WHERE id=$1',[job.id])).rows[0];assert.equal(row.claim_order,job.claim_order);
   if(ordering==='after') assert.equal(row.state,'submitted');
  });
  await t.test('B3 durable rendered sink/token/message refs with own OR intended pool peer read only',async()=>{
   const job=await setup('pool');assert.equal((await submit.submit(job.id,job.lease_owner)).state,'submitted');
   const own=await submit.messages(actors[0]!.tenant_id),peer=await submit.messages(actors[1]!.tenant_id);
   assert.equal(own.length,1);assert.deepEqual(peer,own);assert.equal((await submit.messages(actors[2]!.tenant_id)).length,0);
   assert.equal(own[0].sender,'sender-0@example.test');assert.equal(own[0].recipient,'sender-1@example.test');assert.match(own[0].body,/Unsubscribe: /);
   assert.equal(own[0].headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');assert.match(own[0].subject,/N7 LOCAL TEST/);
   const token=own[0].body.split('/unsubscribe/')[1];const bound=(await pool.query('SELECT * FROM unsubscribe_token WHERE token_hash=$1',[tokenHash(token)])).rows[0];assert.equal(bound.job_id,job.id);assert.equal(bound.mailbox_id,boxes[0]);
   assert.equal((await submit.inspect(actors[0]!.tenant_id,job.id)).message_id,own[0].message_id);
   await assert.rejects(submit.inspect(actors[1]!.tenant_id,job.id));
   assert.ok(!('tenant_id' in peer[0]) && !('recipient_tenant_id' in peer[0]));
   await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
   const address=app.server.address();assert.ok(address && typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
   const cookies:string[]=[];
   for(const actor of actors) {
    const session=newSession(config.sessionKey);await pool.query('INSERT INTO session(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[randomUUID(),actor.account_id,session.digest,session.expiresAt]);
    cookies.push(`${COOKIE_NAME}=${session.token}`);
   }
   const request=async(path:string,cookie?:string,method='GET',origin=config.origin)=>fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(method==='GET'?{}:{body:JSON.stringify({mode:'live',fault:'bypass'})})});
   try {
    assert.equal((await request('/api/dispatch/messages')).status,401);
    assert.equal((await request(`/api/dispatch/jobs/${job.id}`,cookies[0])).status,200);
    assert.equal((await request(`/api/dispatch/jobs/${job.id}`,cookies[1])).status,404);
    assert.equal((await request('/api/dispatch/messages',cookies[0])).status,200);
    const peerResponse=await request('/api/dispatch/messages',cookies[1]);assert.equal(peerResponse.status,200);assert.equal((await peerResponse.json()).data.length,1);
    assert.equal((await request('/api/dispatch/jobs/not-uuid',cookies[0])).status,400);
    assert.equal((await request('/api/dispatch/tick',cookies[0],'POST')).status,404);
    assert.equal((await request('/api/dispatch/tick',cookies[0],'POST','http://foreign.test')).status,403);
    assert.equal((await request('/api/dispatch/messages',cookies[0],'POST')).status,404);assert.equal(calls,1);
   } finally {await new Promise<void>(r=>app.server.close(()=>r()));}
   // Persistence uses a second pool, not memory. Campaign private content stays owner-only.
   const second=createPool(config.databaseUrl);try {assert.equal((await new SubmissionStore(second,config).messages(actors[1]!.tenant_id)).length,1);} finally {await second.end();}
   await app.cohort.tick(now);const reply=await app.dispatch.claim(randomUUID(),now);assert.ok(reply);assert.equal(reply.kind,'reply');
   await submit.submit(reply.id,reply.lease_owner);const replyMessage=(await pool.query('SELECT headers FROM local_test_message WHERE job_id=$1',[reply.id])).rows[0];assert.equal(replyMessage.headers.References,own[0].message_id);
   const privateJob=await setup();await submit.submit(privateJob.id,privateJob.lease_owner);
   assert.equal((await submit.messages(actors[1]!.tenant_id)).length,0);assert.match((await submit.messages(actors[0]!.tenant_id))[0].body,/N7_PRIVATE_CANARY_B Ada/);
  });
  await t.test('R2 B5 authenticated disabled inspection unavailable before either reader',async()=>{
   const job=await setup();const disabled=await application({...config,dispatchMode:'disabled'},pool);
   let reads=0;
   disabled.submissions.inspect=async()=>{reads++;throw new Error('disabled job reader called');};
   disabled.submissions.messages=async()=>{reads++;throw new Error('disabled message reader called');};
   const session=newSession(config.sessionKey);
   await pool.query('INSERT INTO session(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[randomUUID(),actors[0]!.account_id,session.digest,session.expiresAt]);
   await new Promise<void>(r=>disabled.server.listen(0,'127.0.0.1',r));
   const address=disabled.server.address();assert.ok(address && typeof address==='object');
   try {
    for(const path of [`/api/dispatch/jobs/${job.id}`,'/api/dispatch/messages']) {
     const url:string=`http://127.0.0.1:${address.port}${path}`;
     assert.equal((await fetch(url)).status,401);
     const response=await fetch(url,{headers:{Cookie:`${COOKIE_NAME}=${session.token}`}});
     assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service_unavailable',message:'service_unavailable'}});
     assert.equal(reads,0);
    }
   } finally {await new Promise<void>(r=>disabled.server.close(()=>r()));}
  });
  await t.test('R1 post-lock clock lease45s rejects expired waiter with zero adapter calls',async()=>{
   const job=await setup();const base=now.getTime();now=new Date(base+44999);
   const [result]=await submitAfterLockWait([job],new Date(base+45000));
   assert.equal(result!.calls,0);assert.equal(calls,0);
  });
  await t.test('R1 post-lock clock poll60s rejects stale waiter with live lease and zero adapter calls',async()=>{
   const job=await setup('campaign',1,20000);const base=now.getTime()-20000;now=new Date(base+59999);
   const [result]=await submitAfterLockWait([job],new Date(base+60000));
   assert.equal(result!.calls,0);assert.equal(calls,0);
  });
  await t.test('R1 post-lock clock retry120s rejects ceiling waiter with zero adapter calls',async()=>{
   const first=await setup();const base=now.getTime();
   const transient=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){return {kind:'pre_data_transient',proof:'no_data_submitted'};}}});
   await transient.submit(first.id,first.lease_owner);now=new Date(base+119999);
   await seams.recordPoll(actors[0]!.tenant_id,boxes[0]!,{completedAt:now,scanComplete:true,uidvalidity:'fixture',cursorUid:1});
   const retry=await app.dispatch.claim(randomUUID(),now);assert.ok(retry);
   const [result]=await submitAfterLockWait([retry],new Date(base+120000));
   assert.equal(result!.calls,0);assert.equal(calls,0);
  });
  await t.test('R1 post-lock clock midnight concurrent waiters enforce new-day provider limit1 and reservations',async()=>{
   const first=await setup('campaign',2);const second=await app.dispatch.claim(randomUUID(),now);assert.ok(second);
   now=new Date('2026-10-02T23:59:59.999Z');
   await eligibilityTransaction(pool,async c=>{
    await c.query("UPDATE send_job SET lease_until=$1::timestamptz+interval '45 seconds' WHERE id=ANY($2::uuid[])",[now,[first.id,second.id]]);
    await c.query('UPDATE mailbox SET provider_limit=1 WHERE id=$1',[boxes[0]]);
   });
   await seams.recordPoll(actors[0]!.tenant_id,boxes[0]!,{completedAt:now,scanComplete:true,uidvalidity:'fixture',cursorUid:1});
   const results=await submitAfterLockWait([first,second],new Date('2026-10-03T00:00:00Z'));
   assert.equal(results.filter(r=>r.calls===1).length,1);assert.equal(calls,1);
   const jobs=(await pool.query('SELECT state,reserved_day::text,due_at,claim_order FROM send_job ORDER BY id')).rows;
   assert.equal(jobs.filter(j=>j.state==='submitted' && j.reserved_day==='2026-10-03').length,1);
   assert.equal(jobs.filter(j=>j.state==='queued' && j.reserved_day===null && j.due_at.toISOString()==='2026-10-04T00:00:00.000Z').length,1);
   assert.ok(jobs.every(j=>j.claim_order!==null));
  });
  await t.test('B1/B5 default disabled, wrong/expired lease, exact poll boundaries and incomplete scan',async()=>{
   let job=await setup();const disabled=new SubmissionStore(pool,{...config,dispatchMode:'disabled'},{clock:()=>now,adapter});
   assert.equal((await disabled.submit(job.id,job.lease_owner)).calls,0);assert.equal((await submit.submit(job.id,randomUUID())).calls,0);
   now=new Date(now.getTime()+45000);assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);
   for(const [age,complete,allowed] of [[59999,true,true],[60000,true,false],[60001,true,false],[-1,true,false],[0,false,false],[0,true,true]] as const) {
    job=await setup();now=new Date(now.getTime()+20000);
    await seams.recordPoll(actors[0]!.tenant_id,boxes[0]!,{completedAt:new Date(now.getTime()-age),scanComplete:complete,uidvalidity:'fixture',cursorUid:2000});
    assert.equal((await submit.submit(job.id,job.lease_owner)).calls,allowed?1:0,`poll ${age}/${complete}`);
   }
  });
  await t.test('B5 midnight reservations move under concurrent final guard; provider lowered, no off-by-one',async()=>{
   const first=await setup('campaign',2);const second=await app.dispatch.claim(randomUUID(),now);assert.ok(second);
   now=new Date('2026-10-02T23:59:59.999Z');
   await eligibilityTransaction(pool,async c=>{
    await c.query('UPDATE send_job SET lease_until=$1::timestamptz+interval \'45 seconds\' WHERE id=ANY($2::uuid[])',[now,[first.id,second.id]]);
    await c.query('UPDATE mailbox SET provider_limit=1 WHERE id=$1',[boxes[0]]);
   });
   now=new Date('2026-10-03T00:00:00Z');await seams.recordPoll(actors[0]!.tenant_id,boxes[0]!,{completedAt:now,scanComplete:true,uidvalidity:'fixture',cursorUid:1});
   const results=await Promise.all([submit.submit(first.id,first.lease_owner),submit.submit(second.id,second.lease_owner)]);
   assert.equal(results.filter(r=>r.calls===1).length,1);assert.equal(calls,1);
   const jobs=(await pool.query('SELECT state,reserved_day::text,claim_order FROM send_job ORDER BY id')).rows;
   assert.equal(jobs.filter(j=>j.reserved_day==='2026-10-03').length,1);assert.equal(jobs.filter(j=>j.state==='queued' && j.reserved_day===null).length,1);
   assert.ok(jobs.every(j=>j.claim_order!==null));
  });
  await t.test('B4 proved pre-DATA only, exact5/30s, max3, re-enter guards/quota',async()=>{
   const job=await setup();const firstTime=now.getTime();const retry=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){calls++;return {kind:'pre_data_transient',proof:'no_data_submitted'};}}});
   for(const [attempt,elapsed,delay] of [[1,0,5000],[2,5000,30000],[3,35000,0]] as const) {
    now=new Date(firstTime+elapsed!);let claimed=job;if(attempt!==1) {claimed=await app.dispatch.claim(randomUUID(),now);assert.ok(claimed);}
    const result=await retry.submit(claimed.id,claimed.lease_owner);assert.equal(result.state,attempt===3?'cancelled':'queued');
    const row=(await pool.query('SELECT * FROM send_job WHERE id=$1',[job.id])).rows[0];assert.equal(row.attempt_count,attempt);assert.equal(row.reserved_day,null);assert.equal(row.due_at.getTime(),now.getTime()+delay!);
    if(attempt<3) assert.equal(await app.dispatch.claim(randomUUID(),new Date(row.due_at.getTime()-1)),null);
   }
   assert.equal(calls,3);assert.equal(await app.dispatch.claim(randomUUID(),new Date(firstTime+36000)),null);
   const again=await setup();const transient=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){calls++;return {kind:'pre_data_transient',proof:'no_data_submitted'};}}});
   await transient.submit(again.id,again.lease_owner);now=new Date(now.getTime()+5000);const claimed=await app.dispatch.claim(randomUUID(),now);assert.ok(claimed);
   await app.consents.act(actors[0]!,boxes[0]!,{scope:'campaign',campaignId:campaign.id,action:'revoke'});assert.equal((await transient.submit(claimed.id,claimed.lease_owner)).calls,0);assert.equal(calls,1);
  });
  await t.test('B4/B5 retry120s exact ceiling, ambiguous timeout/crash retain quota, never recover resend',async()=>{
   let job=await setup();let retry=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){return {kind:'pre_data_transient',proof:'no_data_submitted'};}}});
   await retry.submit(job.id,job.lease_owner);now=new Date(now.getTime()+119999);await seams.recordPoll(actors[0]!.tenant_id,boxes[0]!,{completedAt:now,scanComplete:true,uidvalidity:'fixture',cursorUid:1});
   const claim=await app.dispatch.claim(randomUUID(),now);assert.ok(claim);now=new Date(now.getTime()+1);assert.equal((await retry.submit(claim.id,claim.lease_owner)).calls,0);assert.equal(await app.dispatch.claim(randomUUID(),now),null);
   for(const type of ['ambiguous','throw','crash','forged-proof','permanent'] as const) {
    job=await setup();retry=new SubmissionStore(pool,config,{clock:()=>now,adapter:{mode:'local_test',async submit(){calls++;if(type==='throw') throw new Error('timeout');return type==='permanent'?{kind:'permanent',proof:'no_data_submitted'}:type==='forged-proof'?{kind:'pre_data_transient',proof:'untrusted'} as unknown as TestOutcome:{kind:'ambiguous'};}},...(type==='crash'?{afterCommit:async()=>{throw new Error('caller_crash');}}:{})});
    if(type==='crash') {await assert.rejects(retry.submit(job.id,job.lease_owner));assert.equal(calls,0);now=new Date(now.getTime()+120000);assert.equal(await retry.recoverAbandoned(now),1);} else await retry.submit(job.id,job.lease_owner);
    const row=(await pool.query('SELECT state,reserved_day,outcome FROM send_job WHERE id=$1',[job.id])).rows[0];assert.equal(row.state,type==='permanent'?'cancelled':'unknown');assert.equal(row.reserved_day===null,type==='permanent');
    now=new Date(now.getTime()+120000);assert.equal(await app.dispatch.claim(randomUUID(),now),null);assert.equal((await retry.submit(job.id,job.lease_owner)).calls,0);
    assert.equal((await pool.query('SELECT count(*) FROM local_test_message')).rows[0].count,'0');
   }
  });
 } finally {await pool.end();}
});
