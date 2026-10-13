// Local file fixtures only; connect to the existing shared browser.
const {chromium}=require('/opt/browser/node_modules/playwright');
const fs=require('fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.connect('ws://127.0.0.1:9320/');
 const results=[];let context;
 try {
  for(const width of [1440,390])for(const variant of ['a','b','c']){
   context=await browser.newContext({viewport:{width,height:1000}});
   const page=await context.newPage();const errors=[];const network=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route(/^https?:/,route=>{network.push(route.request().url());route.abort()});
   const checks=[];
   async function checkScreen(name){
    assert.equal(await page.locator('#'+name).isVisible(),true);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,variant+'/'+width+'/'+name+' overflow');checks.push(name);
   }
   await page.goto(`file:///opt/browser/n8-cjm-sol-1/variant-${variant}.html`);
   await checkScreen('landing');
   if(width===1440)await page.screenshot({path:`/opt/browser/n8-cjm-sol-1/${variant}-desktop.png`,fullPage:true});
   await page.locator('#landing [data-go="upload"]').click();await checkScreen('upload');
   assert.equal(await page.locator('#uploadNext').isDisabled(),true);
   await page.locator('#file').setInputFiles({name:'<img src=x onerror=alert(1)>.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==','base64')});
   assert.match(await page.locator('#uploadStatus').textContent(),/<img src=x/);
   assert.equal(await page.locator('#uploadStatus img').count(),0);
   await page.locator('#demoRoom').focus();await page.keyboard.press('Enter');
   await page.locator('#uploadNext').click();await checkScreen('style');
   assert.equal(await page.locator('#start').isDisabled(),true);
   await page.locator('.stylechoice').first().focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('.stylechoice').first().getAttribute('aria-pressed'),'true');
   await page.locator('#start').click();await checkScreen('queue');
   await page.locator('#reject').click();assert.match(await page.locator('#queueStatus').textContent(),/quality rejection/);
   assert.equal(await page.evaluate(()=>roomkindDemo.state.hasResult),false);
   await page.locator('#resolve').click();await checkScreen('result');
   await page.locator('#compareRange').focus();await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('#compareRange').inputValue(),'51');
   assert.equal(await page.locator('#comparison').evaluate(el=>el.style.getPropertyValue('--split')),'51%');
   if(width===390&&variant==='a')await page.screenshot({path:'/opt/browser/n8-cjm-sol-1/a-mobile-result.png',fullPage:true});
   assert.equal(await page.evaluate(()=>roomkindDemo.events.some(e=>e.event==='demo-share-completed')),false);
   await page.locator('#share').click();
   assert.equal(await page.evaluate(()=>roomkindDemo.state.shared),false);
   await page.locator('#shareConfirm').click();assert.equal(await page.evaluate(()=>roomkindDemo.state.shared),true);
   await page.locator('#download').click();assert.match(await page.locator('#resultStatus').textContent(),/не скачивается/);
   await page.locator('[data-go="gallery"]').first().click();await checkScreen('gallery');
   assert.equal(await page.locator('#publicConsent').isChecked(),false);
   assert.equal(await page.locator('#publish').isDisabled(),true);
   await page.locator('#publicConsent').focus();await page.keyboard.press('Space');
   await page.locator('#publish').click();assert.equal(await page.evaluate(()=>roomkindDemo.state.published),true);
   await page.locator('#revoke').click();assert.equal(await page.locator('#publicConsent').isChecked(),false);
   assert.equal(await page.locator('#publish').isDisabled(),true);
   assert.equal(await page.evaluate(()=>roomkindDemo.state.published),false);
   await page.locator('[data-go="paywall"]').click();await checkScreen('paywall');
   await page.locator('#promo').fill('<script>alert(1)</script>');await page.locator('#promo').blur();
   await page.locator('#checkout').click();assert.match(await page.locator('#paymentStatus').textContent(),/не начислены/);
   assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(network.length,0,JSON.stringify(network));
   results.push({variant,width,status:'pass',screens:checks,keyboard:true,localPreviewXssSafe:true,compare:true,shareSeparate:true,uncheckedOptIn:true,revoke:true,qualityError:true,paymentFixture:true,pageErrors:errors,remoteRequests:network});
   await context.close();context=null;
  }
  context=await browser.newContext({viewport:{width:390,height:900}});const index=await context.newPage();await index.goto('file:///opt/browser/n8-cjm-sol-1/index.html');
  assert.equal(await index.locator('a.button').count(),3);
  assert.equal(await index.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  for(const variant of ['a','b','c'])assert.equal(await index.locator(`a[href="variant-${variant}.html"]`).count(),1);
  fs.writeFileSync('/opt/browser/n8-cjm-sol-1/e2e-result.json',JSON.stringify({status:'pass',environment:'existing codex-ui-playwright / Playwright 1.63.0 / native Playwright WS',results,index:'3 local links; mobile no overflow',limitations:'Static UI fixture only; no GPU, geometry, production uploads, public links, attribution, real share or payment.'},null,2));
  console.log(JSON.stringify({status:'pass',journeys:results.length,screens:results.reduce((s,r)=>s+r.screens.length,0),index:'pass'}));
 } catch(e) {fs.writeFileSync('/opt/browser/n8-cjm-sol-1/e2e-result.json',JSON.stringify({status:'failed',error:e.message,stack:e.stack,results},null,2));throw e}
 finally {if(context)await context.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
