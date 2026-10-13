// Existing Docker Playwright only. No traces, video, auth headers or secrets in evidence.
import assert from 'node:assert/strict';
import { createServer,request } from 'node:http';
import { createRequire } from 'node:module';
import { readFile,writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
const require=createRequire(import.meta.url), engines=require('/opt/browser/node_modules/playwright');
const dir=process.env.N7_UI_EVIDENCE, preflight=JSON.parse(await readFile(dir+'/preflight.json','utf8'));
assert.equal(preflight.status,'ready'); assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const origin='http://127.0.0.1:18709', contexts=new Set(), sockets=new Set(), upstreams=new Set(), clients=[];
const report={status:'failed',started_at:new Date().toISOString(),source:preflight.source_sha256,build:preflight.build_sha256,engines:[],checks:[],http:[],console:[],page_errors:[],screenshots:[],failures:[],cleanup:{}};
let phase='bridge',current='setup', held=null,holdNext=false;
const lines=createInterface({input:process.stdin}); const iterator=lines[Symbol.asyncIterator]();
async function fixture(input){process.stdout.write(JSON.stringify({fixture:input})+'\n');const line=await iterator.next();const data=JSON.parse(line.value);assert(data.ok,'operator fixture '+input.action);return data.result;}
const bridge=createServer((incoming,outgoing)=>{
 report.bridge_requests??=[];report.bridge_requests.push({path:incoming.url.split('?')[0],method:incoming.method});const upstream=request({hostname:'n7f06a-web-1',port:3000,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
  if(holdNext&&incoming.url==='/api/evidence?limit=100') {holdNext=false;const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{held=()=>{if(!outgoing.destroyed){outgoing.writeHead(response.statusCode,response.headers);outgoing.end(Buffer.concat(chunks));}};});return;}
  outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);
 });upstreams.add(upstream);upstream.on('close',()=>upstreams.delete(upstream));upstream.on('error',()=>{if(!outgoing.destroyed){outgoing.writeHead(502);outgoing.end();}});incoming.pipe(upstream);
});bridge.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
function check(name,condition,fatal=true){report.checks.push({engine:current,phase,name,pass:Boolean(condition)});if(!condition){report.failures.push({engine:current,phase,kind:'AssertionError',assertion:name});if(fatal)assert(condition,name);}}
async function wait(page,fn,arg){await page.waitForFunction(fn,arg,{timeout:10000});}
async function api(page,path,method='GET',body){return page.evaluate(async({path,method,body})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:method==='GET'?undefined:JSON.stringify(body??{})});return {status:r.status,body:await r.json()};},{path,method,body});}
async function action(page,label,path){const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path && r.request().method()!=='GET');await page.getByRole('button',{name:label,exact:true}).click();const response=await pending;check(label+' HTTP success',response.status()<400);await page.waitForFunction(()=>!document.querySelector('#content')?.hasAttribute('aria-busy'));}
async function nav(page,label){await page.locator('nav').getByRole('button',{name:label,exact:true}).click();await wait(page,()=>!document.querySelector('#content')?.hasAttribute('aria-busy') && document.querySelector('#feedback')?.textContent==='Данные обновлены.');}
async function shot(page,name){check(name+' credential fields clear',await page.locator('input[type=password]').evaluateAll(els=>els.every(e=>!e.value)));const filename=current+'-'+name+'.png';await page.screenshot({path:dir+'/'+filename,fullPage:true});report.screenshots.push(filename);const sizes=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth}));report.layout??=[];report.layout.push({engine:current,name,...sizes});check(name+' no overflow',sizes.body<=sizes.width&&sizes.root<=sizes.width,false);}
async function register(browser,width=390,height=844){const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});contexts.add(context);const page=await context.newPage();page.setDefaultTimeout(10000);monitor(page);await page.goto(origin+'/signin');await page.locator('#auth').waitFor();const seed=preflight.seed_auth?await fixture({action:'auth-seed'}):null;const email=seed?.email??'n7-f06b-'+randomBytes(8).toString('hex')+'@example.test',password=seed?.password??randomBytes(24).toString('base64url');await page.getByLabel('Электронная почта',{exact:true}).fill(email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:preflight.seed_auth?'Войти':'Создать аккаунт',exact:true}).click();await page.waitForURL('**/app');try{await page.locator('#content .card').first().waitFor();}catch(error){report.transport_diagnostic=await page.evaluate(async()=>{const results={};try{const r=await fetch('/api/app');results.direct={status:r.status,fields:Object.keys((await r.json()).data??{})};}catch(e){results.direct={name:e.name,message:e.message};}try{const obj={transport:fetch};const r=await obj.transport('/api/app');results.method={status:r.status};}catch(e){results.method={name:e.name,message:e.message};}try{const {SessionClient}=await import('/assets/client.js');let cleared=0;const client=new SessionClient(()=>cleared++,()=>{});await client.request('/api/app');results.accepted_client={success:true};}catch(e){results.accepted_client={name:e.name,code:e.code,message:e.message};}return results;});throw error;}const identity=(await api(page,'/api/auth/me')).body.data;return {context,page,email,password,tenant:identity.tenant_id};}
function monitor(page){page.on('requestfailed',r=>report.failures.push({engine:current,phase,kind:'requestfailed',path:new URL(r.url()).pathname,reason:r.failure()?.errorText}));page.on('pageerror',e=>report.page_errors.push({engine:current,phase,kind:e.name}));page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin)report.http.push({engine:current,phase,path:u.pathname,status:r.status(),method:r.request().method()});});page.on('console',m=>{if(m.type()==='error')report.console.push({engine:current,phase,url:m.location().url?.split('?')[0],http_status:m.text().match(/\b(4\d\d|5\d\d)\b/)?.[0]??null,kind:'error'});});}
const h={preflight,origin,api,fixture,check,wait,action,nav,shot,register,monitor,contexts,dir,report,setPhase:v=>{phase=v;},hold:()=>{holdNext=true;held=null;},held:()=>Boolean(held),release:()=>{held?.();held=null;}};
try {
 await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(18709,'127.0.0.1',resolve);});
 for(const [name,width,height] of [['chromium',1440,900],['chromium',390,844],['firefox',390,844],['webkit',390,844]]){
  current=name+'-'+width;phase='connect';const browser=await engines[name].connect('ws://127.0.0.1:9320/',{timeout:10000});clients.push(browser);report.engines.push({name,width,height,version:browser.version()});
  const u=await register(browser,width,height),page=u.page;
  for(const display of ['ratios','raw_counts']){
   phase=display;await nav(page,'Наблюдения');
   const end=new Date(Date.now()-3600000),middle=new Date(end-86400000),start=new Date(middle-86400000);const expected=[];
   for(const [a,b,n,d] of [[start,middle,10,display==='ratios'?40:29],[middle,end,20,display==='ratios'?40:30]]){
    const f=page.locator('form').filter({has:page.locator('[name=sourceUrl]')});await f.locator('summary').click();
    const fields={sourceUrl:'https://evidence.example.test/private-f06b-path',reference:'PRIVATE_F06B_REFERENCE',observedAt:b.toISOString(),windowStart:a.toISOString(),windowEnd:b.toISOString(),numerator:String(n),denominator:String(d)};
    expected.push(fields);for(const [key,value] of Object.entries(fields))await f.locator(`[name=${key}]`).fill(value);
    await f.locator('[name=manualVerified]').check();await action(page,'Сохранить наблюдение','/api/evidence');await wait(page,()=>!document.querySelector('[name=sourceUrl]')?.value);
   }
   const observations=(await api(page,'/api/evidence?limit=100')).body.data.observations;
   const selected=expected.map(v=>observations.find(o=>o.evidence.observedAt===v.observedAt&&o.evidence.denominator===Number(v.denominator)));
   check(display+' actual observations persisted',selected.every(Boolean));
   await page.locator('[name=baseline]').selectOption(selected[0].id);await page.locator('[name=latest]').selectOption(selected[1].id);await action(page,'Сравнить выбранную пару','/api/evidence/compare');
   check(display+' share enabled',!await page.getByRole('button',{name:'Создать публичный отчёт',exact:true}).isDisabled());await action(page,'Создать публичный отчёт','/api/reports');
   const saved=(await api(page,'/api/reports?limit=100')).body.data.find(r=>r.snapshot.baseline.observedAt===expected[0].observedAt&&r.snapshot.baseline.denominator===Number(expected[0].denominator));check(display+' snapshot mode',saved.snapshot.display===display);
   const publicPage=await u.context.newPage();monitor(publicPage);const response=await publicPage.goto(origin+'/reports/'+saved.token);check(display+' public200',response.status()===200);check('CSP permits actual inline style',response.headers()['content-security-policy'].includes("style-src 'self' 'unsafe-inline'"));
   const region=publicPage.getByRole('region',{name:'Immutable manual observations'});const text=await publicPage.locator('body').innerText();
   check('privacy whitelist and provenance',text.includes('https://evidence.example.test')&&text.includes('manual/user-confirmed')&&!text.includes('private-f06b-path')&&!text.includes('PRIVATE_F06B_REFERENCE')&&!text.includes(u.email));
   check('source badge preserved',await publicPage.locator('[data-n7-source-badge]').count()===1);
   check('caption and header associations',await publicPage.locator('table').evaluate(t=>t.caption?.textContent==='Immutable manual observations'&&[...t.tHead.rows[0].cells].every(c=>c.scope==='col')&&[...t.tBodies[0].rows].every(r=>r.cells[0].scope==='row')));
   const cells=await publicPage.locator('tbody tr').evaluateAll(rows=>rows.map(r=>[...r.cells].map(c=>c.textContent)));
   check('full timestamps and counts',expected.every((v,i)=>cells[i][1]===v.observedAt&&cells[i][2].includes(v.windowStart)&&cells[i][2].includes(v.windowEnd)&&cells[i][3]===v.numerator&&cells[i][4]===v.denominator));
   check('ratio/raw columns exact',cells.every((r,i)=>r.length===(display==='ratios'?6:5)&&(display!=='ratios'||r[5]===(Number(expected[i].numerator)/Number(expected[i].denominator)*100).toFixed(2)+'%')));
   const geometry=await region.evaluate(e=>({overflowX:getComputedStyle(e).overflowX,client:e.clientWidth,scroll:e.scrollWidth,times:[...e.querySelectorAll('time')].map(t=>({text:t.textContent,client:t.clientWidth,scroll:t.scrollWidth,height:t.getBoundingClientRect().height,whiteSpace:getComputedStyle(t).whiteSpace,font:getComputedStyle(t).fontSize}))}));report.geometry??=[];report.geometry.push({engine:current,display,...geometry});
   check('real computed CSS applied',geometry.overflowX==='auto'&&geometry.times.every(t=>t.whiteSpace==='nowrap'&&parseFloat(t.font)>=16));
   check('timestamps readable without clipping',geometry.times.length===6&&geometry.times.every(t=>t.client>=t.scroll&&t.height>=20));
   await publicPage.keyboard.press('Tab');check('scroll region reachable with Tab',await region.evaluate(e=>e===document.activeElement));check('focus and instructions visible',await region.evaluate(e=>getComputedStyle(e).outlineStyle!=='none')&&text.includes('Left and Right arrow keys'));
   if(width===390){check('contained horizontal table',geometry.scroll>geometry.client);await publicPage.keyboard.press('ArrowRight');await publicPage.waitForFunction(()=>document.querySelector('.report-scroll').scrollLeft>0);check('keyboard ArrowRight scrolls',await region.evaluate(e=>e.scrollLeft>0));await region.evaluate(e=>{e.scrollLeft=e.scrollWidth;});const far=await region.evaluate(e=>e.scrollLeft);await publicPage.keyboard.press('ArrowLeft');await publicPage.waitForFunction(v=>document.querySelector('.report-scroll').scrollLeft<v,far);check('keyboard ArrowLeft scrolls',await region.evaluate((e,v)=>e.scrollLeft<v,far));}
   await region.evaluate(e=>{e.scrollLeft=0;});await shot(publicPage,display+'-public-report');if(width===390){await region.evaluate(e=>{e.scrollLeft=e.scrollWidth;});await shot(publicPage,display+'-public-report-end');}
   await publicPage.close();await action(page,'Отозвать ссылку',`/api/reports/${saved.id}/revoke`);const revoked=await page.evaluate(async token=>(await fetch('/reports/'+token)).status,saved.token);check(display+' revoke404',revoked===404);
  }
  await u.context.close();contexts.delete(u.context);await browser.close();clients.pop();
 }
 for(const r of report.http)if(r.status>=400)r.expected=(r.status===401&&r.path==='/api/auth/me')||(r.status===404&&(r.path==='/api/partner'||r.path==='/favicon.ico'||r.path.startsWith('/reports/')));
 for(const c of report.console){const path=c.url?new URL(c.url).pathname:'';c.expected=report.http.some(r=>r.path===path&&String(r.status)===c.http_status&&r.expected);}
 check('no unexpected HTTP errors',report.http.filter(r=>r.status>=400).every(r=>r.expected));check('no unexpected console errors',report.console.every(r=>r.expected));check('no page errors',report.page_errors.length===0);check('no failed requests',report.failures.length===0);report.status='pass';
} catch(error){report.failures.push({engine:current,phase,kind:error.name,assertion:error.name==='AssertionError'?error.message.split('\n')[0]:null});process.exitCode=1;}
finally {
 for(const context of contexts)await context.close().catch(()=>{});for(const browser of clients)await browser.close().catch(()=>{});for(const r of upstreams)r.destroy();for(const s of sockets)s.destroy();await new Promise(r=>bridge.close(r));lines.close();report.cleanup={own_contexts_closed:true,bridge_closed:!bridge.listening,sockets_destroyed:true,shared_browser_server_preserved:true};report.finished_at=new Date().toISOString();await writeFile(dir+'/checks.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,checks:report.checks.length,failures:report.failures})+'\n');
}
