// Narrow real Chromium native transport smoke, using the existing shared browser.
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const require=createRequire(import.meta.url), dir=process.env.N7_UI_EVIDENCE;
assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const preflight=JSON.parse(await readFile(dir+'/preflight.json','utf8'));assert.equal(preflight.status,'ready');
const sockets=new Set(),upstreams=new Set(),http=[],pageErrors=[];
const report={status:'failed',source:preflight.source_sha256,build:preflight.build_sha256,image:preflight.image_id,started_at:new Date().toISOString()};
let browser,context;
const bridge=createServer((incoming,outgoing)=>{
 const upstream=request({hostname:'n7f06a-web-1',port:3000,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);});
 upstreams.add(upstream);upstream.on('close',()=>upstreams.delete(upstream));upstream.on('error',()=>{if(!outgoing.destroyed){outgoing.writeHead(502);outgoing.end();}});incoming.pipe(upstream);
});bridge.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
try{
 await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(18709,'127.0.0.1',resolve);});
 browser=await require('/opt/browser/node_modules/playwright').chromium.connect('ws://127.0.0.1:9320/',{timeout:10000});
 report.chromium_version=browser.version();context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 page.on('pageerror',e=>pageErrors.push(e.name));page.on('response',r=>{const u=new URL(r.url());if(u.origin==='http://127.0.0.1:18709')http.push({path:u.pathname,status:r.status(),method:r.request().method()});});
 await page.goto('http://127.0.0.1:18709/signin');
 await page.getByLabel('Электронная почта',{exact:true}).fill('n7-f06b-r1-'+randomBytes(8).toString('hex')+'@example.test');
 await page.getByLabel('Пароль',{exact:true}).fill(randomBytes(24).toString('base64url'));
 await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();await page.waitForURL('**/app');
 await page.locator('#content .card').first().waitFor();
 report.native=await page.evaluate(async()=>{
  const native=window.fetch;
  const direct=await fetch('/api/app');await direct.json();
  const {SessionClient}=await import('/assets/client.js');let cleared=0,redirected=0;
  const client=new SessionClient(()=>cleared++,()=>redirected++);
  const data=await client.request('/api/app');
  return {direct_status:direct.status,client_success:typeof data==='object'&&data!==null,cleared,redirected,native_unchanged:window.fetch===native};
 });
 assert.deepEqual(report.native,{direct_status:200,client_success:true,cleared:0,redirected:0,native_unchanged:true});
 assert(http.filter(r=>r.path==='/api/app'&&r.status===200).length>=3,'bootstrap, direct and actual client requests');
 assert.equal(pageErrors.length,0);report.status='pass';
}catch(e){report.failure={kind:e.name,assertion:e.name==='AssertionError'?e.message.split('\n')[0]:null};process.exitCode=1;}
finally{
 await context?.close();await browser?.close();for(const r of upstreams)r.destroy();for(const s of sockets)s.destroy();if(bridge.listening)await new Promise(r=>bridge.close(r));
 report.http=http;report.page_errors=pageErrors;report.cleanup={own_context_closed:true,bridge_closed:!bridge.listening,shared_browser_preserved:true};report.finished_at=new Date().toISOString();
 await writeFile(dir+'/checks.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,native:report.native??null}));
}
