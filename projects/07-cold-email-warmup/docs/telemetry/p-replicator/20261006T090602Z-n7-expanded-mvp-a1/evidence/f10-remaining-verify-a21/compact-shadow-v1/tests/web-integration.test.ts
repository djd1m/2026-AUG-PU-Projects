import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPool,migrate } from '../src/db.js';
import { application } from '../src/server.js';
import { cabinetCss } from '../src/web/cabinet.js';
test('F06 A real PostgreSQL protected cabinet, exact built assets and persistent accepted APIs',async t=>{
 const config=loadConfig(),pool=createPool(config.databaseUrl);await migrate(pool);
 await pool.query('TRUNCATE tenant,auth_bucket CASCADE');
 const app=await application({...config,billingMode:'local_test'},pool,{resolver:async()=>[{address:'8.8.8.8',family:4}]});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const address=app.server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 let cookie='';const password=randomBytes(24).toString('hex'),email=randomUUID()+'@example.test',canary='N7_F06_PRIVATE_'+randomBytes(12).toString('hex');
 const request=async(path:string,method='GET',payload:unknown={},auth=cookie)=>fetch(base+path,{method,redirect:'manual',headers:{Origin:config.origin,'Content-Type':'application/json',...(auth?{Cookie:auth}:{})},body:method==='GET'?undefined:JSON.stringify(payload)});
 const data=async(path:string,method='GET',payload:unknown={})=>{const r=await request(path,method,payload);assert.ok(r.ok,`${path} ${r.status}`);return (await r.json()).data;};
 try {
  await t.test('A1 route auth and A6 MIME/CSP/allowlist/build binding',async()=>{
   const denied=await request('/app');assert.equal(denied.status,303);assert.equal(denied.headers.get('location'),'/signin');assert.equal((await request('/api/app')).status,401);
   assert.match(await (await request('/signin')).text(),/Войдите/);
   const registration=await request('/api/auth/register','POST',{email,password});assert.equal(registration.status,201);cookie=registration.headers.get('set-cookie')!.split(';')[0]!;
   const shell=await request('/app');assert.equal(shell.status,200);const html=await shell.text();assert.match(html,/\/assets\/app.js/);assert.doesNotMatch(html,/token_hash|smtpPassword/);assert.match(shell.headers.get('content-security-policy')!,/script-src 'self'/);
   for(const asset of ['app','billing','campaigns','client','dom','evidence','mailboxes','models']){const r=await request('/assets/'+asset+'.js');assert.equal(r.status,200);assert.match(r.headers.get('content-type')!,/text\/javascript/);assert.equal(await r.text(),readFileSync(new URL('../dist/web/'+asset+'.js',import.meta.url),'utf8'));}
   const css=await request('/assets/cabinet.css');assert.match(css.headers.get('content-type')!,/text\/css/);assert.equal(await css.text(),cabinetCss);
   for(const asset of ['server.js','config.js','%2e%2e/server.js','unknown.js','app.ts'])assert.equal((await request('/assets/'+asset)).status,404);
   const metadata=await data('/api/app');assert.equal(metadata.modes.billing,'local_test');assert.equal(metadata.poolDisclosure.version,1);assert.doesNotMatch(JSON.stringify(metadata),/sessionKey|credentialKey|operatorToken|databaseUrl/);
  });
  await t.test('A2 mailbox save has no consent, persists masked, limit and independent grant/revoke',async()=>{
   const box=await data('/api/mailboxes','POST',{label:'F06 mailbox',senderAddress:'owner@example.test',smtpHost:'smtp.gmail.com',smtpPort:465,imapHost:'imap.gmail.com',imapPort:993,requiredTLS:true,smtpUsername:canary,smtpPassword:canary,imapUsername:canary,imapPassword:canary});
   assert.equal(box.daily_limit,10);assert.equal((await data(`/api/mailboxes/${box.id}/consents`)).length,0);assert.equal((await data('/api/mailboxes')).total,1);assert.doesNotMatch(JSON.stringify(await data('/api/mailboxes')),new RegExp(canary));
   assert.equal((await data(`/api/mailboxes/${box.id}/verify-test`,'POST')).state,'verified_test');
   await data(`/api/mailboxes/${box.id}`,'PATCH',{dailyLimit:7});assert.equal((await data('/api/mailboxes')).items[0].daily_limit,7);
   await data(`/api/mailboxes/${box.id}/consents`,'POST',{scope:'pool',action:'grant',affirmative:true,scopeVersion:1});assert.equal((await data(`/api/mailboxes/${box.id}/consents`)).length,1);
   await data(`/api/mailboxes/${box.id}/consents`,'POST',{scope:'pool',action:'revoke'});assert.ok((await data(`/api/mailboxes/${box.id}/consents`))[0].revoked_at);
   assert.equal((await data('/api/pool')).status,'waiting');assert.equal((await data(`/api/mailboxes/${box.id}/reply-status`)).scanComplete,false);
  });
  await t.test('A3 actual campaign form contract and preview/edit invalidation, no consent start denied',async()=>{
   const input={steps:[{subject:'Hello {{firstName}}',body:'Team {{company}}',delayHours:24}],recipients:[{address:'recipient@example.test',fields:{firstName:'Alex',company:'Example'}}]};
   const campaign=await data('/api/campaigns','POST',input);assert.equal((await data(`/api/campaigns/${campaign.id}/preview`))[0].steps[0].subject,'Hello Alex');
   const box=(await data('/api/mailboxes')).items[0];assert.equal((await request(`/api/campaigns/${campaign.id}/start`,'POST',{mailboxIds:[box.id]})).status,409);
   const changed=await data(`/api/campaigns/${campaign.id}`,'PUT',{...input,steps:[{subject:'New',body:'New body',delayHours:24}]});assert.equal(changed.content_version,campaign.content_version+1);
   await data(`/api/campaigns/${campaign.id}/pause`,'POST');assert.equal((await data('/api/campaigns'))[0].state,'paused');
  });
  await t.test('A4 manual source privacy and real compare/share/copy/link/revoke; A5 persistent checkout and partner',async()=>{
   const now=Date.now(),iso=(hours:number)=>new Date(now-hours*3600000).toISOString();
   const observation={sourceUrl:'https://example.test/private/'+canary,reference:canary,metric:'delivered',unit:'count',direction:'higher',manualVerified:true,denominator:20};
   const before=await data('/api/evidence','POST',{...observation,observedAt:iso(48),windowStart:iso(72),windowEnd:iso(48),numerator:5});
   const after=await data('/api/evidence','POST',{...observation,observedAt:iso(1),windowStart:iso(25),windowEnd:iso(1),numerator:10});
   const pair={baselineId:before.id,latestId:after.id};assert.equal((await data('/api/evidence/compare','POST',pair)).shareAllowed,true);
   const report=await data('/api/reports','POST',{...pair,idempotencyKey:randomUUID()});const publicHtml=await (await request(report.url)).text();assert.doesNotMatch(publicHtml,new RegExp(canary));assert.match(publicHtml,/example.test/);
   for(const kind of ['copy','link'])await data(`/api/reports/${report.id}/events`,'POST',{kind,idempotencyKey:randomUUID()});assert.equal((await data('/api/growth/events')).length,3);
   await data(`/api/reports/${report.id}/revoke`,'POST');assert.equal((await request(report.url)).status,404);
   const partner=await data('/api/partner','POST');assert.ok(partner.code);await data('/api/partner','PATCH',{active:false});assert.equal((await data('/api/partner')).active,false);
   const key=randomUUID(),intent=await data('/api/billing/checkout','POST',{plan:'team',idempotencyKey:key});assert.equal(intent.entitlement.plan,'free');assert.equal(intent.canonicalStatus,'pending');
   assert.equal((await data('/api/billing/checkout','POST',{plan:'team',idempotencyKey:key})).id,intent.id);assert.equal((await data('/api/app')).intents.length,1);
  });
  await t.test('A1 logout/relogin durability and session marker changes',async()=>{
   const marker=(await request('/api/app')).headers.get('x-n7-session');const old=cookie;await data('/api/auth/logout','POST');assert.equal((await request('/api/app','GET',{},old)).status,401);assert.equal((await request('/app','GET',{},old)).status,303);
   const login=await request('/api/auth/login','POST',{email,password},'');cookie=login.headers.get('set-cookie')!.split(';')[0]!;assert.notEqual((await request('/api/app')).headers.get('x-n7-session'),marker);assert.equal((await data('/api/mailboxes')).total,1);assert.equal((await data('/api/campaigns')).length,1);assert.equal((await data('/api/evidence')).observations.length,2);
  });
 }finally{await new Promise<void>(resolve=>app.server.close(()=>resolve()));await pool.end();}
});
