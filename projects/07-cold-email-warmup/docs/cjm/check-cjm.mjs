/** Standalone prototype checks. Run static: node check-cjm.mjs --static.
 * Run browser in existing container: node check-cjm.mjs --output /tmp/unique-evidence.
 * No server, package install, real sending, connection or payment is performed. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=['cohort-desk.html','partner-studio.html','operator-review.html'];
const outputArg=process.argv.indexOf('--output');
const output=outputArg>=0?path.resolve(process.argv[outputArg+1]):null;
const results=[];
function log(check,detail){results.push({check,status:'pass',detail});console.log('PASS '+check+' '+detail)}
const sources=[];
assert.equal((await fs.readdir(root)).filter(f=>f.endsWith('.html')).length,3);
for(const file of files){
 const html=await fs.readFile(path.join(root,file),'utf8');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'Duplicate IDs');
 assert.ok(html.split('\n').length<500,'Under 500 lines');
 for(const match of html.matchAll(/\bfor="([^"]+)"/g))assert.ok(ids.includes(match[1]),'Valid label reference');
 for(const match of html.matchAll(/\bhref="([^"]+)"/g)){
  const href=match[1];
  if(href.startsWith('#'))assert.ok(ids.includes(href.slice(1)),'Valid fragment');
  else if(!href.startsWith('https://'))assert.ok(files.includes(href),'Valid local navigation');
 }
 assert.ok(!/<(?:script|link|img)\b[^>]*(?:src|href)=/i.test(html),'No external dependency');
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
 const sha256=createHash('sha256').update(html).digest('hex');
 sources.push({file,sha256,html});log('static',`${file}: ${ids.length} unique IDs, labels/links/dependencies/syntax valid, SHA256=${sha256}`);
}
if(process.argv.includes('--static'))process.exit(0);
assert.ok(output,'Browser checks require explicit --output');await fs.mkdir(output,{recursive:true});
const {chromium}=await import('/opt/browser/node_modules/playwright/index.mjs');
const browser=await chromium.connect('ws://127.0.0.1:9320/');
const ensure=async(condition,message)=>assert.ok(await condition(),message);
async function stage(page,n){await page.locator(`[data-step="${n}"]`).click()}
async function ready(page){
 await page.locator('#reset').click();await page.locator('#connect-form button').click();
 await page.locator('#warmup-consent').check();await page.locator('#campaign-consent').check();
 await stage(page,2);await page.locator('#seed').click();
 await stage(page,4);await page.locator('#suppression-confirm').check();await stage(page,5);
 await ensure(()=>page.locator('#launch').isEnabled(),'Launch enabled only after gates');
}
async function overflow(page,label){
 const sizes=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(sizes.scroll<=sizes.viewport+1,`${label}: no horizontal overflow (${JSON.stringify(sizes)})`);
}
let mutationDetected=false;
try{
 for(const source of sources){for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>route.abort());const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.setContent(source.html,{waitUntil:'domcontentloaded'});
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip','Keyboard reaches skip link');await page.keyboard.press('Enter');
  await overflow(page,'initial');await page.screenshot({path:path.join(output,source.file.replace('.html',`-${width}-onboarding.png`)),fullPage:true});
  for(let n=0;n<6;n++){await stage(page,n);await overflow(page,'stage '+n)}
  await ensure(()=>page.locator('#launch').isDisabled(),'No launch without consent');
  await stage(page,0);await page.locator('#email').fill('invalid');await page.locator('#connect-form button').click();
  assert.equal(await page.locator('#connection-state').textContent(),'Не подключён','Invalid email blocked');
  await page.locator('#email').fill('anna@studio.example');await page.locator('#connect-form button').click();
  await page.locator('#warmup-consent').check();await stage(page,2);await page.locator('#seed').click();
  await stage(page,5);await ensure(()=>page.locator('#launch').isDisabled(),'Warmup does not authorize campaign');
  await stage(page,1);await page.locator('#campaign-consent').check();await stage(page,5);
  await ensure(()=>page.locator('#launch').isDisabled(),'Stop-list confirmation required');
  await stage(page,3);await page.locator('#name').fill('<img src=x>');
  assert.equal(await page.locator('img').count(),0,'Preview escapes personalization');assert.ok((await page.locator('#mail-body').textContent()).includes('<img src=x>'));
  await stage(page,4);await page.locator('#suppression-confirm').check();await page.locator('#daily').fill('1');
  await stage(page,1);await page.locator('#warmup-consent').check();await page.locator('#campaign-consent').check();await stage(page,5);
  await ensure(()=>page.locator('#launch').isDisabled(),'Limits reject sum above ceiling');
  await stage(page,4);await page.locator('#daily').fill('20');await stage(page,1);
  await ensure(()=>page.locator('#warmup-consent').isChecked().then(x=>!x),'Changed limits revoke prior consent');
  await page.locator('#warmup-consent').check();await page.locator('#campaign-consent').check();await stage(page,5);await page.locator('#launch').click();
  await stage(page,1);await page.locator('#warmup-consent').uncheck();await stage(page,5);
  await ensure(()=>page.locator('#reply').isDisabled(),'Revoking consent pauses scenario');
  await stage(page,1);await page.locator('#warmup-consent').check();await stage(page,5);await page.locator('#launch').click();await page.locator('#reply').click();
  assert.ok((await page.locator('#run-state').textContent()).includes('получен ответ'),'Reply stops sequence');assert.ok((await page.locator('#gate-reason').textContent()).includes('Получен ответ: дальнейшие шаги отменены'),'Gate explains actual stop reason');
  await ensure(()=>page.locator('#launch').isDisabled(),'Reply prevents restart');
  await page.locator('summary').filter({hasText:'Поделиться результатом'}).click();
  await ensure(()=>page.locator('#share').isDisabled(),'Share requires separate permission');
  await page.locator('#invite-consent').check();await page.locator('#share').click();assert.ok((await page.locator('#share-result').textContent()).includes('не отправлялся'));
  await page.locator('#invite-consent').uncheck();assert.equal(await page.locator('#share-result').textContent(),'','Invitation cleared when consent withdrawn');
  await page.locator('#billing summary').click();await overflow(page,'billing');
  await page.screenshot({path:path.join(output,source.file.replace('.html',`-${width}-reply-billing.png`)),fullPage:true});
  await ready(page);await page.locator('#launch').click();await page.locator('#complaint').click();
  assert.ok((await page.locator('#run-state').textContent()).includes('оба контекста'),'Complaint stops both contexts');await ensure(()=>page.locator('#launch').isDisabled(),'Complaint blocks launch');
  await ready(page);await page.locator('#launch').click();await stage(page,3);await page.locator('#unsubscribe').click();await stage(page,5);
  await ensure(()=>page.locator('#launch').isDisabled(),'Suppressed recipient cannot launch');assert.ok((await page.locator('#run-state').textContent()).includes('отписка'));
  assert.deepEqual(errors,[],'No browser runtime errors');
  const smallTargets=await page.locator('button:not([disabled]),summary,input,select').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().width>0).filter(e=>{const r=e.getBoundingClientRect();return r.width<24||r.height<24}).map(e=>e.id||e.tagName));
  assert.deepEqual(smallTargets.filter(id=>!['warmup-consent','campaign-consent','suppression-confirm','invite-consent'].includes(id)),[],'Visible targets >=24px; checkbox targets are enclosing labels');
  log('browser',`${source.file} ${width}px: keyboard, consent boundaries, input/limits, escaped preview, reply/complaint/suppression, billing, no overflow/errors`);
  await context.close();
 }}
 // Mutation guard: remove consent/limits gate. The same initial disabled assertion must fail.
 const ctx=await browser.newContext();const page=await ctx.newPage();
 const mutant=sources[0].html.replace("$('launch').disabled=missing.length>0||state.running;","$('launch').disabled=false;");
 assert.notEqual(mutant,sources[0].html,'Mutation applied');await page.setContent(mutant);await stage(page,5);
 try{assert.equal(await page.locator('#launch').isDisabled(),true,'Launch gate mutation must be caught')}catch{mutationDetected=true}
 assert.equal(mutationDetected,true,'Gate guard catches mutation');log('mutation','Consent/limit gate bypass was detected by launch-disabled assertion');await ctx.close();
}finally{
 await browser.close();
 await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({finished_at:new Date().toISOString(),browser:'Chromium via existing Playwright 1.63.0 server',viewport_widths:[1440,390],sources:sources.map(({file,sha256})=>({file,sha256})),results,mutationDetected},null,2)+'\n');
}
