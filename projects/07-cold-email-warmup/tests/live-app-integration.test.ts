import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { LiveBillingService } from '../src/billing/live.js';
import { YooKassaProvider } from '../src/billing/yookassa.js';
import { currentEntitlement } from '../src/billing/plans.js';
import { seedTestEntitlement } from './billing-fixture.js';
import type { Identity } from '../src/auth/store.js';
test('live native backend admission, canonical refund context and TEST isolation',async t=>{
 const pool=createPool(loadConfig().databaseUrl);assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'n7billing_20261007_a1');await migrate(pool);await pool.query('TRUNCATE tenant,auth_bucket,public_stop_bucket CASCADE');
 const config={...loadConfig(),origin:'https://cabinet.example',billingMode:'live_provider' as const,liveBilling:{shopId:'123',secretKey:'PRIVATE_LIVE_CANARY',amountMinor:25000}};
 const payments=new Map<string,Record<string,unknown>>(),orders=new Map<string,string>(),refunds=new Map<string,Record<string,unknown>>(),calls:string[]=[];
 let hold:Promise<void>|null=null,release:()=>void=()=>{},outage=false;
 const provider=new YooKassaProvider({shopId:'123',secretKey:'PRIVATE_LIVE_CANARY',async fetchImpl(url,init){
  const path=String(url).slice('https://api.yookassa.ru/v3'.length);calls.push((init?.method??'GET')+' '+path);
  if(hold)await hold;if(outage)throw new Error('offline outage');let raw:Record<string,unknown>;
  if(init?.method==='POST'){const body=JSON.parse(String(init.body)),key=new Headers(init.headers).get('idempotence-key')!;let id=orders.get(key);if(!id){id=randomUUID();orders.set(key,id);payments.set(id,{id,status:'pending',paid:false,test:false,recipient:{account_id:'123'},metadata:body.metadata,amount:body.amount,confirmation:{confirmation_url:'https://yoomoney.ru/pay'}});}raw=payments.get(id)!;}
  else if(path.startsWith('/refunds/'))raw=refunds.get(path.slice(9))!;else raw=payments.get(path.slice(10))!;
  return new Response(JSON.stringify(raw),{headers:{'content-type':'application/json'}});
 }});
 const app=await application(config,pool,{canonicalProvider:provider,resolver:async()=>[{address:'8.8.8.8',family:4}]});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));const address=app.server.address();assert.ok(address && typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 const request=async(path:string,method='GET',cookie?:string,value:unknown={},origin:string|null=config.origin,extra:Record<string,string>={})=>{const r=await fetch(base+path,{method,redirect:'manual',headers:{'Content-Type':'application/json',...(origin===null?{}:{Origin:origin}),...(cookie?{Cookie:cookie}:{}),...extra},body:method==='GET'?undefined:JSON.stringify(value)});const text=await r.text();assert.doesNotMatch(text,/PRIVATE_LIVE_CANARY|create_request|first_create_attempt_at|merchant|secretKey/);return {status:r.status,data:r.headers.get('content-type')?.includes('json')?JSON.parse(text):null,text,headers:r.headers};};
 const clear=()=>pool.query('TRUNCATE public_stop_bucket');
 const register=async()=>{const r=await request('/api/auth/register','POST',undefined,{email:randomUUID()+'@example.test',password:randomBytes(20).toString('hex')});assert.equal(r.status,201);const cookie=r.headers.get('set-cookie')!.split(';')[0]!;return {cookie,identity:(await request('/api/auth/me','GET',cookie)).data.data as Identity};};
 const webhook=(event:string,id:string,origin:string|null=null,cookie?:string)=>request('/api/billing/webhooks/yookassa','POST',cookie,{event,object:{id,status:'forged'}},origin);
 try {
  const owner=await register(),other=await register(),tenant=owner.identity.tenant_id;
  let intentId='',paymentId='',reportToken='',boxId='';const pendingCampaigns:string[]=[];
  await t.test('tenant checkout safe configured DTO, TEST grant ignored and redirect is not payment',async()=>{
   await seedTestEntitlement(pool,tenant);assert.equal((await currentEntitlement(pool,tenant,'local_test')).plan,'team');assert.equal((await currentEntitlement(pool,tenant,'live_provider')).plan,'free');assert.equal((await currentEntitlement(pool,tenant,'disabled')).plan,'free');
   assert.equal((await request('/api/billing/status','GET',owner.cookie)).data.data.plan,'free');
   for(const patch of [{amount:1},{currency:'USD'},{paid:true},{code:'deferred'}])assert.equal((await request('/api/billing/checkout','POST',owner.cookie,{plan:'team',idempotencyKey:randomUUID(),...patch})).status,400);
   const result=await request('/api/billing/checkout','POST',owner.cookie,{plan:'team',idempotencyKey:randomUUID()});assert.equal(result.status,201);assert.equal(result.data.data.label,'LIVE');assert.equal(result.data.data.price.amountMinor,25000);assert.equal(result.data.data.checkoutUrl,'https://yoomoney.ru/pay');assert.equal(result.data.data.entitlement.plan,'free');intentId=result.data.data.id;paymentId=orders.get(intentId)!;
   const before=calls.length;assert.equal((await request('/api/billing/intents/'+intentId,'GET',other.cookie)).status,404);assert.equal(calls.length,before);assert.equal((await request('/api/billing/intents/'+intentId)).status,401);assert.equal(calls.length,before);
   assert.equal((await request('/app?billingIntent='+intentId+'&paid=true','GET',owner.cookie)).status,200);assert.equal((await currentEntitlement(pool,tenant,'live_provider')).plan,'free');
   const history=(await request('/api/app','GET',owner.cookie)).data.data.intents;assert.deepEqual(new Set(history.map((i:{label:string})=>i.label)),new Set(['LIVE','TEST']));assert.equal(result.headers.get('cache-control'),'no-store');
   await clear();
  });
  await t.test('TEST Team cannot unlock live campaign capacity or public report badge',async()=>{
   const box=await app.mailboxes.save(tenant,{label:'Live fixture',senderAddress:'sender@example.test',smtpHost:'smtp.gmail.com',smtpPort:587,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:'offline',smtpPassword:'offline',imapUsername:'offline',imapPassword:'offline'});boxId=box.id;
   const campaigns:string[]=[];for(let i=0;i<12;i++){const c=await app.consents.campaign(owner.identity,{content:'Hello',recipients:[`r${i}@example.test`]});await app.consents.act(owner.identity,boxId,{scope:'campaign',action:'grant',affirmative:true,campaignId:c.id,scopeVersion:c.content_version,recipientFingerprint:c.recipient_fingerprint});campaigns.push(c.id);}
   const results=await Promise.allSettled(campaigns.map(id=>app.campaigns.start(owner.identity,id,{mailboxIds:[boxId]})));assert.equal(results.filter(r=>r.status==='fulfilled').length,3);for(let i=0;i<results.length;i++)if(results[i]!.status==='rejected')pendingCampaigns.push(campaigns[i]!);
   const now=Date.now(),day=86400000;const observation=(end:number,numerator:number)=>({sourceUrl:'https://source.example/manual',reference:'offline evidence',observedAt:new Date(end).toISOString(),windowStart:new Date(end-day).toISOString(),windowEnd:new Date(end).toISOString(),metric:'inbox_placement',unit:'count',direction:'higher',numerator,denominator:30,manualVerified:true});
   const baseline=await app.evidence.create(tenant,observation(now-2*day,10)),latest=await app.evidence.create(tenant,observation(now-day,20));const report=await app.reports.share(tenant,{baselineId:baseline.id,latestId:latest.id,idempotencyKey:randomUUID()});reportToken=report.url.slice(9);assert.match(await app.reports.view(reportToken),/data-n7-source-badge/);
   const operator=readFileSync(process.env.OPERATOR_TOKEN_FILE!,'utf8').trim(),before=calls.length;
   assert.equal((await request('/api/operator/billing/reconcile','POST',undefined,{intentId},null,{Authorization:'Bearer '+operator})).status,503);assert.equal(calls.length,before);await clear();
  });
  await t.test('exact public webhook policy, unknown binding, malformed/oversize and durable rate',async()=>{
   const before=calls.length;assert.equal((await webhook('payment.succeeded',randomUUID())).status,200);assert.equal(calls.length,before);
   assert.equal((await webhook('payment.succeeded',paymentId,config.origin)).status,403);assert.equal((await webhook('payment.succeeded',paymentId,null,owner.cookie)).status,403);
   assert.equal((await request('/api/billing/webhooks/yookassa/','POST',undefined,{},null)).status,403);assert.equal((await request('/api/billing/webhooks/yookassa','GET',undefined,{},null)).status,401);
   assert.equal((await request('/api/billing/webhooks/yookassa','POST',undefined,{event:'bad'},null)).status,400);
   assert.equal((await request('/api/billing/webhooks/yookassa','POST',undefined,{padding:'x'.repeat(65536)},null)).status,413);assert.equal(calls.length,before);
   const malformed=await fetch(base+'/api/billing/webhooks/yookassa',{method:'POST',headers:{'Content-Type':'application/json'},body:'{' });assert.equal(malformed.status,400);
   const wrongType=await fetch(base+'/api/billing/webhooks/yookassa',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});assert.equal(wrongType.status,400);
   const chunks=new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode('{"padding":"'+'x'.repeat(32768)));c.enqueue(new TextEncoder().encode('x'.repeat(32768)+'"}'));c.close();}});
   const streamed=await fetch(base+'/api/billing/webhooks/yookassa',{method:'POST',headers:{'Content-Type':'application/json'},body:chunks,duplex:'half'} as RequestInit & {duplex:'half'});assert.equal(streamed.status,413);assert.equal(calls.length,before);
   await clear();for(let i=0;i<30;i++)assert.equal((await webhook('payment.succeeded',randomUUID())).status,200);assert.equal((await webhook('payment.succeeded',paymentId)).status,429);assert.equal(calls.length,before);await clear();
  });
  await t.test('shared two-operation gate across refresh checkout webhook, release and unrelated responsiveness',async()=>{
   hold=new Promise<void>(r=>{release=r;});const before=calls.length;
   const first=webhook('payment.succeeded',paymentId),second=request('/api/billing/intents/'+intentId,'GET',owner.cookie);
   for(let i=0;calls.length<before+2 && i<100;i++)await new Promise(r=>setTimeout(r,5));assert.equal(calls.length,before+2);
   assert.equal((await request('/api/billing/checkout','POST',owner.cookie,{plan:'team',idempotencyKey:randomUUID()})).status,429);assert.equal(calls.length,before+2);assert.equal((await request('/api/auth/me','GET',owner.cookie)).status,200);
   hold=null;release();assert.equal((await first).status,200);assert.equal((await second).status,200);
   outage=true;assert.equal((await webhook('payment.succeeded',paymentId)).status,503);outage=false;assert.equal((await webhook('payment.succeeded',paymentId)).status,200);await clear();
  });
  await t.test('canonical success and concurrent partial refunds use exactly two GETs and revoke permanently',async()=>{
   Object.assign(payments.get(paymentId)!,{status:'succeeded',paid:true,captured_at:new Date(Date.now()-1000).toISOString()});assert.equal((await webhook('payment.succeeded',paymentId)).status,200);assert.equal((await currentEntitlement(pool,tenant,'live_provider')).plan,'team');
   assert.doesNotMatch(await app.reports.view(reportToken),/data-n7-source-badge/);const starts=await Promise.allSettled(pendingCampaigns.map(id=>app.campaigns.start(owner.identity,id,{mailboxIds:[boxId]})));assert.equal(starts.filter(r=>r.status==='fulfilled').length,7);
   outage=true;const unavailable=await request('/api/billing/status','GET',owner.cookie);outage=false;assert.equal(unavailable.status,200);assert.equal(unavailable.data.data.plan,'team');assert.equal(unavailable.data.data.availability,'unavailable');
   const expiry=(await pool.query('SELECT expires_at FROM live_billing_entitlement WHERE intent_id=$1',[intentId])).rows[0].expires_at;
   const unknownRefund=randomUUID();refunds.set(unknownRefund,{id:unknownRefund,payment_id:randomUUID(),status:'succeeded',amount:{value:'0.01',currency:'RUB'},created_at:new Date().toISOString()});const unknownBefore=calls.length;assert.equal((await webhook('refund.succeeded',unknownRefund)).status,200);assert.deepEqual(calls.slice(unknownBefore),['GET /refunds/'+unknownRefund]);
   const refund=randomUUID();refunds.set(refund,{id:refund,payment_id:paymentId,status:'succeeded',amount:{value:'0.01',currency:'RUB'},created_at:new Date().toISOString()});const before=calls.length;
   const results=await Promise.all([webhook('refund.succeeded',refund),webhook('refund.succeeded',refund)]);assert.ok(results.every(r=>r.status===200));assert.equal(calls.length-before,4);assert.equal(calls.slice(before).filter(c=>c==='GET /payments/'+paymentId).length,2);
   const known=new LiveBillingService(pool,provider,{provider:'yookassa',merchant:'123',plan:'team',amountMinor:25000,currency:'RUB',durationDays:30});const knownBefore=calls.length;await known.reconcile(tenant,intentId,refund);assert.deepEqual(calls.slice(knownBefore),['GET /refunds/'+refund,'GET /payments/'+paymentId]);
   assert.equal((await currentEntitlement(pool,tenant,'live_provider')).plan,'free');assert.equal((await currentEntitlement(pool,tenant,'local_test')).plan,'team');assert.match(await app.reports.view(reportToken),/data-n7-source-badge/);assert.equal((await webhook('payment.succeeded',paymentId)).status,200);assert.equal((await currentEntitlement(pool,tenant,'live_provider')).plan,'free');assert.deepEqual((await pool.query('SELECT expires_at FROM live_billing_entitlement WHERE intent_id=$1',[intentId])).rows[0].expires_at,expiry);
   assert.equal((await request('/api/billing/intents/'+intentId,'GET',owner.cookie)).data.data.state,'refunded');await clear();
  });
 } finally {hold=null;release();await new Promise<void>(r=>app.server.close(()=>r()));await pool.end();}
});
