import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { authScript } from '../src/web/page.js';
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function auth(initialIdentity: boolean, actionOk = true, finalIdentity = true) {
 const notifications: string[] = [], redirects: string[] = [], calls: string[] = [];
 let submit!: (event: unknown) => Promise<void>;
 const buttons = [{disabled:false},{disabled:false}];
 const form = {password:{value:'PRIVATE_PASSWORD'},email:{value:'owner@example.test'},querySelectorAll:()=>buttons,addEventListener:(_name:string,fn:typeof submit)=>{submit=fn;}};
 class Channel { postMessage(value:string){notifications.push(value);} close(){} }
 runInNewContext(authScript, {document:{getElementById:(id:string)=>id==='auth'?form:id==='message'?{textContent:''}:{addEventListener(){}}},BroadcastChannel:Channel,location:{replace:(path:string)=>redirects.push(path)},fetch:async(path:string)=>{calls.push(path);return {ok:calls.length===1?initialIdentity:path==='/api/auth/me'?finalIdentity:actionOk,json:async()=>({error:{code:'invalid_credentials'}})};}});
 return {notifications,redirects,calls,form,buttons,submit:(action:string)=>submit({preventDefault(){},submitter:{value:action}})};
}
test('R1 actual authScript passive valid identity redirects silently',async()=>{
 const tab=auth(true);await settle();assert.deepEqual(tab.redirects,['/app']);assert.deepEqual(tab.notifications,[]);assert.equal(tab.form.password.value,'');
});
for(const action of ['register','login']) test('R1 actual successful '+action+' notifies exactly once',async()=>{
 const tab=auth(false);await settle();await tab.submit(action);assert.deepEqual(tab.calls,['/api/auth/me','/api/auth/'+action,'/api/auth/me']);assert.deepEqual(tab.notifications,['login']);assert.deepEqual(tab.redirects,['/app']);assert.equal(tab.form.password.value,'');assert.ok(tab.buttons.every(b=>!b.disabled));
});
for(const [actionOk,identity] of [[false,true],[true,false]]) test('R1 failed action/no identity emits zero '+actionOk+'/'+identity,async()=>{
 const tab=auth(false,actionOk,identity);await settle();await tab.submit('login');assert.deepEqual(tab.notifications,[]);assert.deepEqual(tab.redirects,[]);
});
for(const event of ['login','logout']) test('R1 actual app channel '+event+' invalidates, aborts and passive followup never echoes',async()=>{
 const notifications:string[]=[],redirects:string[]=[],signals:AbortSignal[]=[];
 let receive!: (event:unknown)=>void,clears=0;
 const content={inert:false,replaceChildren(){clears++;},setAttribute(){},removeAttribute(){}};
 const feedback={textContent:'',setAttribute(){},focus(){}};
 const elements:Record<string,unknown>={content,feedback,title:{textContent:'',focus(){}},modes:{textContent:''},logout:{addEventListener(){}}};
 class Channel {addEventListener(_name:string,fn:typeof receive){receive=fn;}postMessage(value:string){notifications.push(value);}}
 const script=['client','dom','app'].map(name=>ts.transpileModule(readFileSync(new URL('../src/web/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\n/gm,'').replace(/^export \{\};\n/gm,'').replace(/\bexport /g,'')).join('\n');
 runInNewContext(script,{document:{getElementById:(id:string)=>elements[id],querySelectorAll:()=>[]},window:{addEventListener(){}},BroadcastChannel:Channel,location:{replace:(path:string)=>redirects.push(path)},AbortController,Headers,setTimeout,clearTimeout,fetch:(_path:string,init:{signal:AbortSignal})=>new Promise((_resolve,reject)=>{signals.push(init.signal);init.signal.addEventListener('abort',()=>reject(new Error('aborted')));})});
 receive({data:event});await settle();assert.equal(clears,1);assert.ok(signals.length>0);assert.ok(signals.every(s=>s.aborted));assert.deepEqual(redirects,['/signin']);assert.equal(feedback.textContent,'');assert.deepEqual(notifications,[]);
 const followup=auth(true);await settle();assert.deepEqual(followup.redirects,['/app']);assert.deepEqual(followup.notifications,[]);
});
