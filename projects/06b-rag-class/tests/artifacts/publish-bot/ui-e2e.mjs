import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8')),output=process.argv[3],base='https://n6b-ui.test';
await mkdir(output,{recursive:true});
const browser=await chromium.connect('ws://127.0.0.1:9320/'),contexts=[];
const report={started_at:new Date().toISOString(),source_revision:fixture.source_revision,source_snapshot_sha256:fixture.source_snapshot_sha256,build_image_id:fixture.image,status:'running',
 binding:'Real production web/registration/session/PATCH/Postgres. Actual PATCH responses delayed200ms only to observe pending UI; no fake handler/provider and no paid calls. Source fixture uses publicIP literal8.8.8.8 without fetch/worker to avoid DNS dependency.',checks:[]};
let stage='start',foreignBot=null;
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});contexts.push(context);const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  stage=`register-${width}`;await page.goto(base+'/register');await page.getByLabel('E-mail',{exact:true}).fill(`publish-${randomUUID()}@example.test`);await page.getByLabel('Пароль',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();await page.waitForURL(base+'/cabinet');
  if(foreignBot) {const r=await page.request.patch(base+`/api/bots/${foreignBot}/publish`,{headers:{Origin:base},data:{contact:'owner@example.test',allowed_origins:[]}});if(r.status()!==404)throw Error('Foreign publication not404');}
  const created=await page.request.post(base+'/api/bots',{headers:{Origin:base},data:{name:'Publish '+width,site_url:'https://8.8.8.8/delivery'}});
  if(created.status()!==202)throw Error('Site bot creation '+created.status()+' '+await created.text());const {bot_id:botId}= (await created.json()).data;foreignBot=botId;
  await page.reload();const panel=page.locator('#publish-'+botId),contact=panel.getByLabel('Контакт владельца (обязательно)',{exact:true}),origins=panel.getByLabel('Разрешённые домены (по одному адресу на строку)',{exact:true}),submit=panel.getByRole('button',{name:'Подтвердить и сохранить публикацию',exact:true}),code=panel.getByLabel('Код вставки',{exact:true});
  await panel.waitFor();if(await origins.inputValue()!=='https://8.8.8.8')throw Error('First source proposal missing');if(await code.count())throw Error('Unpublished code shown');
  const endpoint=base+`/api/bots/${botId}/publish`;
  await page.route(endpoint,async route=>{const response=await route.fetch();await new Promise(r=>setTimeout(r,200));await route.fulfill({response});});
  stage=`invalid-${width}`;await contact.fill('not-a-contact');let next=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='PATCH');await submit.click();
  if((await next).status()!==422)throw Error('Invalid contact not422');await panel.getByRole('alert').waitFor();if(await code.count())throw Error('Invalid contact exposed code');
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/invalid-${width}.png`,fullPage:true});
  stage=`publish-${width}`;await contact.fill('owner@example.test');await origins.fill('https://EXAMPLE.com:443/path\nhttps://example.com\nhttps://example.com:8443/a');next=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='PATCH');await submit.click();
  if(!await contact.isDisabled()||!await origins.isDisabled())throw Error('Pending inputs enabled');const accepted=await next;if(accepted.status()!==200)throw Error('Publication status '+accepted.status());const result=(await accepted.json()).data;
  await code.waitFor();const expected=`<script src="${base}/w.js" data-bot="${result.public_id}" async></script>`;if(await code.inputValue()!==expected)throw Error('Embed code incorrect');
  if(await origins.inputValue()!=='https://example.com\nhttps://example.com:8443')throw Error('Origins not normalized/distinct');
  if(await page.locator('script[src="'+base+'/w.js"]').count())throw Error('Snippet executed');
  await page.reload();await code.waitFor();if(await code.inputValue()!==expected||await contact.inputValue()!=='owner@example.test')throw Error('Publication not persisted');
  await panel.scrollIntoViewIfNeeded();if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Overflow');await page.screenshot({path:`${output}/published-${width}.png`,fullPage:true});
  stage=`empty-${width}`;await origins.fill('');next=page.waitForResponse(r=>r.url()===endpoint&&r.request().method()==='PATCH');await submit.click();if((await next).status()!==200)throw Error('Empty list rejected');
  await code.waitFor();await page.reload();await code.waitFor();if(await origins.inputValue()!=='')throw Error('Empty saved allowlist refilled');await panel.getByText(/Добавьте домен/).waitFor();
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/empty-${width}.png`,fullPage:true});
  if(errors.length)throw Error('JavaScript errors '+JSON.stringify(errors));
  report.checks.push({viewport:width,registration:'pass',first_source_proposed_not_published:'pass',invalid422_no_code:'pass',pending_disabled:'pass',publication200:'pass',normalized_origins:'pass',exact_text_embed:'pass',reload_persistence:'pass',empty_closed_persistence:'pass',foreign404:width===390?'pass':'not_applicable_first_account',layout:'pass',javascript_errors:0});await context.close();
 }
 report.status='passed';
} catch(error) {report.status='failed';report.stage=stage;report.error=String(error);process.exitCode=1;}
finally {report.finished_at=new Date().toISOString();await writeFile(output+'/report.json',JSON.stringify(report,null,2));for(const c of contexts)await c.close().catch(()=>{});await browser.close();console.log(JSON.stringify(report));}
