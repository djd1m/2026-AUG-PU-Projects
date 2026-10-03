import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SessionClient } from '../src/web/client.js';
import { Ui } from '../src/web/dom.js';
import { cabinetPage,cabinetCss } from '../src/web/cabinet.js';
function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const response=(status=200,session='A',data:unknown={private:'A'})=>new Response(JSON.stringify({data}),{status,headers:{'X-N7-Session':session}});
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
