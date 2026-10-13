// Separate normal-server restart with PROVIDER_MODE=disabled is required.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
if(!/^1\.63\./.test(require('/opt/n8-browser-client/node_modules/playwright/package.json').version)||!/^1\.63\./.test(require('/opt/n8-browser-client/node_modules/playwright-core/package.json').version))throw new Error('existing_playwright_1_63_clients_required');
const {chromium}=require('/opt/n8-browser-client/node_modules/playwright');
if(process.env.NODE_ENV!=='test'||process.env.PROVIDER_MODE!=='disabled'||process.env.APP_ORIGIN!=='https://n8-ui.test'||process.env.UI_SHARED_BROWSER_CONTAINER!=='codex-ui-playwright')throw new Error('owned_disabled_stack_required');
const preflight=JSON.parse(await readFile(process.env.UI_PREFLIGHT,'utf8'));
if(preflight.status!=='ready'||!preflight.source_revision||!preflight.build_revision)throw new Error('fresh_disabled_stack_preflight_required');
const browser=await chromium.connect('ws://codex-ui-playwright:9320/'),results=[];
try {
  for(const width of [1440,390]) {
    const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:844}});
    try {
      const page=await context.newPage();await page.goto(process.env.APP_ORIGIN);
      const email=`disabled-${crypto.randomUUID()}@example.test`;
      await page.locator('#email').fill(email);await page.locator('#password').fill(crypto.randomUUID()+crypto.randomUUID());
      await page.locator('button[value=register]').click();
      await page.waitForFunction(()=>document.querySelector('#payment-mode').textContent.includes('провайдер отключён'));
      assert.equal(await page.locator('#buy').isDisabled(),true);
      const config=await page.evaluate(async()=>await (await fetch('/api/payments/config')).json());assert.equal(config.provider_mode,'disabled');
      const denied=await page.evaluate(async()=>{const r=await fetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package:'ROOM20',idempotency_key:crypto.randomUUID()})});return {status:r.status,body:await r.json()};});
      assert.equal(denied.status,503);assert.equal(denied.body.error,'payments_unavailable');results.push({width,result:'pass'});
    }finally{await context.close();}
  }
  await writeFile(process.env.UI_DISABLED_OUTPUT,JSON.stringify({source:preflight.source_revision,build:preflight.build_revision,results,actual_disabled_server:true},null,2),{flag:'wx'});
}finally{await browser.close();}
