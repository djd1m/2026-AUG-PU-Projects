// Bounded real form diagnostic. No authorization/header values or operator data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer,request} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{chromium}=require('/opt/browser/node_modules/playwright');
const dir=process.env.N7_UI_EVIDENCE,p=JSON.parse(await readFile(dir+'/preflight.json','utf8'));
assert.equal(p.status,'ready');assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const sockets=new Set(),upstreams=new Set(),requests=[];let browser,context,result={status:'failed'};
const server=createServer((incoming,outgoing)=>{const method=incoming.method;const originClass=incoming.headers.origin===p.origin?'configured':incoming.headers.origin==='null'?'opaque-null':incoming.headers.origin===undefined?'absent':'other';
 const upstream=request({hostname:'n7f06a-web-1',port:3000,path:incoming.url,method,headers:incoming.headers},response=>{requests.push({method,origin_class:originClass,status:response.statusCode});outgoing.writeHead(response.statusCode,response.headers);response.pipe(outgoing);});
 upstreams.add(upstream);upstream.on('close',()=>upstreams.delete(upstream));upstream.on('error',()=>outgoing.destroy());incoming.pipe(upstream);
});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
try{
 await new Promise(r=>server.listen(18709,'127.0.0.1',r));browser=await chromium.connect('ws://127.0.0.1:9320/');context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
 await page.goto(p.public_test_url);assert.equal(await page.getByRole('button',{name:'Unsubscribe',exact:true}).count(),1);await page.screenshot({path:dir+'/confirmation.png'});
 const navigation=page.waitForNavigation();await page.getByRole('button',{name:'Unsubscribe',exact:true}).click();const response=await navigation;const body=await page.locator('body').innerText();await page.screenshot({path:dir+'/form-result.png'});
 result={status:'confirmed-product-defect',source:p.source_sha256,build:p.build_sha256,http_status:response.status(),body:JSON.parse(body),requests};
 assert.equal(response.status(),403);assert.equal(result.body.error.code,'origin_denied');assert(requests.some(r=>r.method==='POST'&&r.origin_class==='opaque-null'&&r.status===403));
}finally{await context?.close();await browser?.close();for(const r of upstreams)r.destroy();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));result.cleanup={contexts_closed:true,bridge_closed:true,sockets_destroyed:true,shared_browser_preserved:true};await writeFile(dir+'/diagnostic.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({status:result.status,http_status:result.http_status}));
