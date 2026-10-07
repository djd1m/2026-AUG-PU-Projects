import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SessionClient } from '../src/web/client.js';
import { Ui } from '../src/web/dom.js';
import { cabinetPage,cabinetCss } from '../src/web/cabinet.js';
import { resolveEndpoint } from '../src/mailboxes/network.js';
import { HttpError } from '../src/errors.js';
function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const response=(status=200,session='A',data:unknown={private:'A'})=>new Response(JSON.stringify({data}),{status,headers:{'X-N7-Session':session}});
test('native default transport preserves its global receiver and injected transport still works',async(t)=>{
 let nativeCalls=0,injectedCalls=0;
 t.mock.method(globalThis,'fetch',async function(this:unknown,url:RequestInfo|URL,init?:RequestInit){
  if(this!==globalThis)throw new TypeError('Illegal invocation');
  nativeCalls++;assert.equal(url,'/api/app');assert.equal(init?.credentials,'same-origin');assert.equal(init?.cache,'no-store');
  assert.equal(init?.signal?.aborted,false);return response(200,'A',{native:true});
 });
 const native=new SessionClient(()=>assert.fail('unexpected clear'),()=>assert.fail('unexpected redirect'));
 assert.deepEqual(await native.request('/api/app'),{native:true});assert.equal(nativeCalls,1);
 const injected:SessionClient=new SessionClient(()=>assert.fail('unexpected clear'),()=>assert.fail('unexpected redirect'),async function(this:unknown,url,init){
  assert.equal(this,injected);injectedCalls++;assert.equal(url,'/injected');assert.equal(init?.method,'POST');
  assert.equal(init?.body,JSON.stringify({value:7}));return response(200,'B',{injected:true});
 });
 assert.deepEqual(await injected.request('/injected','POST',{value:7}),{injected:true});
 assert.equal(injectedCalls,1);assert.equal(nativeCalls,1);
});
test('A6 central401 clears private state, aborts pending, redirects; late success/error stay obsolete',async()=>{
 const pending=deferred<Response>();let calls=0,clears=0,redirects=0;let signal:AbortSignal|null|undefined;
 const client=new SessionClient(()=>clears++,()=>redirects++,(async(_url,init)=>{signal=init?.signal;return ++calls===1?pending.promise:response(401);}) as typeof fetch);
 const old=client.request('/slow');const denial=client.request('/expired');
 await assert.rejects(denial,/obsolete/);assert.equal(clears,1);assert.equal(redirects,1);assert.equal(signal?.aborted,true);
 pending.resolve(response());await assert.rejects(old,/obsolete/);
 const failure=deferred<Response>();const other=new SessionClient(()=>{},()=>{},(()=>failure.promise) as typeof fetch);
 const late=other.request('/failure');other.invalidate(false);failure.reject(new Error('PRIVATE_CANARY'));await assert.rejects(late,/obsolete/);
});
test('A1 session change fences old identity and body-resolution race',async()=>{
 let i=0,clears=0;const client=new SessionClient(()=>clears++,()=>{},(async()=>response(200,++i===1?'A':'B')) as typeof fetch);
 await client.request('/first');await assert.rejects(client.request('/new-session'),/obsolete/);assert.equal(clears,1);
 const body=deferred<unknown>();const race=new SessionClient(()=>{},()=>{},(async()=>({status:200,ok:true,headers:new Headers({'X-N7-Session':'A'}),json:()=>body.promise})) as unknown as typeof fetch);
 const request=race.request('/body');await Promise.resolve();race.invalidate(false);body.resolve({data:{private:'A'}});await assert.rejects(request,/obsolete/);
});
test('A1 late action catch/finally cannot change fresh UI or release its pending bound',async()=>{
 const attrs=new Map<string,string>();const content={inert:false,replaceChildren(){},setAttribute(k:string,v:string){attrs.set(k,v);},removeAttribute(k:string){attrs.delete(k);}} as unknown as HTMLElement;
 const feedback={textContent:'',setAttribute(){},focus(){}} as unknown as HTMLElement;
 const ui=new Ui(content,feedback),old=deferred<void>(),fresh=deferred<void>();let duplicate=0;
 const action=ui.run(()=>old.promise);ui.api.invalidate(false);const newer=ui.run(()=>fresh.promise);
 old.reject(new Error('OLD_PRIVATE_CANARY'));await action;
 assert.equal(feedback.textContent,'Подождите…');assert.equal(attrs.get('aria-busy'),'true');assert.equal(content.inert,true);
 await ui.run(async()=>{duplicate++;});assert.equal(duplicate,0);
 fresh.resolve();await newer;assert.equal(content.inert,false);assert.equal(feedback.textContent,'Данные обновлены.');
});
test('A6 product source security: explicit assets, same-origin shell, no private storage/untrusted HTML/operator access',()=>{
 assert.match(cabinetPage,/type="module" src="\/assets\/app.js"/);assert.match(cabinetCss,/minmax\(0,1fr\)/);assert.match(cabinetCss,/prefers-reduced-motion/);
 for(const f of ['app','billing','campaigns','client','dom','evidence','mailboxes']) {
  const source=readFileSync(new URL('../src/web/'+f+'.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/innerHTML|localStorage|sessionStorage|\/api\/operator|authorization:/i);
 }
 const source=readFileSync(new URL('../src/server.ts',import.meta.url),'utf8');assert.match(source,/if\(!ASSETS.has\(asset\)\)throw/);assert.doesNotMatch(cabinetPage,/<script[^>]*>[^<]+<\/script>/);
});

test('diagnostic late success and error cannot repopulate a different session',async()=>{
 for(const kind of ['success','error']){const pending=deferred<Response>();let clears=0;let signal:AbortSignal|undefined;
 const client=new SessionClient(()=>clears++,()=>{},(async(path,options)=>{assert.equal(path,'/api/mailboxes/fixture/diagnostics');signal=options?.signal as AbortSignal;return pending.promise;}) as typeof fetch);
 const old=client.request('/api/mailboxes/fixture/diagnostics','POST',{});client.invalidate(false);assert.equal(signal?.aborted,true);assert.equal(clears,1);
 if(kind==='success')pending.resolve(response(200,'old',{diagnostics:{state:'current',result:{smtp:{auth:'success'},imap:{auth:'success'}}}}));else pending.reject(new Error('CREDENTIAL_PASSWORD_CANARY'));
 await assert.rejects(old,/obsolete/);assert.equal(clears,1);
 }
});

test('mailbox validation errors reach actionable UI feedback without DNS or real providers',async(t)=>{
 const cases=[
  {host:'smtp.other.test',code:'host_denied',action:/разрешённые SMTP\/IMAP|список у оператора/},
  {host:'https://imap.gmail.com',code:'invalid_host',action:/без протокола.*пути.*порта/},
  {host:'imap.gmail.com',code:'unsafe_address',action:/Проверьте DNS|обратитесь к оператору/}
 ];
 for(const item of cases)await t.test(item.code,async(t)=>{
  let resolutions=0;
  t.mock.method(globalThis,'fetch',async(url:RequestInfo|URL,init?:RequestInit)=>{
   assert.equal(url,'/api/mailboxes');assert.equal(init?.method,'POST');
   try{await resolveEndpoint(item.host,993,new Map([['imap.gmail.com',30]]),async()=>{resolutions++;return [{address:'127.0.0.1',family:4}];});assert.fail('validation should reject');}
   catch(error){assert.ok(error instanceof HttpError);assert.equal(error.status,400);assert.equal(error.code,item.code);return new Response(JSON.stringify({error:{code:error.code}}),{status:error.status});}
  });
  const content={inert:false,setAttribute(){},removeAttribute(){},replaceChildren(){}} as unknown as HTMLElement;
  const feedback={textContent:'',setAttribute(){},focus(){}} as unknown as HTMLElement,ui=new Ui(content,feedback);
  await ui.run(async()=>{await ui.api.request('/api/mailboxes','POST',{});});
  assert.match(feedback.textContent!,item.action);assert.doesNotMatch(feedback.textContent!,/Действие отклонено|Проверьте поля и повторите/);assert.equal(content.inert,false);
  assert.equal(resolutions,item.code==='unsafe_address'?1:0);
 });
});

import { billingPage, billingReturnId, intentPath, intentSummary, livePriceText, safeCheckoutUrl } from '../src/web/billing.js';
import { diagnosticEvidence, modeLabel, pollFresh, pollGuidance } from '../src/web/models.js';
import { diagnosticError } from '../src/web/mailboxes.js';
import type { Intent, Metadata, Poll } from '../src/web/models.js';
test('LIVE checkout accepts only explicit safe YooMoney HTTPS URLs',()=>{
 assert.equal(safeCheckoutUrl('https://yoomoney.ru/checkout?order=7'),'https://yoomoney.ru/checkout?order=7');
 assert.equal(safeCheckoutUrl('https://yoomoney.ru:443/checkout'),'https://yoomoney.ru/checkout');
 for(const url of [null,'','javascript:alert(1)','http://yoomoney.ru/pay','https://yoomoney.ru.evil.test/pay','https://evil.test/yoomoney.ru','https://user:pass@yoomoney.ru/pay','https://yoomoney.ru:444/pay','https://yoo\nmoney.ru/pay','https://yoomoney.ru/pay\u007f']) assert.equal(safeCheckoutUrl(url),null,url??'null');
});
test('return parsing ignores paid/price/state and accepts only one UUID; mixed history is read only',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 assert.equal(billingReturnId('?billingIntent='+id+'&paid=true&price=1&state=succeeded'),id);
 for(const search of ['?paid=true','?billingIntent=bad','?billingIntent='+id+'&billingIntent='+id,'?billingIntent=%3Cscript%3E']) assert.equal(billingReturnId(search),null);
 assert.equal(intentPath(id,'local_test','live_provider'),'/api/billing/intents/'+id+'?history=TEST');
 assert.equal(intentPath(id,'live_provider','live_provider'),'/api/billing/intents/'+id);
 const local={id,plan:'team',state:'succeeded',created_at:'',checkoutUrl:null,mode:'local_test',label:'TEST',price:{plan:'team',amountMinor:100,currency:'RUB',durationDays:30,label:'TEST'},canonicalStatus:null} as Intent;
 assert.match(intentSummary(local),/TEST.*история TEST, только чтение/);assert.doesNotMatch(intentSummary(local),/успех подтверждён/);
 assert.match(livePriceText({plan:'team',amountMinor:123456,currency:'RUB',durationDays:30,label:'LIVE'}),/LIVE.*1.*234,56.*30 дней/);
});
test('mail readiness preserves strict 60s boundary and independent diagnostic provenance',()=>{
 const now=Date.parse('2026-10-07T19:00:00Z');
 const poll=(age:number,complete=true):Poll=>({mode:'live_provider',scan:null,scanComplete:complete,lastComplete:new Date(now-age).toISOString(),realVerification:'unknown'});
 assert.equal(pollFresh(poll(59999),now),true);
 for(const value of [poll(60000),poll(-1),poll(0,false),{...poll(0),lastComplete:'bad'},{...poll(0),lastComplete:null}]) assert.equal(pollFresh(value,now),false);
 assert.equal(modeLabel('live_provider'),'LIVE');assert.equal(modeLabel('local_test'),'TEST');assert.equal(modeLabel('disabled'),'отключено');
 assert.match(pollGuidance('live_provider'),/только читает статус.*transport.*live worker/);assert.doesNotMatch(pollGuidance('live_provider'),/TEST/);
 assert.match(pollGuidance('local_test'),/TEST-опрос/);assert.match(pollGuidance('disabled'),/отключён/);
 assert.equal(diagnosticEvidence('live_provider'),'реальное соединение SMTP/IMAP');assert.equal(diagnosticEvidence('protocol_fixture'),'локальный протокольный fixture');assert.match(diagnosticEvidence('unknown'),/нет доказательств/);
 assert.match(diagnosticError('live_provider_disabled'),/оператор.*диагностику.*отправка.*не включается/);assert.doesNotMatch(diagnosticError('PASSWORD_CANARY'),/PASSWORD_CANARY/);
});
test('billing return late result cannot render or issue another request after logout',async()=>{
 const pending=deferred<Response>();let calls=0,renders=0;
 const api=new SessionClient(()=>{},()=>{},(async()=>{calls++;return pending.promise;}) as typeof fetch);
 const ui={api,content:{replaceChildren(){renders++;},append(){renders++;}}} as unknown as Ui;
 const page=billingPage(ui,{modes:{billing:'live_provider'}} as Metadata,()=> 'stable-key',{id:'11111111-1111-4111-8111-111111111111',mode:'live_provider'});
 api.invalidate(false);pending.resolve(response(200,'A',{}));await assert.rejects(page,/obsolete/);assert.equal(calls,1);assert.equal(renders,0);
});

test('billing explicit anchor and canonical manual refresh update tariff and history',async()=>{
 class Element {
  textContent='';children:Element[]=[];href='';target='';rel='';type='';disabled=false;
  listeners=new Map<string,()=>void>();constructor(readonly tag:string){}
  append(...items:Element[]){this.children.push(...items);}replaceChildren(...items:Element[]){this.children=[...items];}
  addEventListener(name:string,fn:()=>void){this.listeners.set(name,fn);}
 }
 const saved=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:(tag:string)=>new Element(tag)}});
 try {
  const id='11111111-1111-4111-8111-111111111111',price={plan:'team',amountMinor:99000,currency:'RUB',durationDays:30,label:'LIVE'};
  let paid=false;const paths:string[]=[];
  const entitlement=()=>({plan:paid?'team':'free',limits:{mailboxes:null,activeCampaigns:paid?10:3},expiresAt:paid?'2026-11-06T19:00:00Z':null,hardMailQuota:30});
  const meta={modes:{billing:'live_provider'},plans:{free:{mailboxes:null,activeCampaigns:3},team:{mailboxes:null,activeCampaigns:10}},intents:[{id,mode:'live_provider',label:'LIVE',state:'pending',created_at:'today'}]} as Metadata;
  const api=new SessionClient(()=>{},()=>{},(async(path)=>{
   paths.push(String(path));
   if(path==='/api/app')return response(200,'A',{...meta,intents:meta.intents.map(i=>({...i,state:paid?'succeeded':'pending'}))});
   if(path==='/api/billing/status')return response(200,'A',{...entitlement(),mode:'live_provider',label:'LIVE',checkoutAvailable:true,availability:'available',price});
   return response(200,'A',{id,plan:'team',created_at:'today',mode:'live_provider',label:'LIVE',price,state:paid?'succeeded':'pending',checkoutUrl:paid?null:'https://yoomoney.ru/pay?order=7',availability:'available',entitlement:entitlement()});
  }) as typeof fetch);
  const content=new Element('main');let action:Promise<void>|undefined;
  const ui={api,content,run(fn:()=>Promise<void>){action=fn();return action;}} as unknown as Ui;
  const all=(e:Element):Element[]=>[e,...e.children.flatMap(all)];
  await billingPage(ui,meta,()=> 'stable-key',{id,mode:'live_provider'});
  const anchor=all(content).find(e=>e.tag==='a')!;
  assert.equal(anchor.href,'https://yoomoney.ru/pay?order=7');assert.equal(anchor.target,'_blank');assert.equal(anchor.rel,'noopener noreferrer');
  assert.match(all(content).map(e=>e.textContent).join(' '),/LIVE.*990,00/);
  assert.deepEqual(paths,[`/api/billing/intents/${id}`,'/api/billing/status','/api/app']);
  paid=true;all(content).find(e=>e.textContent==='Обновить статус этого intent')!.listeners.get('click')!();await action;
  const text=all(content).map(e=>e.textContent).join(' ');
  assert.match(text,/Ваш тариф: team/);assert.match(text,/2026-11-06T19:00:00Z/);assert.match(text,/успех подтверждён сервером/);assert.match(text,/LIVE · today · succeeded · посмотреть/);assert.equal(all(content).some(e=>e.tag==='a'),false);
 } finally {if(saved)Object.defineProperty(globalThis,'document',saved);else Reflect.deleteProperty(globalThis,'document');}
});
