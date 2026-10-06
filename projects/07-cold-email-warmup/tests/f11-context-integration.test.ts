import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test,type TestContext } from 'node:test';
import { LiveReplyAdapter } from '../src/replies/adapter.js';
import { publishTransportGrant,transportFingerprint } from '../src/mailboxes/transport-authority.js';
import { acquireTransportSlot,releaseUnusedTransportSlot } from '../src/mailboxes/transport-slots.js';
import { bodyFixture } from './f11-body-fixture.js';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { createPool,migrate,ready } from '../src/db.js';
import { application } from '../src/server.js';
import { ReplyStore } from '../src/replies/store.js';
import { ContextStore } from '../src/replies/context-store.js';
import { encryptContent } from '../src/replies/crypto.js';
import { seedCapacity } from './capacity-fixture.js';
export async function runF11ContextIntegration(t:TestContext){
 const config={...loadConfig(),dispatchMode:'local_test' as const},pool=createPool(config.databaseUrl);
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'n7f10_a2');
 await migrate(pool);await migrate(pool);assert.equal(await ready(pool),true);
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 const tenant=randomUUID(),foreign=randomUUID(),account=randomUUID(),now=new Date();let mailbox='',job='',enrollment='',message='';
 const store=new ReplyStore(pool,config.credentialKeyring,{clock:()=>now}),context=new ContextStore(pool,config.credentialKeyring);
 async function setup(){
  await pool.query('TRUNCATE tenant,auth_bucket CASCADE');
  await pool.query("INSERT INTO transport_operation(protocol,slot) VALUES('smtp',1),('smtp',2),('imap',1),('imap',2),('imap',3),('imap',4) ON CONFLICT DO NOTHING");
  await pool.query('INSERT INTO tenant(id) VALUES($1),($2)',[tenant,foreign]);await pool.query('INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,$4)',[account,tenant,'f11@example.test','fixture']);
  mailbox=(await app.mailboxes.save(tenant,{label:'F11',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'synthetic',smtpPassword:'synthetic',imapUsername:'synthetic',imapPassword:'synthetic'})).id;
  await pool.query("UPDATE mailbox SET state='verified_test'");await seedCapacity(pool,now);
  const actor={tenant_id:tenant,account_id:account};const campaign=await app.consents.campaign(actor,{steps:[{subject:'First',body:'Fixture',delayHours:24},{subject:'Next',body:'Fixture',delayHours:24}],recipients:[{address:'reply@example.test',fields:{}}]});
  await app.consents.act(actor,mailbox,{scope:'campaign',action:'grant',affirmative:true,scopeVersion:campaign.content_version,campaignId:campaign.id,recipientFingerprint:campaign.recipient_fingerprint});await app.campaigns.start(actor,campaign.id,{mailboxIds:[mailbox]},now);
  const j=(await pool.query("UPDATE send_job SET state='submitted',message_id='<f11-'||id::text||'@example.test>' WHERE step=0 RETURNING *")).rows[0];job=j.id;enrollment=j.enrollment_id;message=j.message_id;
 }
 let provenance:'local_fixture'|'imap_headers'='local_fixture';
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
  await t.test('native claim grant fences semantic replay and physical poll reservation',async()=>{
   await setup();provenance='imap_headers';await page('1');
   await store.page(tenant,mailbox,{runId:(await store.status(tenant,mailbox))!.runId,attempt:1,uidvalidity:'1',expectedCursor:1,coveredThrough:1,kind:'tail',tailHighWater:1,startedAt:now,completedAt:now,headers:[]});
   const live={...config,pollMode:'live_provider' as const},f=await bodyFixture(),adapter=new LiveReplyAdapter(pool,live,f.fixture),e=(await pool.query('SELECT * FROM incoming_ai_event')).rows[0];
   const token=(await readFile(process.env.OPERATOR_TOKEN_FILE!,'utf8')).trim();const grant={scope:'transport',tenant,mailbox,capabilities:['imap_headers'],smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,mailboxTransportRevision:'0',configFingerprint:transportFingerprint(config.providerAllowlist),expiresAt:new Date(Date.now()+600000).toISOString()};
   try{
    await publishTransportGrant(pool,live,token,tenant,mailbox,'0',grant);const claim=await context.claim(tenant,e.id);await assert.rejects(adapter.captureBody(claim));assert.equal(f.commands.length,0);await assert.rejects(context.claim(tenant,e.id));await assert.rejects(context.commitNative({},live));
    await publishTransportGrant(pool,live,token,tenant,mailbox,'1',{...grant,capabilities:['imap_body']});
    // Grant publication invalidates header completion: no body socket until poll completes.
    await assert.rejects(adapter.captureBody(claim));assert.equal(f.commands.length,0);await pool.query('UPDATE mailbox_poll SET scan_complete=true WHERE mailbox_id=$1',[mailbox]);
    const bad=new LiveReplyAdapter(pool,live,{...f.fixture,address:'fixture.invalid'});await assert.rejects(bad.captureBody(claim));assert.equal(f.commands.length,0);
    const before=(await pool.query('SELECT cursor_uid,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0];const proof=await adapter.captureBody(claim);assert.deepEqual(await context.commitNative(proof,live),{kind:'ready'});assert.deepEqual(await context.readContext(tenant,e.id),['What does the product do?']);await assert.rejects(context.commitNative(proof,live));assert.deepEqual((await pool.query('SELECT cursor_uid,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[mailbox])).rows[0],before);
    const semantic=(await pool.query('SELECT semantic_event_id FROM incoming_ai_event WHERE id=$1',[e.id])).rows[0].semantic_event_id;
    // UID-reset replay uses a fresh current run/claim, then links the opaque semantic event.
    await page('2');await pool.query('UPDATE mailbox_poll SET scan_complete=true WHERE mailbox_id=$1',[mailbox]);const e2=(await pool.query("SELECT * FROM incoming_ai_event WHERE uidvalidity='2'")).rows[0];f.commands.length=0;
    // A different EXAMINE generation cannot be asserted by caller labels.
    const claim2=await context.claim(tenant,e2.id);await assert.rejects(adapter.captureBody(claim2));assert.equal(f.commands.filter(c=>c.includes('FETCH')).length,0);
    f.behavior.validity='2';const replay=await adapter.captureBody(claim2);assert.deepEqual(await context.commitNative(replay,live),{kind:'replay'});assert.equal((await pool.query('SELECT semantic_event_id FROM incoming_ai_event WHERE id=$1',[e2.id])).rows[0].semantic_event_id,semantic);
    await page('3');await pool.query('UPDATE mailbox_poll SET scan_complete=true WHERE mailbox_id=$1',[mailbox]);f.behavior.validity='3';f.behavior.body=Buffer.from('A genuinely different own reply');const e3=(await pool.query("SELECT * FROM incoming_ai_event WHERE uidvalidity='3'")).rows[0],claim3=await context.claim(tenant,e3.id);const distinct=await adapter.captureBody(claim3);assert.deepEqual(await context.commitNative(distinct,live),{kind:'ready'});assert.notEqual((await pool.query('SELECT semantic_event_id FROM incoming_ai_event WHERE id=$1',[e3.id])).rows[0].semantic_event_id,semantic);
    await page('4');await pool.query('UPDATE mailbox_poll SET scan_complete=true WHERE mailbox_id=$1',[mailbox]);f.behavior.validity='4';const e4=(await pool.query("SELECT * FROM incoming_ai_event WHERE uidvalidity='4'")).rows[0],old=await context.claim(tenant,e4.id),staleProof=await adapter.captureBody(old);await pool.query("UPDATE incoming_ai_event SET lease_until=now()-interval '1 second' WHERE id=$1",[e4.id]);const newer=await context.claim(tenant,e4.id);await assert.rejects(context.commitNative(staleProof,live));assert.equal((await pool.query('SELECT owner_id FROM incoming_ai_event WHERE id=$1',[e4.id])).rows[0].owner_id,newer.owner);
    assert.equal((await pool.query('SELECT count(*) FROM transport_operation WHERE operation IS NOT NULL')).rows[0].count,'0');
    const held=[];for(let i=0;i<3;i++){const m=randomUUID();await pool.query("INSERT INTO mailbox(id,tenant_id,label,metadata,state) SELECT $2,tenant_id,'slot',metadata,state FROM mailbox WHERE id=$1",[mailbox,m]);held.push(await acquireTransportSlot(pool,'imap',tenant,m));}
    try{const commandsBefore=f.commands.length;await assert.rejects(adapter.captureBody(newer),/transport_busy/);assert.equal(f.commands.length,commandsBefore);const pollSlot=await acquireTransportSlot(pool,'imap',tenant,mailbox);assert.equal(pollSlot.slot,4);await releaseUnusedTransportSlot(pool,pollSlot);}finally{for(const slot of held)await releaseUnusedTransportSlot(pool,slot);}
    const revokedProof=await adapter.captureBody(newer);await publishTransportGrant(pool,live,token,tenant,mailbox,'2',null);await assert.rejects(context.commitNative(revokedProof,live));assert.equal((await pool.query('SELECT content_envelope FROM incoming_ai_event WHERE id=$1',[e4.id])).rows[0].content_envelope,null);
   }finally{await f.close();}
  });
 }finally{await pool.query('TRUNCATE tenant,auth_bucket CASCADE');await pool.end();}
}
test('F11 real PG additive migration, stop-first authenticated intent and retention',runF11ContextIntegration);
