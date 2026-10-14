import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Synthetic fixture credentials are read privately, never printed or copied to evidence.
const fixture=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
const origin=fixture.origin??fixture.baseURL??'http://127.0.0.1:3308';
const root=path.dirname(fileURLToPath(import.meta.url));
const attempt=process.argv[3]??'2';
const results=[];
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const check=(name,pass,details={})=>{results.push({name,pass,...details});console.log(`${pass?'PASS':'FAIL'} ${name}`);};
async function authenticatedContext(viewport,webglFail=false){
 const context=await browser.newContext({viewport});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin&&/\/designs\/[^/]+\/view$/.test(u.pathname)&&route.request().method()==='POST')return route.fulfill({status:204});return u.origin===origin||['data:','blob:'].includes(u.protocol)?route.continue():route.abort('blockedbyclient');});
 if(webglFail)await context.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl|experimental-webgl/.test(type)?null:original.call(this,type,...args);};});
 const page=await context.newPage();
 await page.goto(origin+'/login');
 await page.getByLabel('Почта',{exact:true}).fill(fixture.email??fixture.owner.email);
 await page.getByLabel(/^Пароль/).fill(fixture.password??fixture.owner.password);
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 await page.waitForURL('**/dashboard');
 await page.goto(`${origin}/dashboard/${fixture.projectId}`);
 await page.getByRole('tab',{name:'01 Обмеры'}).waitFor();
 return {context,page};
}
try{
 const {context,page}=await authenticatedContext({width:1440,height:1000});
 const project=await page.evaluate(async id=>(await(await fetch(`/api/projects/${id}`)).json()).data,fixture.projectId);
 const shells=await page.evaluate(async id=>(await(await fetch(`/api/projects/${id}/shells`)).json()).data.items,fixture.projectId);
 const shell=shells.find(s=>s.id===project.currentShellId);
 if(shell?.mode==='manual'){
  await page.waitForFunction(expected=>document.querySelector('input[name=lengthM]')?.value===expected,shell.geometry.lengthM);
  if(attempt==='2')check('saved manual dimensions restored',(await page.locator('input[name=lengthM]').inputValue())===shell.geometry.lengthM);
  await page.getByLabel('Длина, м',{exact:true}).fill('7.123');
  await page.getByLabel('Я проверил размеры и расположение проёмов.').check();
  await page.route(`**/api/projects/${fixture.projectId}/shells`,route=>route.request().method()==='POST'?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'UI_REVIEW_FIELD_ERROR',message:'Проверка: исправьте обмеры'}})}):route.continue());
  await page.getByRole('button',{name:'Сохранить обмеры'}).focus();await page.keyboard.press('Enter');
  await page.getByRole('alert').filter({hasText:'Проверка: исправьте обмеры'}).waitFor();
  check('manual plan error retains draft and receives focus',(await page.getByLabel('Длина, м',{exact:true}).inputValue())==='7.123'&&await page.getByRole('alert').filter({hasText:'Проверка: исправьте обмеры'}).evaluate(el=>el===document.activeElement),{errorSource:'intercepted typed 422; no server mutation'});
  await page.unroute(`**/api/projects/${fixture.projectId}/shells`);
 }
 const tabs=['01 Обмеры','02 Референсы','03 Дизайн','04 Покупки','05 Смета','06 До / после'];
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  for(const tab of tabs){
   const target=page.getByRole('tab',{name:tab});
   await page.locator('a.brand').focus();
   let reachable=false;
   for(let steps=0;steps<16;steps++){await page.keyboard.press('Tab');if(await target.evaluate(el=>el===document.activeElement)){reachable=true;break;}}
   if(reachable)await page.keyboard.press('Enter');
   await page.waitForTimeout(160);
   const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,focus:getComputedStyle(document.activeElement).outlineWidth,selected:document.activeElement.getAttribute('aria-selected')}));
   check(`${width}px keyboard tab ${tab}`,reachable&&metrics.scroll<=metrics.width&&metrics.focus!=='0px'&&metrics.selected==='true',{...metrics,reachableByTab:reachable});
  }
  await page.getByRole('tab',{name:'03 Дизайн'}).click();
  await page.waitForTimeout(400);
  await page.screenshot({path:path.join(root,`design-${width}-${attempt}.png`),fullPage:true});
 }
 await page.getByRole('tab',{name:'04 Покупки'}).click();
 const productForm=page.locator('form').filter({has:page.getByRole('heading',{name:'Добавить товар'})});
 await productForm.getByLabel('Название товара',{exact:true}).fill('Проверка UI');
 await productForm.getByLabel('Ссылка на товар').fill('https://lemanapro.ru/product/ui-review');
 await productForm.getByLabel('Цена упаковки / штуки, ₽').fill('1600');
 await productForm.getByLabel('Основная единица').selectOption('piece');
 await productForm.getByText('Габариты штучного товара (если известны)',{exact:true}).click();
 await productForm.getByLabel('Ширина товара, м').fill('0.5');
 await productForm.getByLabel('Высота товара, м').fill('0.8');
 await productForm.getByLabel('Глубина товара, м').fill('0.6');
 let submittedProduct=null;
 await page.route(`**/api/projects/${fixture.projectId}/products`,route=>{if(route.request().method()!=='POST')return route.continue();submittedProduct=route.request().postDataJSON();return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'UI_REVIEW_CAPTURE_ONLY',message:'Проверка: товар не сохранён'}})});});
 await productForm.getByRole('button',{name:'Сохранить снимок товара'}).focus();await page.keyboard.press('Enter');
 await page.getByRole('alert').filter({hasText:'Проверка: товар не сохранён'}).waitFor();
 check('native 1600 RUB and optional dimensions reach request exactly',submittedProduct?.priceMinor===160000&&JSON.stringify(submittedProduct?.dimensionsM)===JSON.stringify(['0.5','0.8','0.6']),{capturedPriceMinor:submittedProduct?.priceMinor,capturedDimensions:submittedProduct?.dimensionsM,mutation:'intercepted; not sent to server'});
 await page.unroute(`**/api/projects/${fixture.projectId}/products`);
 await page.route(`**/api/projects/${fixture.projectId}/products`,async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();const payload=await response.json();for(const product of payload.data.items){product.freshness='fresh';product.observedAt='2000-01-01T00:00:00.000Z';}return route.fulfill({response,json:payload});});
 await page.getByRole('tab',{name:'02 Референсы'}).click();
 await page.getByRole('tab',{name:'04 Покупки'}).click();
 await page.getByText('Устарел — требуется новое подтверждение',{exact:true}).first().waitFor();
 check('stored fresh snapshot is visibly stale after 24h',await page.getByText('Устарел — требуется новое подтверждение',{exact:true}).count()>0,{fixture:'read response timestamp overridden; server snapshots untouched'});
 await page.unroute(`**/api/projects/${fixture.projectId}/products`);
 await page.getByRole('tab',{name:'02 Референсы'}).click();
 const notes='Проверка сохранения незавершённого ввода';
 await page.getByLabel('Публичная HTTPS-ссылка').fill('https://example.com/ui-review');
 await page.getByLabel('Что понравилось').fill(notes);
 await page.getByLabel('Подтверждаю право использовать референс.').check();
 await page.route(`**/api/projects/${fixture.projectId}/references`,route=>route.request().method()==='POST'?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'UI_REVIEW_FIELD_ERROR',message:'Проверка: исправьте ссылку'}})}):route.continue());
 await page.getByRole('button',{name:'Сохранить идею'}).focus();await page.keyboard.press('Enter');
 await page.getByRole('alert').filter({hasText:'Проверка: исправьте ссылку'}).waitFor();
 check('reference field error retains draft and receives focus',(await page.getByLabel('Что понравилось').inputValue())===notes&&await page.getByRole('alert').filter({hasText:'Проверка: исправьте ссылку'}).evaluate(el=>el===document.activeElement),{errorSource:'intercepted typed 422; no server mutation'});
 await page.unroute(`**/api/projects/${fixture.projectId}/references`);
 await page.getByRole('tab',{name:'05 Смета'}).click();
 const budgetList=await page.evaluate(async id=>(await(await fetch(`/api/projects/${id}/budgets`)).json()).data.items,fixture.projectId);
 if(budgetList.length){
  const latest=budgetList[0];
  await page.waitForFunction(expected=>Array.from(document.querySelectorAll('input')).some(x=>x.value===expected),latest.reservePct);
  check('saved budget reserve and limit restored',(await page.getByLabel('Резерв, %',{exact:true}).inputValue())===latest.reservePct&&(await page.getByLabel('Лимит ремонта, ₽',{exact:true}).inputValue())===(latest.limitMinor===null?'':String(latest.limitMinor/100)));
 }
 await page.getByLabel('Причина пересчёта').fill('Черновик при ошибке');
 await page.route(`**/api/projects/${fixture.projectId}/budgets`,route=>route.request().method()==='POST'?route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'UI_REVIEW_FIELD_ERROR',message:'Проверка: исправьте расход'}})}):route.continue());
 await page.getByRole('button',{name:'Рассчитать и сохранить смету'}).focus();await page.keyboard.press('Enter');
 await page.getByRole('alert').filter({hasText:'Проверка: исправьте расход'}).waitFor();
 check('budget error retains draft and receives focus',(await page.getByLabel('Причина пересчёта').inputValue())==='Черновик при ошибке'&&await page.getByRole('alert').filter({hasText:'Проверка: исправьте расход'}).evaluate(el=>el===document.activeElement),{errorSource:'intercepted typed 422; no server mutation'});
 await context.close();
 const fallback=await authenticatedContext({width:390,height:844},true);
 await fallback.page.getByRole('tab',{name:'03 Дизайн'}).click();
 await fallback.page.getByText('3D недоступно. Используйте план и подтверждённые размеры.').waitFor();
 const plans=await fallback.page.getByRole('img',{name:/План .* метров/}).count();
 check('WebGL initialization failure keeps plan and save available',plans>0&&await fallback.page.getByRole('button',{name:'Сохранить вариант'}).isEnabled(),{planCount:plans,scope:'forced initialization failure; manual shell'});
 await fallback.page.screenshot({path:path.join(root,`webgl-fallback-390-${attempt}.png`),fullPage:true});
 await fallback.context.close();
 if(fixture.glbProjectId){
  const glb=await authenticatedContext({width:390,height:844});
  await glb.page.goto(`${origin}/dashboard/${fixture.glbProjectId}`);
  await glb.page.getByLabel('Точка A',{exact:true}).waitFor();
  const saved=await glb.page.evaluate(async id=>{const p=(await(await fetch(`/api/projects/${id}`)).json()).data;const s=(await(await fetch(`/api/projects/${id}/shells`)).json()).data.items;return s.find(x=>x.id===p.currentShellId);},fixture.glbProjectId);
  check('saved GLB calibration restored on reload',saved.mode==='glb'&&(await glb.page.getByLabel('Точка A',{exact:true}).inputValue())===saved.calibration.anchors[0].a.join(',')&&(await glb.page.getByLabel('Измеренное расстояние, м',{exact:true}).inputValue())===saved.calibration.anchors[0].measuredM&&(await glb.page.locator('select[name=asset]').inputValue())===saved.sourceAssetId);
  await glb.context.close();
 }
}catch(error){await browser.contexts()[0]?.pages()[0]?.screenshot({path:path.join(root,`failure-${attempt}.png`),fullPage:true}).catch(()=>{});check('probe execution',false,{error:String(error).replaceAll(fixture.password??fixture.owner?.password??'__missing__','[redacted]').replace(/https?:\/\/[^\s]+/g,'[url]')});process.exitCode=1;}
finally{await browser.close();await fs.writeFile(path.join(root,`browser-results-${attempt}.json`),JSON.stringify({finishedAt:new Date().toISOString(),build:fixture.buildRevision??null,results},null,2)+'\n');if(results.some(r=>!r.pass))process.exitCode=1;}
