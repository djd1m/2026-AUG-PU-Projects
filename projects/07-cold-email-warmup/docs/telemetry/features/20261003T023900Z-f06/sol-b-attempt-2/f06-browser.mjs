// Existing Docker Playwright only. No traces, video, auth headers or secrets in evidence.
import assert from 'node:assert/strict';
import { createServer,request } from 'node:http';
import { createRequire } from 'node:module';
import { readFile,writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { journey, evidenceFlow } from './f06-journey.mjs';
import { security } from './f06-security.mjs';
const require=createRequire(import.meta.url), engines=require('/opt/browser/node_modules/playwright');
const dir=process.env.N7_UI_EVIDENCE, preflight=JSON.parse(await readFile(dir+'/preflight.json','utf8'));
assert.equal(preflight.status,'ready'); assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const origin='http://127.0.0.1:18709', contexts=new Set(), sockets=new Set(), upstreams=new Set(), clients=[];
const report={status:'failed',started_at:new Date().toISOString(),source:preflight.source_sha256,build:preflight.build_sha256,engines:[],checks:[],http:[],console:[],page_errors:[],screenshots:[],failures:[],cleanup:{}};
let phase='bridge',current='setup', held=null,holdNext=false;
const lines=createInterface({input:process.stdin}); const iterator=lines[Symbol.asyncIterator]();
async function fixture(input){process.stdout.write(JSON.stringify({fixture:input})+'\n');const line=await iterator.next();const data=JSON.parse(line.value);assert(data.ok,'operator fixture '+input.action);return data.result;}
const bridge=createServer((incoming,outgoing)=>{
 const upstream=request({hostname:'n7f06a-web-1',port:3000,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
  if(holdNext&&incoming.url==='/api/evidence?limit=100') {holdNext=false;const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{held=()=>{if(!outgoing.destroyed){outgoing.writeHead(response.statusCode,response.headers);outgoing.end(Buffer.concat(chunks));}};});return;}
  outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
 });upstreams.add(upstream);upstream.on('close',()=>upstreams.delete(upstream));upstream.on('error',()=>{if(!outgoing.destroyed){outgoing.writeHead(502);outgoing.end();}});incoming.pipe(upstream);
});bridge.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
function check(name,condition){report.checks.push({engine:current,phase,name,pass:Boolean(condition)});assert(condition,name);}
async function wait(page,fn,arg){await page.waitForFunction(fn,arg,{timeout:10000});}
async function api(page,path,method='GET',body){return page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body??{})});return {status:r.status,body:await r.json()};},{path,method,body});}
async function action(page,label,path){const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path && r.request().method()!=='GET');await page.getByRole('button',{name:label,exact:true}).click();const response=await pending;check(label+' HTTP success',response.status()<400);await page.waitForFunction(()=>!document.querySelector('#content')?.hasAttribute('aria-busy'));}
async function nav(page,label){await page.locator('nav').getByRole('button',{name:label,exact:true}).click();await wait(page,()=>!document.querySelector('#content')?.hasAttribute('aria-busy') && document.querySelector('#feedback')?.textContent==='Данные обновлены.');}
async function shot(page,name){check(name+' credential fields clear',await page.locator('input[type=password]').evaluateAll(els=>els.every(e=>!e.value)));const filename=current+'-'+name+'.png';await page.screenshot({path:dir+'/'+filename,fullPage:true});report.screenshots.push(filename);const sizes=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth}));check(name+' no overflow',sizes.body<=sizes.width&&sizes.root<=sizes.width);}
async function register(browser,width=390,height=844){const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});contexts.add(context);const page=await context.newPage();page.setDefaultTimeout(10000);monitor(page);await page.goto(origin+'/signin');await page.locator('#auth').waitFor();const email='n7-f06b-'+randomBytes(8).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url');await page.getByLabel('Электронная почта',{exact:true}).fill(email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();await page.waitForURL('**/app');await page.locator('#content .card').first().waitFor();const identity=(await api(page,'/api/auth/me')).body.data;return {context,page,email,password,tenant:identity.tenant_id};}
function monitor(page){page.on('pageerror',e=>report.page_errors.push({engine:current,phase,kind:e.name}));page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin)report.http.push({engine:current,phase,path:u.pathname,status:r.status(),method:r.request().method()});});page.on('console',m=>{if(m.type()==='error')report.console.push({engine:current,phase,url:m.location().url?.split('?')[0],http_status:m.text().match(/\b(4\d\d|5\d\d)\b/)?.[0]??null,kind:'error'});});}
const h={origin,api,fixture,check,wait,action,nav,shot,register,monitor,contexts,dir,report,setPhase:v=>{phase=v;},hold:()=>{holdNext=true;held=null;},held:()=>Boolean(held),release:()=>{held?.();held=null;}};
try {
 await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(18709,'127.0.0.1',resolve);});
 for(const [name,width,height] of [['chromium',1440,900],['chromium',390,844],['firefox',390,844],['webkit',390,844]]){
  current=name+'-'+width;phase='connect';const browser=await engines[name].connect('ws://127.0.0.1:9320/',{timeout:10000});clients.push(browser);report.engines.push({name,width,height,version:browser.version()});
  phase='auth';const user=await register(browser,width,height);await shot(user.page,'overview');check('reduced motion',await user.page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
  if(name==='chromium'){await journey(h,user);await security(h,user,browser);}
  else {await evidenceFlow(h,user);await user.page.reload();await wait(user.page,()=>document.querySelector('#feedback')?.textContent==='Данные обновлены.');await shot(user.page,'reload');const cookies=await user.context.cookies(origin);await action(user.page,'Выйти','/api/auth/logout');await user.page.waitForURL('**/signin');check('logout401',(await api(user.page,'/api/auth/me')).status===401);await user.page.locator('#email').fill(user.email);await user.page.locator('#password').fill(user.password);await user.page.getByRole('button',{name:'Войти',exact:true}).click();await user.page.waitForURL('**/app');check('login200',(await api(user.page,'/api/auth/me')).status===200);await shot(user.page,'signin-cabinet');check('session existed',cookies.length>0);}
  await user.context.close();contexts.delete(user.context);await browser.close();clients.pop();
 }
 phase='classification';
 const expected=r=>(r.status===401&&['/api/auth/me','/api/mailboxes','/api/app'].includes(r.path))||(r.status===404&&(r.path==='/favicon.ico'||r.path==='/api/partner'||r.path.startsWith('/api/mailboxes/')||r.path.startsWith('/api/campaigns/')||r.path.includes('/revoke')||r.path.startsWith('/reports/')))||(r.status===400&&['/api/evidence/compare','/api/evidence','/api/billing/checkout'].includes(r.path))||(r.status===409&&r.path.endsWith('/start'));
 report.http_errors=report.http.filter(r=>r.status>=400).map(r=>({...r,expected:expected(r)}));
 for(const c of report.console){const path=c.url?new URL(c.url).pathname:'';c.expected=Boolean(report.http_errors.some(r=>r.path===path&&String(r.status)===c.http_status&&r.expected));}
 check('no unexpected HTTP errors',report.http_errors.every(r=>r.expected));check('no unexpected console errors',report.console.every(r=>r.expected));check('no page errors',report.page_errors.length===0);report.status='pass';
} catch(error){for(const ctx of contexts)for(const p of ctx.pages())if(p.url().endsWith('/app')){report.failure_dom=await p.locator('body').innerText().catch(()=> 'unavailable');await p.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});}report.failures.push({engine:current,phase,kind:error.name,assertion:error.name==='AssertionError'?error.message.split('\n')[0]:null});process.exitCode=1;}
finally {
 for(const context of contexts)await context.close().catch(()=>{});for(const browser of clients)await browser.close().catch(()=>{});held?.();for(const r of upstreams)r.destroy();for(const s of sockets)s.destroy();await new Promise(r=>bridge.close(r));lines.close();report.cleanup={own_contexts_closed:true,bridge_closed:!bridge.listening,sockets_destroyed:true,shared_browser_server_preserved:true};report.finished_at=new Date().toISOString();await writeFile(dir+'/checks.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures})+'\n');
}
