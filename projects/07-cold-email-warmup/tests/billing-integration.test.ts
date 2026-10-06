import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { BillingService } from '../src/billing/service.js';
import { LocalProvider } from '../src/billing/provider.js';
import { referralToken } from '../src/growth/attribution.js';
import { currentEntitlement } from '../src/billing/plans.js';
import { seedTestEntitlement } from './billing-fixture.js';
import type { Identity } from '../src/auth/store.js';
test('F05 A1–A6 real PostgreSQL HTTP and canonical race gates',async t=>{
 const config={...loadConfig(),billingMode:'local_test' as const},pool=createPool(config.databaseUrl);await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket,public_stop_bucket CASCADE');
 const app=await application(config,pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const addr=app.server.address();assert.ok(addr && typeof addr==='object');const base=`http://127.0.0.1:${addr.port}`;
 const operator=readFileSync(process.env.OPERATOR_TOKEN_FILE!,'utf8').trim();
 const request=async(path:string,method='GET',cookie?:string,payload:unknown={},op=false,origin:string|undefined=config.origin)=>{
  const response=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(op?{Authorization:'Bearer '+operator}:{})},body:method==='GET'?undefined:JSON.stringify(payload)});
  const text=await response.text();assert.ok(!text.includes(operator));assert.ok(!text.includes('N7_F05_SECRET_CANARY'));
  return {status:response.status,data:text?JSON.parse(text):{},cookie:response.headers.get('set-cookie')?.split(';')[0],location:response.headers.get('location')};
 };
 const register=async(n:string)=>{const r=await request('/api/auth/register','POST',undefined,{email:n+'@example.test',password:randomBytes(20).toString('hex')});assert.equal(r.status,201);const cookie=r.cookie!;return {cookie,identity:(await request('/api/auth/me','GET',cookie)).data.data as Identity};};
 const clearRate=()=>pool.query('TRUNCATE public_stop_bucket');
 const checkout=(cookie:string,key=randomUUID(),code?:string)=>request('/api/billing/checkout','POST',cookie,{plan:'team',idempotencyKey:key,...(code?{code}:{})});
 const simulate=(paymentId:string,status:string,extra:Record<string,unknown>={})=>request('/api/operator/billing/simulate','POST',undefined,{paymentId,status,...extra},true);
 const reconcile=(intentId:string)=>request('/api/operator/billing/reconcile','POST',undefined,{intentId},true);
 const count=async(table:string)=>Number((await pool.query('SELECT count(*) FROM '+table)).rows[0].count);
 const raw={label:'mail',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'N7_F05_SECRET_CANARY',smtpPassword:'N7_F05_SECRET_CANARY',imapUsername:'N7_F05_SECRET_CANARY',imapPassword:'N7_F05_SECRET_CANARY'};
 try {
  const partner=await register('partner'),buyer=await register('buyer'),buyer2=await register('buyer2'),other=await register('other');
  const pc=await request('/api/partner','POST',partner.cookie);assert.equal(pc.status,201);const code=pc.data.data.code;
  await t.test('A2 explicit priority, cookie failure reasons, self/inactive and tenant404',async()=>{
   const landing=await request('/r/'+code);assert.equal(landing.status,303);assert.equal(landing.location,'/');assert.ok(landing.cookie);
   const c=await checkout(buyer.cookie+'; '+landing.cookie,randomUUID(),'invalid');assert.equal(c.status,400);assert.equal(await count('billing_intent'),0);
   assert.equal((await checkout(partner.cookie,randomUUID(),code)).data.error.code,'self_referral');
   assert.equal((await request('/api/partner/'+code,'GET',buyer.cookie)).status,404);
   await request('/api/partner','PATCH',partner.cookie,{active:false});assert.equal((await checkout(buyer.cookie,randomUUID(),code)).data.error.code,'inactive_partner_code');await request('/api/partner','PATCH',partner.cookie,{active:true});
   const absent=await checkout(other.cookie);assert.equal(absent.data.data.attribution_reason,'cookie_absent');
   const bad=await checkout(other.cookie+'; n7_referral=bad');assert.equal(bad.data.data.attribution_reason,'cookie_invalid');
   const expired=await checkout(other.cookie+'; n7_referral='+referralToken(code,config.sessionKey,Date.now()-31*86400000));assert.equal(expired.data.data.attribution_reason,'cookie_expired');
   const valid=await checkout(buyer2.cookie+'; '+landing.cookie);assert.equal(valid.data.data.attribution_reason,'cookie_valid');
   await clearRate();
  });
  await t.test('A3 parallel HTTP idempotency, immutable payload, crash recovery and disabled zero-state',async()=>{
   const key=randomUUID();const replies=await Promise.all(Array.from({length:8},()=>checkout(buyer.cookie,key,code)));assert.ok(replies.every(r=>r.status===201));assert.equal(new Set(replies.map(r=>r.data.data.id)).size,1);
   const id=replies[0]!.data.data.id;assert.equal(Number((await pool.query('SELECT count(*) FROM local_provider_payment WHERE provider_key=$1',[id])).rows[0].count),1);
   assert.equal((await checkout(buyer.cookie,key)).status,409);
   for(const extra of [{amount:1},{currency:'USD'},{durationDays:365},{status:'succeeded'}]) assert.equal((await request('/api/billing/checkout','POST',buyer.cookie,{plan:'team',idempotencyKey:randomUUID(),...extra})).status,400);
   assert.equal((await checkout('n7_session=forged')).status,401);assert.equal((await request('/api/billing/checkout','POST',buyer.cookie,{plan:'team',idempotencyKey:randomUUID()},false,'http://wrong.test')).status,403);
   assert.equal((await request('/api/billing/intents/'+id,'GET',other.cookie)).status,404);
   const provider=new LocalProvider(pool,'local_test');let crash=true;
   const interrupted=new BillingService(pool,config.sessionKey,'local_test',{async create(i){const p=await provider.create(i);if(crash){crash=false;throw new Error('crash');}return p;},fetch:id=>provider.fetch(id)});
   const crashKey=randomUUID();await assert.rejects(interrupted.checkout(other.identity.tenant_id,{plan:'team',idempotencyKey:crashKey}));
   const recovered=await interrupted.checkout(other.identity.tenant_id,{plan:'team',idempotencyKey:crashKey});assert.equal(Number((await pool.query('SELECT count(*) FROM local_provider_payment WHERE provider_key=$1',[recovered.id])).rows[0].count),1);
   const before=[await count('local_provider_payment'),await count('billing_entitlement')];await assert.rejects(new BillingService(pool,config.sessionKey).checkout(other.identity.tenant_id,{plan:'team',idempotencyKey:randomUUID()}));assert.deepEqual([await count('local_provider_payment'),await count('billing_entitlement')],before);
   await clearRate();
  });
  await t.test('A4/5 HTTP canonical success, frozen attribution, replay fixed expiry, two buyers and cancellation',async()=>{
   const c=(await checkout(buyer.cookie,randomUUID(),code)).data.data;assert.ok((await pool.query('SELECT partner_tenant FROM billing_intent WHERE id=$1',[c.id])).rows[0].partner_tenant);
   assert.equal((await request('/api/operator/billing/simulate','POST',buyer.cookie,{paymentId:c.payment_id,status:'succeeded'})).status,401);
   assert.equal((await request('/api/billing/intents/'+c.id+'?paid=true','GET',buyer.cookie)).data.data.entitlement.plan,'free');assert.equal(await count('billing_entitlement'),0);
   await request('/api/partner','PATCH',partner.cookie,{active:false});assert.equal((await simulate(c.payment_id,'succeeded')).status,200);
   assert.equal((await reconcile(c.id)).status,200);const expiry=(await pool.query('SELECT expires_at FROM billing_entitlement WHERE intent_id=$1',[c.id])).rows[0].expires_at;
   await clearRate();await Promise.all(Array.from({length:8},()=>reconcile(c.id)));assert.equal(Number((await pool.query('SELECT count(*) FROM billing_entitlement WHERE intent_id=$1',[c.id])).rows[0].count),1);assert.deepEqual((await pool.query('SELECT expires_at FROM billing_entitlement WHERE intent_id=$1',[c.id])).rows[0].expires_at,expiry);
   const second=(await pool.query("SELECT * FROM billing_intent WHERE tenant_id=$1 AND attribution_reason='cookie_valid'",[buyer2.identity.tenant_id])).rows[0];await simulate(second.payment_id,'succeeded');await reconcile(second.id);
   const aggregate=(await request('/api/partner','GET',partner.cookie)).data.data;assert.equal(aggregate.conversions,2);assert.equal(aggregate.label,'TEST');assert.ok(!JSON.stringify(aggregate).includes(buyer.identity.tenant_id));
   await simulate(c.payment_id,'revoked');assert.equal((await currentEntitlement(pool,buyer.identity.tenant_id)).plan,'free');await reconcile(c.id);assert.equal((await simulate(c.payment_id,'succeeded')).status,409);
   await request('/api/partner','PATCH',partner.cookie,{active:true});await clearRate();
  });
  await t.test('A4 canonical mismatch, unavailable503, bounded callback, stale cancel/expiry barriers',async()=>{
   for(const patch of [{amountMinor:101},{currency:'USD'},{metadata:{tenant:buyer.identity.tenant_id,intent:randomUUID(),plan:'team',durationDays:30}}]) {
    const c=(await checkout(other.cookie)).data.data;await simulate(c.payment_id,'succeeded',patch);assert.equal((await reconcile(c.id)).status,409);assert.equal(Number((await pool.query('SELECT count(*) FROM billing_entitlement WHERE intent_id=$1',[c.id])).rows[0].count),0);
   }
   const unavailable=(await checkout(other.cookie)).data.data;await simulate(unavailable.payment_id,'pending',{available:false});assert.equal((await reconcile(unavailable.id)).status,503);
   const large=await request('/api/operator/billing/reconcile','POST',undefined,{intentId:randomUUID(),padding:'x'.repeat(65536)},true);assert.equal(large.status,413);
   await clearRate();
   for(const terminal of ['canceled','expired']) {
    const c=(await checkout(other.cookie)).data.data;await simulate(c.payment_id,'succeeded');
    let fetched!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{fetched=r;}),barrier=new Promise<void>(r=>{release=r;});
    const provider=new LocalProvider(pool,'local_test');const delayed=new BillingService(pool,config.sessionKey,'local_test',{create:i=>provider.create(i),async fetch(id){const p=await provider.fetch(id);fetched();await barrier;return p;}});
    const pending=delayed.reconcile(c.id);await ready;await simulate(c.payment_id,terminal);release();await assert.rejects(pending,(e:unknown)=>!!e && typeof e==='object' && 'code' in e && e.code==='canonical_changed');
    await reconcile(c.id);assert.equal(Number((await pool.query('SELECT count(*) FROM billing_entitlement WHERE intent_id=$1',[c.id])).rows[0].count),0);
   }
   const expired=(await checkout(other.cookie)).data.data;await simulate(expired.payment_id,'succeeded',{paidAt:new Date(Date.now()-31*86400000).toISOString()});await reconcile(expired.id);assert.equal(Number((await pool.query('SELECT count(*) FROM billing_entitlement WHERE intent_id=$1',[expired.id])).rows[0].count),0);
   await clearRate();
  });
  await t.test('A1 unlimited connected preserves TEST billing and post-lock expiry, existing edit retained',async()=>{
   const tenant=other.identity.tenant_id;
   const results=await Promise.allSettled(Array.from({length:8},()=>app.mailboxes.save(tenant,raw)));assert.equal(results.filter(r=>r.status==='fulfilled').length,8);
   await seedTestEntitlement(pool,tenant);const team=await Promise.allSettled(Array.from({length:10},()=>app.mailboxes.save(tenant,raw)));assert.equal(team.filter(r=>r.status==='fulfilled').length,10);assert.equal((await app.mailboxes.list(tenant)).total,18);
   const expiryTenant=randomUUID();await pool.query('INSERT INTO tenant(id) VALUES($1)',[expiryTenant]);for(let i=0;i<3;i++) await app.mailboxes.save(expiryTenant,raw);await seedTestEntitlement(pool,expiryTenant);
   const blocker=await pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(7,1)');
   const pending=app.mailboxes.save(expiryTenant,raw);await new Promise(r=>setTimeout(r,30));const paidAt=new Date(Date.now()-31*86400000);await blocker.query('UPDATE billing_entitlement SET paid_at=$2,expires_at=$3 WHERE tenant_id=$1',[expiryTenant,paidAt,new Date(paidAt.getTime()+30*86400000)]);
   await blocker.query('COMMIT');blocker.release();assert.ok((await pending).id);
   await pool.query("UPDATE billing_entitlement SET revoked_at=clock_timestamp() WHERE tenant_id=$1",[tenant]);
   const boxes=(await app.mailboxes.list(tenant)).items;assert.equal(boxes.length,18);assert.equal((await currentEntitlement(pool,tenant)).plan,'free');assert.equal((await app.mailboxes.save(tenant,raw,boxes[0].id)).id,boxes[0].id);assert.equal((await app.mailboxes.change(tenant,boxes[0].id,{state:'paused'})).state,'paused');
  });
  await t.test('A1 campaign concurrency and active duplicate after expiry',async()=>{
   const tenant=other.identity.tenant_id,box=(await app.mailboxes.list(tenant)).items[0]!.id;
   const campaigns:Awaited<ReturnType<typeof app.consents.campaign>>[]=[];for(let i=0;i<5;i++){const c=await app.consents.campaign(other.identity,{content:'Hello',recipients:[`r${i}@example.test`]});await app.consents.act(other.identity,box,{scope:'campaign',action:'grant',affirmative:true,campaignId:c.id,scopeVersion:c.content_version,recipientFingerprint:c.recipient_fingerprint});campaigns.push(c);}
   const starts=await Promise.allSettled(campaigns.map(c=>app.campaigns.start(other.identity,c.id,{mailboxIds:[box]})));assert.equal(starts.filter(x=>x.status==='fulfilled').length,3);
   const active=(await app.campaigns.list(tenant)).find(x=>x.state==='active')!;assert.equal((await app.campaigns.start(other.identity,active.id,{mailboxIds:[box]})).created,0);
   await app.campaigns.pause(tenant,active.id);const blocked=campaigns.find(c=>starts[campaigns.indexOf(c)]!.status==='rejected')!;assert.equal((await app.campaigns.start(other.identity,blocked.id,{mailboxIds:[box]})).state,'active');
   await seedTestEntitlement(pool,tenant);const extra:typeof campaigns=[];for(let i=0;i<9;i++){const c=await app.consents.campaign(other.identity,{content:'Hello',recipients:[`team${i}@example.test`]});await app.consents.act(other.identity,box,{scope:'campaign',action:'grant',affirmative:true,campaignId:c.id,scopeVersion:c.content_version,recipientFingerprint:c.recipient_fingerprint});extra.push(c);}
   const team=await Promise.allSettled(extra.map(c=>app.campaigns.start(other.identity,c.id,{mailboxIds:[box]})));assert.equal(team.filter(x=>x.status==='fulfilled').length,7);
   await pool.query('UPDATE billing_entitlement SET revoked_at=clock_timestamp() WHERE tenant_id=$1',[tenant]);const stillActive=(await app.campaigns.list(tenant)).find(c=>c.state==='active')!;assert.equal((await app.campaigns.start(other.identity,stillActive.id,{mailboxIds:[box]})).created,0);await app.campaigns.pause(tenant,stillActive.id);await assert.rejects(app.campaigns.start(other.identity,stillActive.id,{mailboxIds:[box]}));
  });
 } finally {await new Promise<void>(r=>app.server.close(()=>r()));await pool.end();}
});
