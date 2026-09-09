import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { open,until,fill,click,js,wd,element,screenshot,noOverflow } from '../helpers/browser.mjs';

const directory=new URL('../../.runtime/access-e2e/',import.meta.url).pathname;
const control=async(path,post=false)=>{const r=await fetch(`http://127.0.0.1:13146${path}`,{method:post?'POST':'GET'});assert.equal(r.status,200);return r.json();};
const context=await control('/context'),password=context.password;
const proof=async(email,purpose,origin)=>{const r=await control(`/proof?${new URLSearchParams({email,purpose,origin})}`);assert.ok(r.link);return r.link;};
async function login(email,pass=password) {await fill('#login-email',email);await fill('#login-password',pass);await click('#login button');await until('return !document.querySelector("#workspace").hidden');}
async function logout() {await click('#logout');await until('return !document.querySelector("#auth").hidden');}
async function complete(link,pass=password) {
  await open(link);await until('return !document.querySelector("#access-completion").hidden');
  assert.equal(await js('return location.hash'),'');
  if(await js('return document.querySelector("#completion-password").required'))await fill('#completion-password',pass);
  await click('#completion-submit');await until('return document.querySelector("#access-completion").hidden');
}
async function provider(external,email) {
  await until('return location.hostname === "oauth.yandex.ru" && !!document.querySelector("#provider-accept")');
  await fill('#provider-id',external);await fill('#provider-email',email);await click('#provider-accept');
  await until('return location.pathname==="/account" && !document.querySelector("#workspace").hidden');
}
async function mobileAccount(origin,name) {
  await open(origin+'/mobile.html');await js('document.querySelector("#mobile-frame").src="/account"');
  await wd('/frame',{id:await element('#mobile-frame')});await until('return location.pathname==="/account" && !document.querySelector("#workspace").hidden');
  assert.equal(await js('return innerWidth'),390);await noOverflow();await screenshot(directory,name);await wd('/frame',{id:null});
}
let ownerEmail,ownerPassword=password;
test('four-origin browser registration requires explicit proof and shared login security works on desktop and mobile',async()=>{
  await mkdir(directory,{recursive:true});const evidence=[];
  for(const [index,origin] of context.origins.entries()) {
    const email=`browser-${randomUUID()}@example.test`;if(index===0)ownerEmail=email;
    await open(origin+'/account');await until('return !document.querySelector("#register-submit").disabled');
    await fill('#register-email',email);await fill('#register-name',`Browser variant ${index+1}`);
    const before=await control('/facts');await click('#register-submit');await until('return document.querySelector("#notice").textContent.includes("Запрос принят")');
    assert.equal((await control('/facts')).accounts,before.accounts);
    const link=await proof(email,'register',origin);await open(link);await until('return !document.querySelector("#access-completion").hidden');
    assert.equal(await js('return location.hash'),'');assert.equal((await control('/facts')).accounts,before.accounts);
    await fill('#completion-password',password);await click('#completion-submit');await until('return document.querySelector("#notice").textContent.includes("Аккаунт создан")');
    assert.equal(await js('return document.querySelector("#workspace").hidden'),true);
    await login(email);await until('return !document.querySelector("#business").hidden');await noOverflow();
    assert.ok((await js('return document.querySelector("#identity").textContent')).includes('почта подтверждена'));
    await screenshot(directory,`variant-${index+1}-desktop`);await mobileAccount(origin,`variant-${index+1}-mobile`);
    await open(origin+'/account');await until('return !document.querySelector("#workspace").hidden');await logout();evidence.push({origin,registered:true,explicitProof:true,desktop:1440,mobile:390});
  }
  await writeFile(directory+'four-origin.json',JSON.stringify({at:new Date().toISOString(),evidence,externalProviders:'isolated HTTP stubs'},null,2));
});
test('browser Yandex link recovery SSO contact legacy security gate and unconfigured providers',async()=>{
  // Real HTTP admission is intentionally unchanged; do not bypass its30/minute cap.
  console.log('Waiting for the existing authentication admission window before the next journey.');
  await new Promise(r=>setTimeout(r,61000));
  const origin=context.origins[0];await open(origin+'/account');await until('return !document.querySelector("#login").hidden');await login(ownerEmail);
  await fill('#yandex-link-password',password);await click('#yandex-link button');await provider('linked-browser-id','linked-browser@example.test');
  await until('return !document.querySelector("#yandex-unlink").hidden');
  await fill('#yandex-unlink-password',password);await click('#yandex-unlink button');await until('return !document.querySelector("#auth").hidden');
  await control('/advance',true);await fill('#forgot-email',ownerEmail);await click('#forgot-submit');await until('return document.querySelector("#notice").textContent.includes("Запрос принят")');
  const resetLink=await proof(ownerEmail,'reset',origin);ownerPassword='Changed browser credential 52!';await complete(resetLink,ownerPassword);
  await login(ownerEmail,ownerPassword);await logout();
  await complete(resetLink,ownerPassword).then(()=>assert.fail('Replay unexpectedly succeeded'),async()=>{
    assert.ok((await js('return document.querySelector("#notice").textContent')).includes('недействительна'));
  });
  await open(origin+'/account');await until('return !document.querySelector("#yandex-login").disabled');await click('#yandex-login');
  const ssoEmail=`sso-${randomUUID()}@example.test`;await provider(randomUUID(),ssoEmail);
  assert.equal(await js('return document.querySelector("#business").hidden'),true);assert.equal(await js('return document.querySelector("#verification-gate").hidden'),false);
  await click('#contact-request');await until('return document.querySelector("#notice").textContent.includes("Запрос принят")');
  await complete(await proof(ssoEmail,'contact',origin));await until('return !document.querySelector("#business").hidden');
  await screenshot(directory,'sso-contact-verified');await logout();
  await login(context.legacyEmail);assert.equal(await js('return document.querySelector("#business").hidden'),true);
  assert.ok((await js('return document.querySelector("#security-message").textContent')).includes('прежние сеансы'));
  await screenshot(directory,'legacy-security-gate');await logout();
  await control('/disabled',true);await open(origin+'/account');await until('return document.querySelector("#access-status").textContent.includes("не настроены")');
  assert.equal(await js('return document.querySelector("#register-submit").disabled && document.querySelector("#yandex-login").disabled'),true);
  await login(ownerEmail,ownerPassword);await until('return !document.querySelector("#business").hidden');
  await screenshot(directory,'unconfigured-existing-login');
  await writeFile(directory+'security.json',JSON.stringify({at:new Date().toISOString(),checks:['Yandex-code-PKCE-callback','explicit-link-unlink','reset-login','replay-refused','SSO-session-and-contact-proof','legacy-security-only','unconfigured-providers','existing-login-preserved'],liveProviders:false},null,2));
});
