import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),pw=require('/opt/browser/node_modules/playwright');
assert.equal(require('/opt/browser/node_modules/playwright/package.json').version,'1.63.0');
const dir=process.env.N7_UI_EVIDENCE,preflight=JSON.parse(await readFile(dir+'/preflight.json','utf8'));assert.equal(preflight.status,'ready');
const bridge=createServer((req,res)=>{const out=request('http://n7f06a-web-1:3000'+req.url,{method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});out.on('error',()=>{res.writeHead(503);res.end();});req.pipe(out);});
await new Promise(r=>bridge.listen(18709,'127.0.0.1',r));
const browser=await pw.chromium.connect('ws://127.0.0.1:9320/'),context=await browser.newContext(),page=await context.newPage();
const report={testTitle:'separate diagnostic status persists and respects keyboard capacity consent',status:'failed',source:preflight.source_sha256,build:preflight.build_sha256,image:preflight.image_id,checks:[],pageErrors:[]};page.on('pageerror',e=>report.pageErrors.push(e.name));
const check=(name,value)=>{report.checks.push({name,pass:!!value});assert.ok(value,name);};
try{
 const fixture=JSON.parse(await readFile(dir+'/fixture.json','utf8'));await context.addCookies([{name:'n7_session',value:fixture.token,url:'http://127.0.0.1:18709'}]);
 await page.goto('http://127.0.0.1:18709/app');await page.locator('[data-page=mailboxes]').click();await page.locator('select[name=mailbox]').selectOption(fixture.id);await page.locator('select[name=mailbox]').dispatchEvent('change');
 await page.getByRole('heading',{name:'Диагностика SMTP / IMAP'}).waitFor();
 for(const width of [1440,390]){
 await page.setViewportSize({width,height:900});
 check('SMTP fixture success '+width,await page.getByText(/SMTP · protocol_fixture · TLS: verified · AUTH: success/).count()===1);
 check('IMAP independent rejection '+width,await page.getByText(/IMAP · protocol_fixture · TLS: verified · AUTH: failed · auth_rejected/).count()===1);
 check('revoked authority unusable '+width,await page.getByText('отключена оператором',{exact:true}).count()===1);
 check('capacity independent '+width,await page.getByText(/Состояние: inactive/).count()===1);
 check('unchecked separate consent '+width,await page.locator('input[name=affirmative]').first().isChecked()===false);
 check('no horizontal overflow '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 let requests=0;await page.route('**/diagnostics',async route=>{requests++;await new Promise(r=>setTimeout(r,200));await route.continue();});
 const button=page.getByRole('button',{name:'Проверить SMTP / IMAP',exact:true});await button.focus();await page.keyboard.press('Enter');await page.locator('#content[aria-busy=true]').waitFor();check('keyboard busy state',true);
 await button.evaluate(b=>b.click());await page.getByText(/live_provider_disabled/).waitFor();check('busy duplicate suppressed',requests===1);
 await page.reload();await page.locator('[data-page=mailboxes]').click();await page.locator('select[name=mailbox]').selectOption(fixture.id);await page.locator('select[name=mailbox]').dispatchEvent('change');await page.getByText(/SMTP · protocol_fixture · TLS: verified · AUTH: success/).waitFor();check('separate result persists on reload',true);
 check('DOM canary absent',!(await page.locator('body').innerText()).includes('CANARY'));await page.screenshot({path:dir+'/diagnostics.png',fullPage:true});
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.waitForURL('**/signin');check('session clears diagnostics',await page.locator('#content').count()===0);check('no page errors',report.pageErrors.length===0);report.status='pass';
}finally{await writeFile(dir+'/browser-report.json',JSON.stringify(report,null,2));await context.close();await browser.close();await new Promise(r=>bridge.close(r));}
