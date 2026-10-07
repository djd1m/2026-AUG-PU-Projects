// Reuses Docker Playwright and operator-only stdin/stdout fixture RPC. No trace/video.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile,writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { request } from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
const require=createRequire(import.meta.url),engines=require('/opt/browser/node_modules/playwright');
assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const dir=process.env.N7_UI_EVIDENCE,preflight=JSON.parse(await readFile(dir+'/preflight.json','utf8'));
assert.equal(preflight.status,'ready');assert.equal(preflight.origin,'https://n7-ui.example.test');assert(preflight.source_revision&&preflight.image_id&&preflight.build_sha256);
const origin=preflight.origin,contexts=new Set(),clients=new Set(),lines=createInterface({input:process.stdin}),iterator=lines[Symbol.asyncIterator]();
const report={status:'failed',source_revision:preflight.source_revision,image_id:preflight.image_id,build_sha256:preflight.build_sha256,checks:[],screenshots:[],failures:[],provider_navigations_intercepted:0,external_requests_executed:0,production_tls_proof:false,started_at:new Date().toISOString()};
let current='setup';
function check(name,value){report.checks.push({viewport:current,name,pass:Boolean(value)});assert(value,name);}
async function fixture(input){process.stdout.write(JSON.stringify({fixture:input})+'\n');const answer=JSON.parse((await iterator.next()).value);assert(answer.ok,'trusted fixture '+input.action);return answer.result;}
async function api(page,path){return page.evaluate(async path=>{const r=await fetch(path);return {status:r.status,body:await r.json()};},path);}
async function idle(page){await page.waitForFunction(()=>!document.querySelector('#content')?.hasAttribute('aria-busy'));}
async function nav(page){await page.locator('nav').getByRole('button',{name:'Тариф',exact:true}).click();await idle(page);}
async function refresh(page){await page.getByRole('button',{name:'Обновить статус этого intent',exact:true}).click();await idle(page);}
async function routeContext(context){await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());
 if(u.origin==='https://yoomoney.ru'){report.provider_navigations_intercepted++;return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Private provider navigation fixture</title><p>Local intercepted navigation only.</p>'});}
 if(u.origin!==origin){report.failures.push({kind:'blocked_external_origin'});return route.abort('blockedbyclient');}
 const headers=await req.allHeaders();headers.host=new URL(origin).host;
 const response=await new Promise((resolve,reject)=>{const upstream=request({hostname:preflight.fixture_host,port:preflight.fixture_port,path:u.pathname+u.search,method:req.method(),headers},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});upstream.on('error',reject);upstream.end(req.postDataBuffer()??undefined);});
 const outHeaders={};for(const [k,v] of Object.entries(response.headers))if(v!==undefined&&!['transfer-encoding','connection','content-length'].includes(k))outHeaders[k]=Array.isArray(v)?v.join('\n'):String(v);
 await route.fulfill({...response,headers:outHeaders});
});}
async function register(browser,width){const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});contexts.add(context);await routeContext(context);const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',()=>report.failures.push({kind:'pageerror'}));await page.goto(origin+'/signin');const email='n7-live-ui-'+randomBytes(8).toString('hex')+'@example.test',password=randomBytes(24).toString('base64url');await page.getByLabel('Электронная почта',{exact:true}).fill(email);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Создать аккаунт',exact:true}).press('Enter');await page.waitForURL('**/app');await idle(page);return {context,page,email,password};}
async function screenshot(page,name){check('password fields cleared',await page.locator('input[type=password]').evaluateAll(es=>es.every(e=>!e.value)));const file=current+'-'+name+'.png';await page.screenshot({path:dir+'/'+file,fullPage:true});report.screenshots.push(file);check('no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth));}
try{
 for(const width of [1440,390]){
  if(width===390){for(const ms of [31000,30000]){process.stdout.write(JSON.stringify({progress:'local billing rate window',wait_ms:ms})+'\n');await new Promise(r=>setTimeout(r,ms));}}
  current=String(width);const browser=await engines.chromium.connect('ws://127.0.0.1:9320/',{timeout:10000});clients.add(browser);
  const user=await register(browser,width),{page}=user;check('mail egress remains disabled',(await page.locator('#modes').innerText()).includes('отправка disabled')&&(await page.locator('#modes').innerText()).includes('опрос disabled'));await nav(page);
  check('configured LIVE Team price',/990/.test(await page.locator('#content').innerText())&&/LIVE/.test(await page.locator('#content').innerText()));
  const checkout=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/billing/checkout'&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Создать LIVE checkout',exact:true}).press('Enter');const created=(await (await checkout).json()).data;check('pending checkout never grants',created.state==='pending'&&created.entitlement.plan==='free');const intent=created.id;await idle(page);
  const link=page.locator('a[href^="https://yoomoney.ru/"]');check('allowed canonical provider anchor',await link.count()===1);const popupPromise=page.waitForEvent('popup');await link.press('Enter');const popup=await popupPromise;await popup.waitForLoadState();check('provider navigation intercepted locally',popup.url().startsWith('https://yoomoney.ru/'));await popup.close();
  await page.goto(origin+'/app?billingIntent='+intent);await idle(page);check('return stays free',(await api(page,'/api/billing/status')).body.data.plan==='free');await fixture({action:'pending',intent});
  await fixture({action:'succeeded',intent});await refresh(page);const confirmed=(await api(page,'/api/billing/status')).body.data;check('canonical success grants team',confirmed.plan==='team');const expiry=confirmed.expiresAt;const snap=await fixture({action:'snapshot',intent});check('fixed thirty day expiry',Date.parse(expiry)-Date.parse(snap.paidAt)===30*86400000);
  await screenshot(page,'team');await page.reload();await idle(page);await nav(page);check('reload preserves confirmed expiry',(await api(page,'/api/billing/status')).body.data.expiresAt===expiry);
  check('history keeps LIVE identity',(await page.locator('#content').innerText()).includes('LIVE'));const history=page.getByText('История намерений · последние 50',{exact:true});await history.click();const historyResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/billing/intents/'+intent);await page.getByRole('button',{name:/^LIVE .*succeeded.*посмотреть$/}).click();check('history opens bound confirmed intent',(await (await historyResponse).json()).data.id===intent);await idle(page);
  await fixture({action:'outage',enabled:true});await nav(page);const outage=(await api(page,'/api/billing/status')).body.data;check('outage preserves confirmed team',outage.plan==='team'&&outage.expiresAt===expiry&&outage.availability==='unavailable');await fixture({action:'outage',enabled:false});
  await fixture({action:'refund',intent});await nav(page);check('verified partial refund revokes',(await api(page,'/api/billing/status')).body.data.plan==='free');await screenshot(page,'refund');
  const canceled=await register(browser,width);await nav(canceled.page);const cancelResponse=canceled.page.waitForResponse(r=>new URL(r.url()).pathname==='/api/billing/checkout'&&r.request().method()==='POST');await canceled.page.getByRole('button',{name:'Создать LIVE checkout',exact:true}).press('Enter');const cancelIntent=(await (await cancelResponse).json()).data.id;await idle(canceled.page);await fixture({action:'canceled',intent:cancelIntent});await refresh(canceled.page);check('canonical cancel cannot grant',(await api(canceled.page,'/api/billing/status')).body.data.plan==='free');await canceled.context.close();contexts.delete(canceled.context);
  const other=await register(browser,width);await other.page.goto(origin+'/app?billingIntent='+intent);await idle(other.page);check('foreign return cannot grant',(await api(other.page,'/api/billing/status')).body.data.plan==='free');check('foreign intent status denied',(await api(other.page,'/api/billing/intents/'+intent)).status===404);await other.page.goto(origin+'/app?billingIntent='+randomUUID());await idle(other.page);check('forged return cannot grant',(await api(other.page,'/api/billing/status')).body.data.plan==='free');await other.context.close();contexts.delete(other.context);
  await nav(page);await fixture({action:'hold'});const refreshResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/billing/status');await page.locator('nav').getByRole('button',{name:'Тариф',exact:true}).click();
  for(let i=0;i<30;i++){if((await fixture({action:'held'})).held)break;await new Promise(r=>setTimeout(r,50));}check('late canonical fetch held',(await fixture({action:'held'})).held);
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.waitForURL('**/signin');await fixture({action:'release'});await refreshResponse.catch(()=>{});check('late response cannot restore cabinet',new URL(page.url()).pathname==='/signin'&&await page.locator('#content').count()===0);
  await page.getByLabel('Электронная почта',{exact:true}).fill(user.email);await page.getByLabel('Пароль',{exact:true}).fill(user.password);await page.getByRole('button',{name:'Войти',exact:true}).press('Enter');await page.waitForURL('**/app');await idle(page);check('actual UI login session valid',(await api(page,'/api/auth/me')).status===200);
  await user.context.close();contexts.delete(user.context);await browser.close();clients.delete(browser);
 }
 check('no unexpected runtime failures',report.failures.length===0);check('two local provider navigations',report.provider_navigations_intercepted===2);report.status='pass';
}catch(e){report.failures.push({kind:e.name,assertion:e.name==='AssertionError'?e.message.split('\n')[0]:null});process.exitCode=1;}
finally{for(const c of contexts)await c.close().catch(()=>{});for(const b of clients)await b.close().catch(()=>{});lines.close();report.cleanup={own_contexts_closed:true,shared_browser_server_preserved:true};report.finished_at=new Date().toISOString();await writeFile(dir+'/checks.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,checks:report.checks.length})+'\n');}
