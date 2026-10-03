import { seedTestEntitlement } from './billing-fixture.js';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import { openRecipient,recipientDigest } from '../src/campaigns/store.js';
import type { Identity } from '../src/auth/store.js';
test('F03a realPG campaign/pool/shared quota/lease seams without transport',async t=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl);await migrate(pool);
 await pool.query('TRUNCATE tenant,auth_bucket CASCADE');
 let calls=0;const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}],adapter:{mode:'local_test',async connect(){calls++;}}});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const bound=app.server.address();assert.ok(bound && typeof bound==='object');const base=`http://127.0.0.1:${bound.port}`;
 const request=async(path:string,method='GET',cookie?:string,input:unknown={},origin=config.origin)=>{
  const response=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:method==='GET'?undefined:JSON.stringify(input)});
  return {status:response.status,data:(await response.json()).data,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const actors:Identity[]=[];const cookies:string[]=[];const boxes:string[]=[];const now=new Date('2026-10-02T12:00:00Z');
 const poll=async(id:string,date:Date|null=now,complete=true)=>pool.query('INSERT INTO mailbox_poll(mailbox_id,completed_at,scan_complete) VALUES($1,$2,$3) ON CONFLICT(mailbox_id) DO UPDATE SET completed_at=$2,scan_complete=$3',[id,date,complete]);
 const raw={label:'Synthetic local',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'fixture',smtpPassword:'fixture',imapUsername:'fixture',imapPassword:'fixture'};
 const campaignInput={steps:[{subject:'Hello {{firstName}}',body:'Text {{company}}',delayHours:24}],recipients:Array.from({length:20},(_,i)=>({address:`private${i}@example.test`,fields:{firstName:'Ada',company:'<b>Co</b>'}}))};
 let campaign:{id:string;content_version:number;recipient_fingerprint:string};
 const grant=async(index:number,scope='pool')=>app.consents.act(actors[index]!,boxes[index]!,{scope,action:'grant',affirmative:true,scopeVersion:scope==='pool'?1:campaign.content_version,...(scope==='campaign'?{campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint}:{})});
 try {
  for(let i=0;i<2;i++) {
   cookies.push((await request('/api/auth/register','POST',undefined,{email:`f03-${i}@example.test`,password:randomBytes(20).toString('hex')})).cookie!);
   actors.push((await request('/api/auth/me','GET',cookies[i])).data);
   boxes.push((await app.mailboxes.save(actors[i]!.tenant_id,raw)).id);
   // Explicit local DB fixtures only: no fabricated polling API or real reputation claim.
   await eligibilityTransaction(pool,async c=>{await c.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[boxes[i]]);});
  }
  await t.test('A1/A2 owned API, validation no jobs, explicit consent, unique starts, AEAD and version atomicity',async()=>{
   campaign=(await request('/api/campaigns','POST',cookies[0],campaignInput)).data;
   assert.ok(campaign.id);assert.equal((await request(`/api/campaigns/${campaign.id}`,'GET',cookies[1])).status,404);
   for(const suffix of ['','/preview','/start','/pause']) assert.equal((await request(`/api/campaigns/${campaign.id}${suffix}`,suffix==='/start'||suffix==='/pause'?'POST':'GET',cookies[1],{mailboxIds:[boxes[1]]})).status,404);
   assert.equal((await request('/api/campaigns','GET')).status,401);
   assert.equal((await request(`/api/campaigns/${campaign.id}/start`,'POST',cookies[0],{mailboxIds:[boxes[0]]},'http://wrong.test')).status,403);
   for(const steps of [[{subject:'X\r\nBcc:y',body:'Hello',delayHours:24}],[{subject:'Hi',body:'<script>x</script>',delayHours:24}],[{subject:'Hi',body:'{{unknown}}',delayHours:24}]]) assert.equal((await request('/api/campaigns','POST',cookies[0],{...campaignInput,steps})).status,400);
   assert.equal((await pool.query('SELECT count(*) FROM send_job')).rows[0].count,'0');
   assert.equal((await request(`/api/campaigns/${campaign.id}/start`,'POST',cookies[0],{mailboxIds:[boxes[0]]})).status,409);
   await grant(0,'campaign');const start=await app.campaigns.start(actors[0]!,campaign.id,{mailboxIds:[boxes[0]]},now);assert.equal(start.created,20);
   assert.equal((await app.campaigns.start(actors[0]!,campaign.id,{mailboxIds:[boxes[0]]},now)).created,0);
   const enrollment=(await pool.query('SELECT * FROM enrollment LIMIT 1')).rows[0];assert.ok(!JSON.stringify(enrollment).includes('@example.test'));assert.match(openRecipient(enrollment.recipient_envelope,actors[0]!.tenant_id,enrollment.id,config.credentialKeyring),/^private/);
   const preview=await app.campaigns.preview(actors[0]!.tenant_id,campaign.id);assert.match(preview[0]!.steps[0]!.html,/&lt;b&gt;/);
   assert.equal((await app.consents.campaign(actors[0]!,campaignInput,campaign.id)).content_version,1);
   campaign=await app.consents.campaign(actors[0]!,{...campaignInput,steps:[{subject:'Changed',body:'Hello',delayHours:24}]},campaign.id);
   assert.equal(campaign.content_version,2);assert.equal(await app.consents.current(actors[0]!,boxes[0]!,'campaign',campaign.id),false);
   assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE state<>'cancelled'")).rows[0].count,'0');
   assert.equal(calls,0);
  });
  await t.test('A3/A5 fresh complete current opt-in aggregate privacy, pair/day and one submitted-parent reply',async()=>{
   await grant(0);await grant(1);assert.deepEqual(await app.cohort.aggregate(now),{count:0,status:'waiting'});
   await poll(boxes[0]!);assert.deepEqual(await app.cohort.aggregate(now),{count:1,status:'waiting'});assert.equal((await app.cohort.tick(now)).created,0);
   for(const [date,complete] of [[new Date(now.getTime()+1),true],[new Date(now.getTime()-60000),true],[now,false],[null,true]] as const) {
    await poll(boxes[1]!,date,complete);assert.equal((await app.cohort.aggregate(now)).count,1);
   }
   await poll(boxes[1]!);assert.deepEqual(await app.cohort.aggregate(now),{count:2,status:'ready'});
   assert.equal((await app.cohort.tick(now)).created,1);assert.equal((await app.cohort.tick(now)).created,0);
   const initial=(await pool.query("SELECT * FROM send_job WHERE scope='pool' AND kind='initial'")).rows[0];
   await pool.query("UPDATE send_job SET state='submitted' WHERE id=$1",[initial.id]); // F03b state fixture; no submission implementation.
   assert.equal((await app.cohort.tick(now)).created,1);assert.equal((await app.cohort.tick(now)).created,0);
   await pool.query("UPDATE send_job SET state='submitted' WHERE kind='reply'");assert.equal((await app.cohort.tick(now)).created,0);
   assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE scope='pool'")).rows[0].count,'2');
   const aggregate=await request('/api/pool','GET',cookies[0]);assert.deepEqual(Object.keys(aggregate.data).sort(),['count','status']);
   await app.consents.act(actors[1]!,boxes[1]!,{scope:'pool',action:'revoke'});assert.equal((await app.cohort.aggregate(now)).count,1);
   assert.equal((await request('/api/mailboxes/'+boxes[1],'GET',cookies[0])).status,404);assert.equal(calls,0);
  });
  await t.test('A3 aggregate counts30 eligible mailboxes and excludes quarantine/disconnected/withdrawn',async()=>{
   await grant(1);const added:string[]=[];const owners=new Map<string,Identity>();
   for(let i=0;i<28;i++) {
    if(i===0) await seedTestEntitlement(pool,actors[0]!.tenant_id);
    let owner=actors[0]!;
    if(i>=9) {owner={tenant_id:randomUUID(),account_id:randomUUID()};await pool.query('INSERT INTO tenant(id) VALUES($1)',[owner.tenant_id]);await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[owner.account_id,owner.tenant_id,`aggregate-${i}@example.test`]);}
    const mailbox=(await app.mailboxes.save(owner.tenant_id,{...raw,label:'Aggregate fixture '+i})).id;added.push(mailbox);owners.set(mailbox,owner);
    await pool.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[mailbox]);await poll(mailbox);
    await app.consents.act(owner,mailbox,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});
   }
   assert.equal((await app.cohort.aggregate(now)).count,30);
   await app.mailboxes.change(actors[0]!.tenant_id,added[0]!,{state:'quarantined'});assert.equal((await app.cohort.aggregate(now)).count,29);
   await pool.query("UPDATE mailbox SET state='configured' WHERE id=$1",[added[1]]);assert.equal((await app.cohort.aggregate(now)).count,28);
   await app.consents.act(actors[0]!,added[2]!,{scope:'pool',action:'revoke'});assert.equal((await app.cohort.aggregate(now)).count,27);
   for(const id of added) await app.mailboxes.change(owners.get(id)!.tenant_id,id,{state:'paused'});
  });
  await t.test('A4 shared pool/campaign quota 20 contenders remaining3, 45s lease and conservative irreversible states',async()=>{
   await grant(0,'campaign');await grant(1);await poll(boxes[0]!);await poll(boxes[1]!);
   await app.campaigns.start(actors[0]!,campaign.id,{mailboxIds:[boxes[0]]},now);
   await pool.query('UPDATE mailbox SET daily_limit=10,provider_limit=3 WHERE id=$1',[boxes[0]]);
   // Mix one actual shared pool job into the same sender queue.
   const pooljob=randomUUID();await pool.query("INSERT INTO send_job(id,tenant_id,mailbox_id,recipient_mailbox_id,scope,state) VALUES($1,$2,$3,$4,'pool','queued')",[pooljob,actors[0]!.tenant_id,boxes[0],boxes[1]]);
   await pool.query('UPDATE send_job SET due_at=$1 WHERE id=$2',[now,pooljob]);
   const claims=(await Promise.all(Array.from({length:20},()=>app.dispatch.claim(randomUUID(),now)))).filter(Boolean);assert.equal(claims.length,3);
   assert.equal(new Set(claims.map(j=>j.id)).size,3);assert.ok(claims.every(j=>j.lease_until.getTime()-now.getTime()===45000));
   assert.equal(await app.dispatch.claim(randomUUID(),new Date(now.getTime()+44999)),null);
   const first=claims[0]!;await pool.query("UPDATE send_job SET state='submitting' WHERE id=$1",[first.id]);
   const second=claims[1]!;await pool.query("UPDATE send_job SET state='unknown' WHERE id=$1",[second.id]);
   await poll(boxes[0]!,new Date(now.getTime()+45000));await poll(boxes[1]!,new Date(now.getTime()+45000));
   const recovered=await app.dispatch.claim(randomUUID(),new Date(now.getTime()+45000));assert.ok(recovered);assert.ok(![first.id,second.id].includes(recovered.id));
   assert.equal((await pool.query('SELECT count(*) FROM send_job WHERE mailbox_id=$1 AND reserved_day=$2',[boxes[0],now.toISOString().slice(0,10)])).rows[0].count,'3');
   assert.equal(await app.dispatch.claim(randomUUID(),new Date(now.getTime()+45000)),null);
   await app.mailboxes.change(actors[0]!.tenant_id,boxes[0]!,{state:'paused'});
   const stopped=(await pool.query('SELECT state,reserved_day FROM send_job WHERE id=$1',[recovered.id])).rows[0];assert.equal(stopped.state,'cancelled');assert.equal(stopped.reserved_day,null);
   assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[first.id])).rows[0].state,'submitting');assert.equal((await pool.query('SELECT state FROM send_job WHERE id=$1',[second.id])).rows[0].state,'unknown');assert.equal(calls,0);
  });
  await t.test('A4/A5 common lock first, suppression seam and sender rotation',async()=>{
   const tickNow=new Date(now.getTime()+60000);
   await pool.query("UPDATE mailbox SET state='verified_test',provider_limit=30 WHERE id=ANY($1::uuid[])",[boxes]);
   await grant(0,'campaign');await poll(boxes[0]!,tickNow);await poll(boxes[1]!,tickNow);
   await app.campaigns.pause(actors[0]!.tenant_id,campaign.id);
   const third=(await app.mailboxes.save(actors[0]!.tenant_id,raw)).id;
   await pool.query("UPDATE mailbox SET state='verified_test' WHERE id=$1",[third]);await poll(third,tickNow);
   const other=await app.consents.campaign(actors[0]!,{content:'Rotate',recipients:['a@example.test','b@example.test','c@example.test','d@example.test','e@example.test','f@example.test','g@example.test']});
   for(const id of [boxes[0]!,third]) await app.consents.act(actors[0]!,id,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:1,campaignId:other.id,recipientFingerprint:other.recipient_fingerprint});
   await eligibilityTransaction(pool,async c=>{await c.query('INSERT INTO suppression(tenant_id,recipient_hash,reason) VALUES($1,$2,$3)',[actors[0]!.tenant_id,recipientDigest('b@example.test',config.recipientHashKey),'local fixture']);});
   await app.campaigns.start(actors[0]!,other.id,{mailboxIds:[boxes[0],third]},tickNow);
   // Both eligible senders have three queued jobs and spare quotas. Unequal due
   // times must not defeat rotation once both have history at the same instant.
   await pool.query('UPDATE send_job SET due_at=$2::timestamptz-CASE WHEN mailbox_id=$3 THEN interval \'2 seconds\' ELSE interval \'1 second\' END WHERE campaign_id=$1',[other.id,tickNow,third]);
   const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');let done=false;
   const pending=app.dispatch.claim(randomUUID(),tickNow).finally(()=>{done=true;});await new Promise(r=>setTimeout(r,50));assert.equal(done,false);
   assert.ok(Number((await pool.query("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=7 AND objid=1 AND NOT granted")).rows[0].count)>0);
   await blocker.query('ROLLBACK');blocker.release();const rotation1=await pending;const rotation2=await app.dispatch.claim(randomUUID(),tickNow);assert.ok(rotation1 && rotation2);assert.notEqual(rotation1.mailbox_id,rotation2.mailbox_id);
   const rotations=[rotation1,rotation2];
   for(let i=0;i<4;i++) {
    const claim=await app.dispatch.claim(randomUUID(),tickNow);assert.ok(claim);
    assert.equal(claim.mailbox_id,rotations[i]!.mailbox_id,'equal-clock claims must continue alternating after both senders have history');
    rotations.push(claim);
   }
   assert.equal(new Set(rotations.map(j=>j.id)).size,6);
   assert.ok(rotations.every(j=>j.claimed_at.getTime()===tickNow.getTime() && j.lease_until.getTime()===tickNow.getTime()+45000));
   assert.equal((await pool.query('SELECT count(*) FROM send_job j JOIN enrollment e ON e.id=j.enrollment_id WHERE j.campaign_id=$1 AND e.recipient_hash=$2',[other.id,recipientDigest('b@example.test',config.recipientHashKey)])).rows[0].count,'0');
   await app.campaigns.pause(actors[0]!.tenant_id,other.id);assert.equal((await pool.query("SELECT count(*) FROM send_job WHERE campaign_id=$1 AND state='claimed'",[other.id])).rows[0].count,'0');
   assert.equal(calls,0);
  });
 } finally {await new Promise<void>(resolve=>app.server.close(()=>resolve()));await pool.end();}
});
