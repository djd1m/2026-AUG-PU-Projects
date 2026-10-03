// Run Node client inside the owned N8 app container; connect to existing shared browser.
// Actual app DOM/fetch. Native Web Share outcomes alone are test stubs.
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {ownedPool,fixtureConfig,drive} from './fixture-driver.js';
import {extendedCases,failureScreens,paceContext} from './browser-cases.js';
import {hostedCases} from './replicate-cases.js';
import {createPartners} from '../../web/partners.js';
const require=createRequire(import.meta.url);
if(!/^1\.63\./.test(require('/opt/n8-browser-client/node_modules/playwright/package.json').version)||!/^1\.63\./.test(require('/opt/n8-browser-client/node_modules/playwright-core/package.json').version))throw new Error('existing_playwright_1_63_clients_required');
const {chromium}=require('/opt/n8-browser-client/node_modules/playwright');
const origin=process.env.APP_ORIGIN,config=fixtureConfig();
if(process.env.UI_SHARED_BROWSER_CONTAINER!=='codex-ui-playwright')throw new Error('existing_shared_browser_container_required');
const preflight=JSON.parse(await readFile(process.env.UI_PREFLIGHT,'utf8'));
if(preflight.status!=='ready'||!preflight.source_revision||!preflight.build_revision)throw new Error('fresh_source_bound_companion_preflight_required');
const out=resolve(process.env.UI_OUTPUT??`/tmp/n8-ui-browser-${randomBytes(12).toString('hex')}`);
await mkdir(out,{recursive:false});
const pool=await ownedPool(),browser=await chromium.connect('ws://codex-ui-playwright:9320/');
const results=[],contexts=[],hostedEvidence=[];
async function check(name,work) {await work();results.push({name,result:'pass'});}
async function request(page,path,method='GET',body) {
  return page.evaluate(async({path,method,body})=>{
    const r=await fetch(path,{method,credentials:'same-origin',...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json()};
  },{path,method,body});
}
async function register(page,email,password) {
  await page.goto(origin);await page.locator('#auth').waitFor({state:'visible'});
  await page.locator('#email').fill(email);await page.locator('#password').fill(password);
  await page.locator('button[value=register]').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#package-details').textContent.includes('900'));
}
async function reserve(page) {
  const owner=(await request(page,'/api/me')).body.account.id;
  const previous=await page.evaluate(owner=>JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`))?.id,owner);
  const response=page.waitForResponse(r=>r.url()===origin+'/api/jobs'&&r.request().method()==='POST');
  await page.locator('#generate').click();assert.equal((await response).status(),202);
  await page.waitForFunction(({owner,previous})=>{const value=JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`));return value?.id&&value.id!==previous;},{owner,previous});
  return page.evaluate(owner=>JSON.parse(sessionStorage.getItem(`roomkind:job:${owner}`)).id,owner);
}
async function packagePurchase(page) {
  const owner=(await request(page,'/api/me')).body.account.id;
  const previous=await page.evaluate(owner=>JSON.parse(sessionStorage.getItem(`roomkind:payment:${owner}`))?.id,owner);
  const pending=page.waitForResponse(r=>r.url()===origin+'/api/payments'&&r.request().method()==='POST');
  await page.locator('#buy').click();assert.equal((await pending).status(),202);
  await page.waitForFunction(({owner,previous})=>{const value=JSON.parse(sessionStorage.getItem(`roomkind:payment:${owner}`));return value?.id&&value.id!==previous;},{owner,previous});
  const id=await page.evaluate(owner=>JSON.parse(sessionStorage.getItem(`roomkind:payment:${owner}`)).id,owner);
  await drive(pool,config,'payment',id);
  await page.locator('#payment-resume').click();await page.waitForFunction(()=>document.querySelector('#payment-status').textContent.includes('succeeded'));return id;
}

try {
  const run=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
  const second=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844}});contexts.push(second);
  await paceContext(second);const other=await second.newPage();await register(other,`other-${run}@example.test`,password);
  const otherAccount=(await request(other,'/api/me')).body.account;
  const partner=await createPartners(pool).create(otherAccount.id);
  for(const width of [1440,390]) {
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});contexts.push(context);
    await paceContext(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await register(page,`owner-${run}-${width}@example.test`,password);
    await check(`${width}: real browser POST attribution state`,async()=>{
      const state=await request(page,'/api/attribution/state','POST',{});assert.equal(state.status,200);assert.equal(state.body.tracking_opt_in,false);
      assert.equal(await page.locator('#tracking-consent').isChecked(),false);
      await page.locator('#partner-code').fill(partner.code);await page.locator('#manual-code').click();
      await page.waitForFunction(()=>document.querySelector('#attribution-status').textContent.includes('источник: code'));
      await page.locator('#tracking-consent').check();await page.locator('#accept-tracking').click();
      await page.waitForFunction(()=>document.querySelector('#attribution-status').textContent.includes('Tracking: разрешён'));
      await page.locator('#deny-tracking').click();await page.waitForFunction(()=>document.querySelector('#attribution-status').textContent.includes('Tracking: отклонён'));
      assert.equal((await request(page,'/api/me')).status,200);
    });
    await check(`${width}: fixture checkout verified server balance`,()=>packagePurchase(page));
    await page.locator('#file').setInputFiles(resolve(config.storageDir,'upload.png'));
    await page.locator('#upload-form button').click();await page.waitForFunction(()=>document.querySelector('#upload-choice').value.length>0);
    assert.equal(await page.locator('[data-style]').count(),4);
    await page.locator('[data-style=minimal]').click();await page.locator('[data-style=warm]').click();
    const id=await reserve(page);await page.waitForFunction(()=>document.querySelector('#job-status').textContent.includes('Ожидаем очередь'));
    await page.reload();await page.waitForFunction(()=>document.querySelector('#job-status').textContent.includes('Ожидаем очередь'));
    await drive(pool,config,'complete');await page.locator('#resume').click();await page.locator('#comparison').waitFor({state:'visible'});
    await check(`${width}: fixture label/publication denial/comparison keyboard`,async()=>{
      assert.match(await page.locator('#quality-label').innerText(),/DEMO/);assert.equal(await page.locator('#publish').isDisabled(),true);
      assert.notEqual(await page.locator('#before').getAttribute('alt'),await page.locator('#after').getAttribute('alt'));
      await page.locator('#split').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#split').inputValue(),'51');
      assert.match(await page.locator('#split-state').innerText(),/51%/);
      assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.body).fontSize)>=16&&document.documentElement.scrollWidth<=innerWidth),true);
      const outline=await page.locator('#split').evaluate(e=>getComputedStyle(e).outlineStyle);assert.notEqual(outline,'none');
    });
    await check(`${width}: real private gallery reopens selected result`,async()=>{
      await page.locator('#refresh').click();await page.locator('#jobs button').first().click();
      await page.locator('#comparison').waitFor({state:'visible'});assert.match(await page.locator('#after').getAttribute('src'),new RegExp(id));
      assert.ok(await page.locator('#jobs li').count()<=50);
    });
    for(const outcome of ['resolved','abort','error','unavailable']) {
      await page.evaluate(outcome=>{
        Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>outcome!=='unavailable'});
        Object.defineProperty(navigator,'share',{configurable:true,value:()=>outcome==='resolved'?Promise.resolve():Promise.reject(Object.assign(new Error('TEST ONLY'),{name:outcome==='abort'?'AbortError':'TypeError'}))});
      },outcome);
      await check(`${width}: injected WebShare ${outcome}, actual backend events`,async()=>{
        await page.locator('#prepare-share').click();await page.waitForFunction(()=>document.querySelector('#share-status').textContent.startsWith('Файл готов'));
        if(outcome!=='unavailable'){await page.locator('#native-share').click();await page.waitForFunction(()=>!document.querySelector('#native-share').offsetParent);}
        const events=(await pool.query('SELECT type FROM event WHERE reference=$1',[id])).rows;
        assert.equal(events.filter(e=>e.type==='share_completed').length,1);
        const download=page.waitForEvent('download');await page.locator('#download').click();await download;
      });
    }
    await check(`${width}: two-account media isolation`,async()=>{
      assert.equal((await request(other,`/api/jobs/${id}`)).status,404);
      const media=await other.evaluate(async id=>{const r=await fetch(`/api/jobs/${id}/result`);return r.status;},id);assert.equal(media,404);
    });
    // Accepted software seed is exclusively a positive publication authorization test.
    const publicId=await reserve(page);await drive(pool,config,'accepted-software');await page.locator('#resume').click();
    await page.waitForFunction(()=>!document.querySelector('#publish-consent').disabled);
    await check(`${width}: separate publication consent and revoke`,async()=>{
      assert.equal(await page.locator('#publish-consent').isChecked(),false);
      await page.locator('#publish-consent').check();await page.locator('#context').fill('Синтетическая комната · программный тест');
      await page.locator('#description').fill('Синтетический пример проверяет только программную публикацию, не качество геометрии.');
      await page.locator('#publish').click();await page.locator('#public-link').waitFor({state:'visible'});
      const link=await page.locator('#public-link').getAttribute('href');assert.equal((await context.request.get(origin+link)).status(),200);
      await page.locator('#revoke').click();await page.locator('#revoke').waitFor({state:'hidden'});assert.equal((await context.request.get(origin+link)).status(),404);
    });
    await page.screenshot({path:resolve(out,`result-${width}.png`),fullPage:true});
    const failed=await reserve(page);await drive(pool,config,'fail');await page.locator('#resume').click();await page.waitForFunction(()=>document.querySelector('#job-status').textContent.includes('Исходное фото сохранено'));
    assert.equal((await request(page,`/api/jobs/${failed}`)).body.job.status,'failed');
    await page.locator('#delete-job').click();await page.locator('#result').waitFor({state:'hidden'});
    assert.equal((await request(page,`/api/jobs/${publicId}`)).status,404); // deletion tombstones upload and all its jobs
    await extendedCases({page,context,pool,config,check,request,reserve,width,otherEmail:`other-${run}@example.test`,password,partnerCode:partner.code});
    await failureScreens({browser,pool,config,check,request,register,packagePurchase,width,password,run});
    hostedEvidence.push(...await hostedCases({browser,pool,config,check,request,register,packagePurchase,other,width,password,run,out}));
    await page.locator('#logout').click();await page.locator('#auth').waitFor({state:'visible'});
    assert.equal(await page.locator('#jobs img').count(),0);assert.equal(await page.locator('#before').getAttribute('src'),null);
    assert.deepEqual(errors,[]);
  }
  await writeFile(resolve(out,'results.json'),JSON.stringify({source:preflight.source_revision,build:preflight.build_revision,results,hosted_evidence:hostedEvidence,software_fixture:true,hosted_provider_metrics:null,native_outcomes:'injected API promises, not OS/social posting',geometry_pass:null},null,2));
  console.log(JSON.stringify({result:'pass',evidence:out,checks:results.length}));
}finally {for(const c of contexts)await c.close();await browser.close();await pool.end();}
