import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
const origin=process.env.N8_PUBLIC_ORIGIN;
assert.equal(origin,'https://n8.77.83.87.178.sslip.io');
assert.equal(process.env.N8_E2E_PUBLIC,'true');
const fixture=JSON.parse(await readFile(new URL('../.runtime/e2e/public-journey-1/runtime-fixture.json',import.meta.url),'utf8'));
const evidenceRoot=process.env.N8_E2E_EVIDENCE_DIR;
assert.match(evidenceRoot,/^docs\/telemetry\/p-replicator\/[a-zA-Z0-9-]+\/evidence$/);
const attempt=process.env.N8_E2E_ATTEMPT;assert.match(attempt,/^[a-z0-9-]{1,80}$/);
const dir=new URL(`../${evidenceRoot}/${attempt}/`,import.meta.url);
try{await access(dir);throw Error('Fresh evidence destination required');}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(dir,{recursive:true});
const results=[],violations=[],errors=[],outbound=[];const startedAt=new Date().toISOString();
for(const [engine,launcher] of Object.entries({chromium,firefox,webkit})){
 const browser=await launcher.launch({headless:true,...(engine==='chromium'?{args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin+'/')||u.startsWith('blob:')||u.startsWith('data:'))return r.continue();outbound.push({engine,url:u});return r.abort();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push({engine,message:e.message}));
 async function inspect(name,axe=true){await page.waitForTimeout(350);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${engine}/${name}: horizontal overflow`);await page.keyboard.press('Tab');assert(await page.evaluate(()=>document.activeElement!==document.body),`${engine}/${name}: keyboard focus`);await page.screenshot({path:new URL(`${engine}-${name}.png`,dir).pathname,fullPage:true});if(axe){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();violations.push(...result.violations.map(v=>({engine,page:name,id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));}results.push(`${engine}/${name}`);}
 try{
  const landing=await page.goto(origin,{waitUntil:'networkidle'});assert.equal(landing.status(),200);await inspect('landing');
  await page.goto(origin+'/login');await inspect('login');
  await page.getByLabel('Почта',{exact:true}).fill(fixture.email);await page.getByLabel(/^Пароль/).fill(fixture.password);
  await page.getByRole('button',{name:'Войти',exact:true}).click();await page.waitForURL('**/dashboard');
  const cookie=(await context.cookies()).find(c=>c.name==='n8_session');assert(cookie?.secure&&cookie.httpOnly,'Secure HttpOnly session');await inspect('dashboard');
  await page.goto(origin+`/dashboard/${fixture.projectId}`);await page.getByRole('img',{name:'План 6 на 3 метров'}).waitFor();
  const first=page.getByRole('tab',{name:'01 Обмеры',exact:true});await first.focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'02 Референсы',exact:true}).evaluate(e=>e===document.activeElement),true);assert.equal(await first.getAttribute('aria-selected'),'true');await page.keyboard.press('Enter');assert.equal(await page.getByRole('tab',{name:'02 Референсы',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await first.evaluate(e=>e===document.activeElement),true);await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'06 До / после',exact:true}).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Enter');results.push(`${engine}/keyboard-arrow-home-end-enter`);
  for(const width of [1440,390]){await page.setViewportSize({width,height:width===390?844:1000});for(const label of ['01 Обмеры','02 Референсы','03 Дизайн','04 Покупки','05 Смета','06 До / после']){const tab=page.getByRole('tab',{name:label,exact:true});await tab.click();await inspect(`project-${width}-${label.slice(0,2)}`,engine==='chromium');}}
  await page.getByRole('tab',{name:'05 Смета',exact:true}).click();await page.locator('.budget-summary').waitFor();assert.equal(await page.locator('.stats span').first().evaluate(e=>getComputedStyle(e).display),'block');assert(!/service:|delivery:|excluded from purchase/.test(await page.getByRole('tabpanel').filter({visible:true}).innerText()));
  const budgetPath=origin+`/api/projects/${fixture.projectId}/budgets`;let injected=false;
  await page.route(budgetPath,async route=>{if(route.request().method()==='POST'){injected=true;return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'INVALID_INPUT',message:'Проверьте данные сметы'},meta:{requestId:'synthetic-ui-error'}})});}return route.continue();});
  await page.getByLabel('Лимит ремонта, ₽',{exact:true}).fill('12345');await page.getByLabel('Причина пересчёта',{exact:true}).fill('Незавершённое уточнение');await page.getByRole('button',{name:'Рассчитать и сохранить смету',exact:true}).click();const alert=page.getByRole('tabpanel').getByRole('alert');await alert.waitFor();assert(injected);assert.equal(await page.getByLabel('Лимит ремонта, ₽',{exact:true}).inputValue(),'12345');assert.equal(await page.getByLabel('Причина пересчёта',{exact:true}).inputValue(),'Незавершённое уточнение');assert.equal(await alert.evaluate(e=>e===document.activeElement),true);await page.screenshot({path:new URL(`${engine}-typed422-preserved-mobile.png`,dir).pathname,fullPage:true});results.push(`${engine}/injected-typed422-preserve-input-and-focus`);await page.unroute(budgetPath);
  await page.goto(origin+`/dashboard/${fixture.glbProjectId}`);await page.getByLabel('Точка A',{exact:true}).waitFor();assert.equal(await page.getByLabel('Измеренное расстояние, м',{exact:true}).inputValue(),'2');await inspect('glb-mobile');
  await page.goto(origin+'/billing');await page.getByText('Оплата пока отключена.',{exact:false}).waitFor();await inspect('billing-mobile');
 }catch(error){await page.screenshot({path:new URL(`${engine}-failure.png`,dir).pathname,fullPage:true}).catch(()=>{});await writeFile(new URL('failure.json',dir),JSON.stringify({engine,message:error.message,results,violations,errors,outbound},null,2));throw error;}finally{await context.close();await browser.close();}
}
await writeFile(new URL('result.json',dir),JSON.stringify({buildRevision:process.env.N8_BUILD_REVISION,status:violations.length||errors.length||outbound.length?'failed':'passed',startedAt,finishedAt:new Date().toISOString(),results,violations,errors,outbound},null,2));
console.log(JSON.stringify({checks:results.length,violations:violations.length,errors,outbound}));assert.equal(violations.length,0,'WCAG violations');assert.equal(errors.length,0,'Browser exceptions');assert.equal(outbound.length,0,'Unexpected external requests');
