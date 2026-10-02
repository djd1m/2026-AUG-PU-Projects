import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const fixture=JSON.parse(await readFile(process.argv[2],'utf8')), output=process.argv[3];
const base='https://n6b-ui.test', bridge='http://n6b-f07-ui-bridge:3001';
await mkdir(output,{recursive:true});
const browser=await chromium.connect('ws://127.0.0.1:9320/'), contexts=[];
const report={started_at:new Date().toISOString(),source_revision:fixture.source_revision,source_snapshot_sha256:fixture.source_snapshot_sha256,build_image_id:fixture.image,
 binding:'Real production UI, registration/session and PostgreSQL; only seeded ask endpoints forwarded to the real handler/PaidGateway with deterministic test provider and test session. No paid provider or live calibration claimed.',checks:[],status:'running'};
let stage='start';
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:900},ignoreHTTPSErrors:true});contexts.push(context);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const email=`sandbox-${randomUUID()}@example.test`;
  stage=`register-${width}`;await page.goto(base+'/register');
  await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Пароль',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();await page.waitForURL(base+'/cabinet');
  const modes={};
  for(const mode of ['site','pdf','unknown','recover']) {
   const r=await context.request.post(bridge+'/seed',{data:{email,mode}});if(r.status()!==200)throw Error('Fixture seed '+r.status());
   const {botId}=await r.json();modes[mode]=botId;
   await page.route(base+`/api/bots/${botId}/ask`,async route=>{
    const answer=await context.request.post(bridge+'/ask/'+botId,{data:route.request().postDataJSON()});
    await route.fulfill({status:answer.status(),headers:answer.headers(),body:await answer.body()});
   });
  }
  await page.reload();
  for(const mode of ['site','pdf','unknown','recover']) {
   stage=`${mode}-${width}`;const panel=page.locator('#sandbox-'+modes[mode]);const input=panel.locator('textarea');const submit=panel.getByRole('button',{name:'Спросить',exact:true});
   if(await input.getAttribute('maxlength')!=='500')throw Error('Question bound absent');
   await input.fill('Когда доставка?');await submit.click();
   await panel.getByRole('status').waitFor();if(!await input.isDisabled())throw Error('Pending input enabled');
   if(mode==='recover') {
    await panel.getByRole('alert').waitFor();if(await input.isDisabled())throw Error('Recovery input disabled');
    await submit.click();
   }
   await panel.locator('.answer-text').waitFor();
   const answer=await panel.locator('.answer-text').innerText();
   if(mode==='unknown') {
    if(answer !== 'В материалах нет ответа. Посетители увидят здесь ваш контакт — укажите его перед публикацией')throw Error('No-contact refusal absent');
    if(await panel.locator('a').count())throw Error('Refusal citation');
   } else {
    if(!answer.includes('Доставка 2 дня')||answer.includes('model-evil.test'))throw Error('Unsafe or absent answer text');
    if(await panel.locator('script').count())throw Error('Unescaped model text');
    const citations=panel.getByRole('list',{name:'Источники ответа'});await citations.waitFor();
    if(mode==='pdf') {await citations.getByText('delivery.pdf, стр. 2',{exact:true}).waitFor();if(await citations.locator('a').count())throw Error('Invented PDF URL');}
    else if(await citations.locator('a').getAttribute('href')!=='https://own.example.test/delivery')throw Error('Wrong database URL');
    if(!await panel.getByRole('button',{name:'Вставить на сайт',exact:true}).isDisabled())throw Error('Future CTA prematurely enabled');
    await panel.getByText(/Публикация станет доступна/).waitFor();
   }
   await panel.scrollIntoViewIfNeeded();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Horizontal overflow');
   await page.screenshot({path:`${output}/${mode}-${width}.png`,fullPage:true});
   report.checks.push({viewport:width,mode,result:'pass',pending_disabled:true,bounded_question:true});
  }
  if(errors.length)throw Error('JavaScript errors '+JSON.stringify(errors));
  report.checks.push({viewport:width,registration:'pass',javascript_errors:0,layout:'pass'});
  await context.close();
 }
 report.status='passed';
} catch(error) {report.status='failed';report.stage=stage;report.error=String(error);process.exitCode=1;}
finally {report.finished_at=new Date().toISOString();await writeFile(output+'/report.json',JSON.stringify(report,null,2));for(const c of contexts)await c.close().catch(()=>{});await browser.close();console.log(JSON.stringify(report));}
