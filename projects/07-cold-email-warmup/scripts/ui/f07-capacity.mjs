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
const report={status:'failed',source:preflight.source_sha256,build:preflight.build_sha256,image:preflight.image_id,checks:[],pageErrors:[]};page.on('pageerror',e=>report.pageErrors.push(e.name));
const check=(name,condition)=>{report.checks.push({name,pass:!!condition});assert.ok(condition,name);};
try{
 const fixture=JSON.parse(await readFile(dir+'/fixture.json','utf8'));
 await context.addCookies([{name:'n7_session',value:fixture.token,url:'http://127.0.0.1:18709'}]);
 await page.goto('http://127.0.0.1:18709/app');await page.getByText('Ваши ящики: 101',{exact:true}).waitFor();check('overview honest total',true);
 await page.locator('[data-page=mailboxes]').click();await page.getByText(/Всего подключено: 101/).waitFor();
 for(let i=0;i<4;i++){await Promise.all([page.waitForResponse(r=>r.url().includes('/api/mailboxes?after=')&&r.status()===200),page.getByRole('button',{name:'Следующая страница ящиков',exact:true}).click()]);await page.waitForTimeout(100);}
 await page.locator('select[name=mailbox]').selectOption(fixture.lastId);await page.locator('select[name=mailbox]').dispatchEvent('change');await page.getByText('Активная ёмкость · local TEST',{exact:true}).waitFor();
 check('consent remains unchecked',await page.locator('input[name=affirmative]').first().isChecked()===false);
 const activate=page.getByRole('button',{name:'Активировать / повторить запрос',exact:true});await activate.focus();await page.keyboard.press('Enter');await page.getByText(/Состояние: waiting_capacity/).waitFor();check('saturation visible keyboard activation',true);
 await page.evaluate(async id=>{const r=await fetch('/api/mailboxes/'+id+'/capacity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'deactivate'})});if(!r.ok)throw new Error('fixture release');},fixture.firstId);await activate.click();await page.getByText(/Состояние: active/).waitFor();check('released slot retry becomes active',true);
 await page.getByRole('button',{name:'Освободить ёмкость',exact:true}).click();await page.getByText(/Состояние: inactive/).waitFor();check('explicit deactivate',true);
 await page.locator('[data-page=campaigns]').click();await page.getByRole('button',{name:/Fixture campaign/}).count();await page.locator('select[name=campaign]').selectOption(fixture.campaignId);await page.locator('select[name=campaign]').dispatchEvent('change');await page.getByRole('button',{name:'Следующая страница выбора',exact:true}).waitFor();
 for(let i=0;i<4;i++){await Promise.all([page.waitForResponse(r=>r.url().includes('/api/mailboxes?after=')&&r.status()===200),page.getByRole('button',{name:'Следующая страница выбора',exact:true}).click()]);await page.waitForTimeout(100);}
 check('campaign chooser reaches101st',await page.locator('select[name=mailbox] option[value="'+fixture.lastId+'"]').count()===1);
 await page.locator('[data-page=billing]').click();await page.getByText(/Ящики: без ограничения/).waitFor();check('null renders unlimited separately from30',true);
 check('no credential canary in DOM',!(await page.locator('body').innerText()).includes('N7_F07_SECRET_CANARY'));
 await page.screenshot({path:dir+'/capacity.png',fullPage:true});
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await page.waitForURL('**/signin');check('session clears private page',await page.locator('#content').count()===0);check('no page errors',report.pageErrors.length===0);report.status='pass';
}finally{await writeFile(dir+'/browser-report.json',JSON.stringify(report,null,2));await context.close();await browser.close();await new Promise(r=>bridge.close(r));}
