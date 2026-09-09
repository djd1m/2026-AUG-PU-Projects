import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { open,until,fill,click,js,wd,screenshot,noOverflow,element } from '../helpers/browser.mjs';

const control='http://127.0.0.1:13144',evidence=new URL('../../.runtime/referral-e2e/',import.meta.url).pathname;
const context=await (await fetch(control+'/context')).json();
async function login(email,origin=context.origins[0]) {
  await open(origin+'/account');await wd('/cookie',undefined,'DELETE');await wd('/refresh',{});
  await until('return !!document.querySelector("#auth") && !document.querySelector("#auth").hidden');
  await fill('#email',email);await fill('#password',context.password);await click('#login button[type=submit]');
  await until('return !document.querySelector("#workspace").hidden');
}
async function merchantSignup() {
  await fill('input[name=email]',`${randomUUID()}@example.test`);await click('#signup');
  await until('return !!document.querySelector("#mail-code")');
  await fill('input[name=code]',await js('return document.querySelector("#mail-code").textContent'));
  await click('#verify');await until('return !!document.querySelector("#checkout")');
}

test('separate merchant UI: real redirect and first-party receipt through verified signup, authoritative checkout and provider-verified commission',async()=>{
  await login(context.partnerEmail);
  await js('const s=document.querySelector("#membership");s.value=arguments[0];s.dispatchEvent(new Event("change",{bubbles:true}))',context.partnerMembershipId);
  await until('return !document.querySelector("#participant").hidden && document.querySelector("#share").textContent.length>10');
  await noOverflow();await screenshot(evidence,'partner-before');
  // Actual navigation through N3 redirect; no replacement of the browser tracker.
  await open(context.origins[0]+'/r/'+context.partnerId);
  await until('return location.origin==="https://merchant.example" && !!document.querySelector("#signup") && !location.search.includes("n3_ref")');
  const first=await js('return document.cookie');assert.match(first,new RegExp(`n3_ref_${context.tenantId}=`));
  await open(context.origins[0]+'/r/'+context.partnerId);
  await until('return !!document.querySelector("#signup") && !location.search.includes("n3_ref")');
  assert.equal(await js('return document.cookie'),first,'Second referral does not overwrite first touch');
  await merchantSignup();
  let metrics=(await (await fetch(control+'/metrics')).json()).metrics;
  assert.equal(metrics.visits,2);assert.equal(metrics.registrations,1);assert.equal(metrics.testPayingCustomers,0);
  await click('#checkout');await until('return !!document.querySelector("#pay")');
  assert.equal((await (await fetch(control+'/metrics')).json()).metrics.firstCommissionAt,null);
  await click('#pay');await until('return document.querySelector("#fulfillment")?.dataset.confirmed==="true"');
  await noOverflow();await screenshot(evidence,'merchant-confirmed');
  metrics=(await (await fetch(control+'/metrics')).json()).metrics;
  assert.equal(metrics.testPayingCustomers,1);assert.equal(metrics.payingCustomers,0);assert.ok(metrics.firstCommissionAt);assert.equal(metrics.firstLiveCommissionAt,null);
  await fetch(control+'/refund',{method:'POST'});await wd('/refresh',{});
  await until('return document.querySelector("#fulfillment")?.dataset.confirmed==="false"');
  assert.equal((await (await fetch(control+'/metrics')).json()).metrics.firstCommissionAt,metrics.firstCommissionAt);
  await screenshot(evidence,'merchant-refunded');
});

test('owner referral panel works on all A–D origins at desktop and mobile, key response cannot reappear after logout',async()=>{
  const checks=[];
  for(const origin of context.origins) {
    await login(context.ownerEmail,origin);
    await until('return document.querySelector("#referral-funnel").textContent.includes("Воронка рекомендаций")');
    assert.match(await js('return document.querySelector("#referral-funnel").textContent'),/Платящие клиенты · тестовый магазин/);
    await noOverflow();checks.push({origin,width:1440});
    await open(origin+'/mobile.html');await js('document.querySelector("#mobile-frame").src="/account"');
    await wd('/frame',{id:await element('#mobile-frame')});
    await until('return location.pathname==="/account" && document.querySelector("#referral-funnel")?.textContent.includes("Воронка рекомендаций")');
    assert.equal(await js('return innerWidth'),390);await noOverflow();checks.push({origin,width:390});
    await screenshot(evidence,`owner-${new URL(origin).hostname.slice(3,4)}-mobile`);
    const panel=await element('#referral-funnel');
    await writeFile(evidence+`funnel-${new URL(origin).hostname.slice(3,4)}-mobile.png`,Buffer.from(await wd(`/element/${Object.values(panel)[0]}/screenshot`),'base64'));
  }
  await login(context.ownerEmail);
  await js(`window.__originalFetch=window.fetch;window.__held=false;window.fetch=async(...args)=>{
    const response=await window.__originalFetch(...args);if(String(args[0]).endsWith('/api/account/referral-key')){
      window.__held=true;return new Promise(resolve=>{window.__release=()=>resolve(response)});}return response;};`);
  await click('[data-referral-action=issue]');await until('return window.__held');await click('#logout');
  await until('return !document.querySelector("#auth").hidden');
  await js('window.fetch=window.__originalFetch;window.__release();return new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(await js('return document.querySelector(arguments[0]).value','textarea[aria-label="Одноразовый ключ интеграции"]'),'');
  await writeFile(evidence+'summary.json',JSON.stringify({at:new Date().toISOString(),checks,provider:'isolated API stub',providerLive:false,
    checksPassed:['actual-redirect','first-party-first-touch','merchant-verified-signup','server-invoice','verified-webhook','test-live-separation','refund-fulfillment','A-D-desktop-mobile','no-overflow','late-key-after-logout']},null,2));
});
