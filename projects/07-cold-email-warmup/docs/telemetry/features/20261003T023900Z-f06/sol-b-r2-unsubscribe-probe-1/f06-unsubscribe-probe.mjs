// Bounded real form probe; no operator/runtime credential enters the browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer,request} from 'node:http';
import {createInterface} from 'node:readline';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('/opt/browser/node_modules/playwright');
const dir=process.env.N7_UI_EVIDENCE,p=JSON.parse(await readFile(dir+'/preflight.json','utf8'));
assert.equal(p.status,'ready');assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const correction=Array.isArray(p.public_urls),sockets=new Set(),upstreams=new Set(),requests=[];
const lines=createInterface({input:process.stdin}),iterator=lines[Symbol.asyncIterator]();
async function effects(){process.stdout.write(JSON.stringify({fixture:{action:'effects',tenant:p.fixture_input.tenant}})+'\n');const data=JSON.parse((await iterator.next()).value);assert(data.ok);return data.result;}
let browser,context,result={status:'failed',source:p.source_sha256,build:p.build_sha256,checks:[],http:[],console:[],page_errors:[],failures:[],viewports:[]};
function check(name,condition){result.checks.push({name,pass:Boolean(condition)});assert(condition,name);}
const server=createServer((incoming,outgoing)=>{const method=incoming.method;const originClass=incoming.headers.origin===p.origin?'configured':incoming.headers.origin==='null'?'opaque-null':incoming.headers.origin===undefined?'absent':'other';
 const upstream=request({hostname:'n7f06a-web-1',port:3000,path:incoming.url,method,headers:incoming.headers},response=>{requests.push({method,origin_class:originClass,status:response.statusCode});outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);});
 upstreams.add(upstream);upstream.on('close',()=>upstreams.delete(upstream));upstream.on('error',()=>outgoing.destroy());incoming.pipe(upstream);
});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
let externalReferer=null;
const external=createServer((incoming,outgoing)=>{externalReferer=incoming.headers.referer===undefined?'absent':'present';outgoing.end('local referrer capture');});
external.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
try{
 await new Promise(r=>server.listen(18709,'127.0.0.1',r));
 if(correction)await new Promise(r=>external.listen(18710,'127.0.0.1',r));
 browser=await chromium.connect('ws://127.0.0.1:9320/');result.browser_version=browser.version();
 for(const [index,width,height] of (correction?[[0,1440,900],[1,390,844]]:[[0,390,844]])){
  context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();
  const url=correction?p.public_urls[index]:p.public_test_url;
  const before=correction?await effects():null;
  let response=await page.goto(url);assert.equal(response.status(),200);assert.equal(await page.getByRole('button',{name:'Unsubscribe',exact:true}).count(),1);
  await page.screenshot({path:dir+(correction?'/'+width+'-confirmation.png':'/confirmation.png')});
  if(correction){
   check(width+' HTML policy same-origin',response.headers()['referrer-policy']==='same-origin');
   check(width+' GET zero business effects',JSON.stringify(await effects())===JSON.stringify(before));
   check(width+' CSP preserved',response.headers()['content-security-policy'].includes("form-action 'self'"));
   check(width+' cache no-store',response.headers()['cache-control']==='no-store');
   for(const origin of ['null','https://forged.example']){
    const denied=await context.request.post(url,{headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},data:'confirm=unsubscribe'});
    check(width+' denied '+origin,denied.status()===403&&(await denied.json()).error.code==='origin_denied');
    check(width+' denied zero business effects',JSON.stringify(await effects())===JSON.stringify(before));
   }
   await page.evaluate(()=>{const link=document.createElement('a');link.href='http://127.0.0.1:18710/capture';link.textContent='Local capture';document.body.append(link);});
   await Promise.all([page.waitForURL('**/capture'),page.getByRole('link',{name:'Local capture'}).click()]);
   check(width+' cross-origin referrer absent',externalReferer==='absent');await page.goto(url);
  }
  const navigation=page.waitForNavigation();await page.getByRole('button',{name:'Unsubscribe',exact:true}).click();response=await navigation;
  const body=JSON.parse(await page.locator('body').innerText());await page.screenshot({path:dir+(correction?'/'+width+'-form-result.png':'/form-result.png')});
  if(correction){
   check(width+' native POST200',response.status()===200&&body.data.state==='suppressed');
   check(width+' native configured Origin',requests.at(-1).method==='POST'&&requests.at(-1).origin_class==='configured');
   const after=await effects();check(width+' suppression added',after.suppression.length===before.suppression.length+1);
   check(width+' queued future job cancelled',after.jobs.find(j=>j.state==='cancelled')?.count===(before.jobs.find(j=>j.state==='cancelled')?.count??0)+1);
   await page.goto(url);const repeat=page.waitForNavigation();await page.getByRole('button',{name:'Unsubscribe',exact:true}).click();response=await repeat;
   check(width+' duplicate200',response.status()===200);check(width+' duplicate idempotent',JSON.stringify(await effects())===JSON.stringify(after));
   result.viewports.push({width,height,before,after});
  }else{result.http_status=response.status();result.body=body;assert.equal(response.status(),403);assert.equal(body.error.code,'origin_denied');assert(requests.some(r=>r.method==='POST'&&r.origin_class==='opaque-null'&&r.status===403));}
  await context.close();context=null;
 }
 result.status=correction?'pass':'confirmed-product-defect';
}catch(error){result.failures.push({kind:error.name,assertion:error.name==='AssertionError'?error.message.split('\n')[0]:null});process.exitCode=1;}
finally{await context?.close();await browser?.close();for(const r of upstreams)r.destroy();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));if(external.listening)await new Promise(r=>external.close(r));lines.close();result.requests=requests;result.cleanup={contexts_closed:true,bridge_closed:true,sockets_destroyed:true,shared_browser_preserved:true};await writeFile(dir+(correction?'/checks.json':'/diagnostic.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,checks:result.checks.length}));
