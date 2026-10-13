import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { application } from '../src/server.js';
import { newSession } from '../src/auth/session.js';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate,ready } from '../src/db.js';
import { MailboxStore } from '../src/mailboxes/store.js';
import { CapacityStore } from '../src/mailboxes/capacity.js';
import { eligibilityTransaction } from '../src/consent/transaction.js';
import { complaintClient,DispatchSeams } from '../src/dispatch/seams.js';
import { ConsentStore } from '../src/consent/store.js';
import { PoolStore } from '../src/pool/store.js';
import { DispatchStore } from '../src/dispatch/store.js';
import { SubmissionStore } from '../src/dispatch/submission.js';
import { seedTestEntitlement } from './billing-fixture.js';
import { currentEntitlement } from '../src/billing/plans.js';
test('F07 real PostgreSQL capacity boundaries and atomic safety',{timeout:90000},async t=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl);await migrate(pool);await migrate(pool);
 await pool.query('TRUNCATE tenant,auth_bucket,public_stop_bucket CASCADE');
 const boxes=new MailboxStore(pool,config.credentialKeyring,config.providerAllowlist,async()=>[{address:'8.8.8.8',family:4}]);
 const capacity=new CapacityStore(pool),consents=new ConsentStore(pool,config.credentialKeyring),seams=new DispatchSeams(pool);
 const raw={label:'capacity',senderAddress:'capacity@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'N7_F07_SECRET_CANARY',smtpPassword:'N7_F07_SECRET_CANARY',imapUsername:'N7_F07_SECRET_CANARY',imapPassword:'N7_F07_SECRET_CANARY'};
 const tenants=[randomUUID(),randomUUID(),randomUUID()];await pool.query('INSERT INTO tenant(id) VALUES($1),($2),($3)',tenants);
 const actors=tenants.map(tenant_id=>({tenant_id,account_id:randomUUID()}));
 for(const actor of actors)await pool.query("INSERT INTO account(id,tenant_id,email,password_hash) VALUES($1,$2,$3,'fixture')",[actor.account_id,actor.tenant_id,actor.account_id+'@example.test']);
 const ids:string[]=[];
 const count=async()=>Number((await pool.query("SELECT count(*) FROM capacity_lease WHERE state='active' AND expires_at>clock_timestamp()")).rows[0].count);
 try {
  await t.test('creates101st connected mailbox for free and expired TEST team without send',async()=>{
   for(const tenant of tenants.slice(0,2)) {
    if(tenant===tenants[1])await seedTestEntitlement(pool,tenant!);
    for(let i=0;i<101;i++)await boxes.save(tenant!,{...raw,label:'box'+i});
    assert.equal((await boxes.list(tenant!)).total,101);
    await pool.query('UPDATE billing_entitlement SET revoked_at=clock_timestamp() WHERE tenant_id=$1',[tenant]);
    assert.ok((await boxes.save(tenant!,raw)).id);
   }
   assert.equal(await count(),0);assert.equal(Number((await pool.query('SELECT count(*) FROM send_job')).rows[0].count),0);
   assert.equal((await currentEntitlement(pool,tenants[0]!)).limits.mailboxes,null);
  });
  await t.test('tenant pages remain bounded and foreign capacity actions cause no side effects',async()=>{
   const seen=new Set<string>();let after:string|undefined;
   do {const page=await boxes.list(tenants[0]!,25,after);assert.ok(page.items.length<=25);assert.equal(page.total,102);for(const row of page.items){assert.ok(!seen.has(row.id));seen.add(row.id);assert.doesNotMatch(JSON.stringify(row),/N7_F07_SECRET_CANARY|credential_envelope/);}after=page.nextCursor??undefined;}while(after);
   assert.equal(seen.size,102);const foreign=(await boxes.list(tenants[1]!)).items[0].id;
   await assert.rejects(boxes.list(tenants[0]!,25,foreign),{code:'not_found'});
   await assert.rejects(capacity.act(tenants[0]!,foreign,'activate'),{code:'not_found'});
   assert.equal(await count(),0);
  });
  await t.test('global30 admission serializes competing tenants and duplicate requests',async()=>{
   for(let i=0;i<31;i++){const tenant=tenants[i%3]!;const box=await boxes.save(tenant,raw);ids.push(box.id);await boxes.verify(tenant,box.id);}
   const results=await Promise.all(ids.map((id,i)=>capacity.act(tenants[i%3]!,id,'activate')));
   assert.equal(results.filter(r=>r.state==='active').length,30);assert.equal(results.filter(r=>r.state==='waiting_capacity').length,1);assert.equal(await count(),30);
   const winner=results.findIndex(r=>r.state==='active');await Promise.all([capacity.act(tenants[winner%3]!,ids[winner]!,'activate'),capacity.act(tenants[winner%3]!,ids[winner]!,'activate')]);assert.equal(await count(),30);
   for(let i=0;i<ids.length;i++)await capacity.act(tenants[i%3]!,ids[i]!,'deactivate');
   for(let i=0;i<29;i++)await capacity.act(tenants[i%3]!,ids[i]!,'activate');
   const race=await Promise.all([29,30].map(i=>capacity.act(tenants[i%3]!,ids[i]!,'activate')));assert.deepEqual(race.map(r=>r.state).sort(),['active','waiting_capacity']);assert.equal(await count(),30);
  });
  await t.test('lease120 expiry release and stale renewal never resurrect stopped mailbox',async()=>{
   const before=Date.now(),lease=await capacity.act(tenants[0]!,ids[0]!,'renew');assert.ok(lease.expiresAt);assert.ok(lease.expiresAt!.getTime()>=before+120000 && lease.expiresAt!.getTime()<=Date.now()+120000);
   await eligibilityTransaction(pool,async c=>{await c.query('UPDATE capacity_lease SET expires_at=clock_timestamp() WHERE mailbox_id=$1',[ids[0]]);});
   assert.equal((await boxes.read(tenants[0]!,ids[0]!)).capacity.state,'waiting_capacity');await assert.rejects(capacity.act(tenants[0]!,ids[0]!,'renew'),{code:'capacity_lease_expired'});
   await capacity.act(tenants[0]!,ids[0]!,'activate');await boxes.save(tenants[0]!,raw,ids[0]);assert.equal((await boxes.read(tenants[0]!,ids[0]!)).capacity.state,'inactive');
   await assert.rejects(capacity.act(tenants[0]!,ids[0]!,'activate'),{code:'mailbox_changed'});await boxes.verify(tenants[0]!,ids[0]!);await capacity.act(tenants[0]!,ids[0]!,'activate');
  });
  await t.test('complaint quarantine immediately releases capacity for another tenant',async()=>{
   await capacity.act(tenants[0]!,ids[30]!,'deactivate');
   for(let i=0;i<30;i++)await capacity.act(tenants[i%3]!,ids[i]!,'activate');
   await capacity.act(tenants[0]!,ids[30]!,'activate');assert.equal((await boxes.read(tenants[0]!,ids[30]!)).capacity.state,'waiting_capacity');
   await assert.rejects(eligibilityTransaction(pool,async c=>{await complaintClient(c,tenants[1]!,ids[1]!);throw new Error('rollback');}),/rollback/);
   assert.equal((await boxes.read(tenants[1]!,ids[1]!)).state,'verified_test');assert.equal(await count(),30);
   await seams.complaint(tenants[1]!,ids[1]!);assert.equal((await boxes.read(tenants[1]!,ids[1]!)).capacity.state,'inactive');
   assert.equal((await capacity.act(tenants[0]!,ids[30]!,'activate')).state,'active');assert.equal(await count(),30);
   await assert.rejects(capacity.act(tenants[1]!,ids[1]!,'renew'),{code:'mailbox_changed'});
  });
  await t.test('sender and pool recipient need active lease at scheduling claim and final fence',async()=>{
   const sender=ids[4]!,recipient=ids[2]!;
   for(const [i,id] of [[1,sender],[2,recipient]] as const){await consents.act(actors[i]!,id,{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});await seams.recordPoll(tenants[i]!,id,{completedAt:new Date(),scanComplete:true,uidvalidity:'fixture',cursorUid:1});}
   const cohort=new PoolStore(pool),dispatch=new DispatchStore(pool);let calls=0;const submit=new SubmissionStore(pool,{...config,dispatchMode:'local_test'},{adapter:{mode:'local_test',async submit(){calls++;return {kind:'accepted'};}}});
   await capacity.act(tenants[1]!,sender,'deactivate');assert.equal((await cohort.tick()).created,0);assert.equal(await dispatch.claim(),null);await capacity.act(tenants[1]!,sender,'activate');
   assert.equal((await cohort.tick()).created,1);const job=await dispatch.claim();assert.ok(job);
   await eligibilityTransaction(pool,async c=>{await c.query('UPDATE capacity_lease SET expires_at=clock_timestamp() WHERE mailbox_id=$1',[recipient]);});assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);assert.equal(await dispatch.claim(),null);
   await capacity.act(tenants[2]!,recipient,'deactivate');assert.equal((await submit.submit(job.id,job.lease_owner)).calls,0);assert.equal(calls,0);assert.equal((await cohort.aggregate()).count,1);assert.equal(await dispatch.claim(),null);
   await capacity.act(tenants[2]!,recipient,'activate');const positive=await dispatch.claim();assert.ok(positive);assert.equal((await submit.submit(positive.id,positive.lease_owner)).calls,1);assert.equal(calls,1);
   await capacity.act(tenants[1]!,sender,'deactivate');assert.equal((await cohort.aggregate()).count,1);
  });
  await t.test('capacity writers sample database time after shared lock and rollback admission',async()=>{
   const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');let done=false;
   const pending=capacity.act(tenants[1]!,ids[4]!,'activate').then(r=>{done=true;return r;});await new Promise(r=>setTimeout(r,35));assert.equal(done,false);
   await blocker.query('COMMIT');blocker.release();const stamp=Date.now();const result=await pending;assert.ok(result.expiresAt!.getTime()>=stamp+119950);
   await assert.rejects(eligibilityTransaction(pool,async c=>{await c.query('DELETE FROM capacity_lease WHERE mailbox_id=$1',[ids[4]]);throw new Error('rollback');}),/rollback/);assert.equal((await boxes.read(tenants[1]!,ids[4]!)).capacity.state,'active');
   const lock=await pool.connect();await lock.query('BEGIN');await lock.query('SELECT pg_advisory_xact_lock(7,1)');await lock.query("UPDATE capacity_lease SET expires_at=clock_timestamp()+interval '50 milliseconds' WHERE mailbox_id=$1",[ids[4]]);const stale=capacity.act(tenants[1]!,ids[4]!,'renew');const rejected=assert.rejects(stale,{code:'capacity_lease_expired'});await new Promise(r=>setTimeout(r,90));await lock.query('COMMIT');lock.release();await rejected;
  });
  await t.test('strict own capacity API rejects auth origin malformed cursor and rate abuse',async()=>{
   const app=await application(config,pool);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const address=app.server.address();assert.ok(address && typeof address==='object');
   const token=newSession(config.sessionKey);await pool.query('INSERT INTO session(id,account_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[randomUUID(),actors[0]!.account_id,token.digest,token.expiresAt]);
   const request=(path:string,method='GET',input:unknown={},cookie=true,origin=config.origin)=>fetch(`http://127.0.0.1:${address.port}`+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:'n7_session='+token.token}:{})},body:method==='GET'?undefined:JSON.stringify(input)});
   try {
    const url='/api/mailboxes/'+ids[30]+'/capacity';assert.equal((await request(url,'POST',{action:'activate'},false)).status,401);assert.equal((await request(url,'POST',{action:'activate'},true,'http://bad.test')).status,403);
    assert.equal((await request('/api/mailboxes?limit=1.5')).status,400);assert.equal((await request('/api/mailboxes?after=bad')).status,400);assert.equal((await request('/api/mailboxes?after='+ids[2])).status,404);
    assert.equal((await request('/api/mailboxes/'+ids[2]+'/capacity','POST',{action:'activate'})).status,404);
    assert.equal((await request(url,'POST',{action:['activate']})).status,400);
    for(let i=0;i<28;i++)assert.equal((await request(url,'POST',{action:'bad'})).status,400);
    assert.equal((await request(url,'POST',{action:'bad'})).status,429);
   }finally{await new Promise<void>(r=>app.server.close(()=>r()));}
  });
  await t.test('real schema11 to12 upgrade preserves envelope states and has no automatic leases',async()=>{
   const database='n7_f07_migration_'+randomUUID().replaceAll('-','');await pool.query('CREATE DATABASE '+database);
   const url=new URL(config.databaseUrl);url.pathname='/'+database;const upgrade=createPool(url.toString());
   try {
    const files=['001-init','002-mailboxes-consent','003-dispatch','004-claim-order','005-submission','006-replies','007-reply-tail-horizon','008-suppression-fixture','009-poll-owner','010-billing','011-evidence'];
    for(const file of files)await upgrade.query(await readFile(new URL('../db/'+file+'.sql',import.meta.url),'utf8'));
    const source=(await pool.query('SELECT * FROM mailbox WHERE id=$1',[ids[30]])).rows[0];await upgrade.query('INSERT INTO tenant(id) VALUES($1)',[source.tenant_id]);
    await upgrade.query('INSERT INTO mailbox(id,tenant_id,label,state,credential_envelope,metadata,daily_limit,provider_limit) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[source.id,source.tenant_id,source.label,source.state,source.credential_envelope,source.metadata,source.daily_limit,source.provider_limit]);
    await migrate(upgrade);await migrate(upgrade);assert.equal(await ready(upgrade),true);const saved=(await upgrade.query('SELECT * FROM mailbox WHERE id=$1',[source.id])).rows[0];assert.deepEqual(saved.credential_envelope,source.credential_envelope);assert.equal(saved.state,source.state);assert.equal(Number((await upgrade.query('SELECT count(*) FROM capacity_lease')).rows[0].count),0);
   }finally{await upgrade.end();await pool.query('DROP DATABASE '+database);}
  });
  await t.test('additive migration idempotency keeps records without implicit lease',async()=>{
   const total=(await boxes.list(tenants[0]!)).total;await migrate(pool);assert.equal(await ready(pool),true);assert.equal((await boxes.list(tenants[0]!)).total,total);
   const first=(await boxes.list(tenants[0]!)).items[0];assert.equal(first.capacity.state,'inactive');assert.equal((await currentEntitlement(pool,tenants[0]!)).limits.activeCampaigns,3);
  });
 }finally{await pool.query('TRUNCATE tenant,auth_bucket,public_stop_bucket CASCADE');await pool.end();}
});
