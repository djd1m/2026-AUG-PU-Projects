import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {open,until,fill,click,js,wd,element,screenshot,noOverflow} from '../helpers/browser.mjs';
const origins=['a','b','c','d'].map(v=>`https://n3-${v}.212.192.0.33.sslip.io`);
const evidence=new URL('../../.runtime/f2-browser/',import.meta.url).pathname;
const password=`E2e-${randomUUID()}-!`,ownerEmail=`owner-${randomUUID()}@example.test`,partnerEmail=`partner-${randomUUID()}@example.test`;
async function register(email,name) {await fill('#email',email);await fill('#password',password);await fill('#name',name);await click('#register');await until('return !document.querySelector("#workspace").hidden && document.querySelector("#notice").textContent.includes("созданы")');}
async function logout() {await click('#logout');await until('return !document.querySelector("#auth").hidden');}
async function holdResponse(path,action) {
 await js(`window.__originalFetch=window.__originalFetch||window.fetch;window.__held=false;window.__release=null;
 const [path,action]=arguments;window.fetch=async(...args)=>{const response=await window.__originalFetch(...args);
 const body=args[1]?.body?JSON.parse(args[1].body):{};
 if(String(args[0]).endsWith(path)&&(!action||body.action===action)&&!window.__held){window.__held=true;return new Promise(resolve=>{window.__release=()=>resolve(response)});}return response;};`,path,action);
}
async function releaseResponse() {await js('window.fetch=window.__originalFetch;window.__release?.();return new Promise(resolve=>setTimeout(resolve,100))');}
async function login(email) {await fill('#email',email);await fill('#password',password);await click('#login button[type=submit]');await until('return document.querySelector("#notice").textContent.includes("Вход выполнен")');}

test('real account UI desktop/mobile signup login invite scopes agent transport and durable organization across A–D',async()=>{
 await mkdir(evidence,{recursive:true});await open(origins[0]+'/account');await until('return !!document.querySelector("#login")');
 await wd('/cookie',undefined,'DELETE');await wd('/refresh',{});await until('return !document.querySelector("#auth").hidden');
 await register(ownerEmail,'E2E real organization');await noOverflow();
 assert.ok((await js('return document.querySelector("#payment-status").textContent')).includes('не подключена'));
 await click('#policy button');await until('return document.querySelector("#notice").textContent.includes("опубликованы")');
 await fill('#referral-funnel input[name=landingUrl]','https://merchant.example/signup');
 await fill('#referral-funnel input[name=returnUrl]','https://merchant.example/complete');
 await click('[data-referral-action=save]');await until('return document.querySelector("#notice").textContent.includes("Адреса подключения сохранены")');
 await click('[data-referral-action=issue]');await until('return !document.querySelector("#referral-funnel textarea").hidden');
 assert.equal(await js('return /^[A-Za-z0-9_-]{43}$/.test(document.querySelector("#referral-funnel textarea").value)'),true);
 await click('[data-referral-action=revoke]');await until('return document.querySelector("#notice").textContent.includes("Ключ интеграции отозван")');
 assert.equal(await js('return document.querySelector("#referral-funnel textarea").value'),'');
 await fill('#registry input','2026-08');await click('#registry button');await until('return document.querySelector("#registries").textContent.includes("2026-08")');
 await click('#mint-agent');await until('return !document.querySelector("#agent-config").hidden');
 await click('#probe-agent');await until('return document.querySelector("#notice").textContent.includes("MCP") && !document.querySelector("#notice").classList.contains("error")');
 await click('#agent-list button');await until('return document.querySelector("#notice").textContent.includes("отозван")');
 await js('document.querySelector("#checkout").elements.customerId.value="prior-customer";document.querySelector("#checkout").elements.amount.value="123.45";document.querySelector("#policy").elements.percent.value="31"');
 await holdResponse('/api/account/agent-token');await click('#mint-agent');await until('return window.__held');await logout();await releaseResponse();
 assert.deepEqual(await js('return [document.querySelector("#checkout").elements.customerId.value,document.querySelector("#checkout").elements.amount.value,document.querySelector("#policy").elements.percent.value,document.querySelector("#registry").elements.period.value]'),['','','20','']);
 assert.equal(await js('return document.querySelector("#agent-config").value'), '');await login(ownerEmail);
 await holdResponse('/api/account/invite');await click('#invite button');await until('return window.__held');await logout();await releaseResponse();
 assert.equal(await js('return document.querySelector("#invitation-output").value'), '');await login(ownerEmail);
 await click('#invite button');await until('return !document.querySelector("#invitation-output").hidden');
 const invitation=await js('return document.querySelector("#invitation-output").value');
 await js('document.querySelector("#invitation-output").value="[скрыто тестом]";document.querySelector("#agent-config").value=""');
 await screenshot(evidence,'merchant-desktop');
 await logout();assert.equal(await js('return document.querySelector("#invitation-output").value'),'');await register(partnerEmail,'E2E participant');
 const invitationCode=invitation.includes('#')?new URLSearchParams(new URL(invitation).hash.slice(1)).get('invite'):invitation;
 await fill('#accept input[name=invitation]',invitationCode);await fill('#accept input[name=name]','E2E Partner');await click('#accept button');
 await until('return !document.querySelector("#participant").hidden');await click('#enroll');await until('return document.querySelector("#share").textContent.length>10');
 assert.equal(await js('return document.querySelector("#merchant").hidden'),true);await noOverflow();await screenshot(evidence,'partner-desktop');
 const selectRole=role=>js('const s=document.querySelector("#membership");s.value=[...s.options].find(o=>o.textContent.includes(arguments[0])).value;s.dispatchEvent(new Event("change",{bubbles:true}));',role);
 await selectRole('владелец');await until('return !document.querySelector("#merchant").hidden');
 await holdResponse('/api/account/command','dashboard');await click('#refresh');await until('return window.__held');
 await selectRole('партнёр');await until('return !document.querySelector("#participant").hidden');await releaseResponse();
 assert.equal(await js('return document.querySelector("#merchant").hidden'),true);assert.equal(await js('return document.querySelector("#notice").classList.contains("error")'),false);assert.equal(await js('return document.querySelector("#summary").textContent.includes("недоступна")'),false);

 await logout();await login(ownerEmail);await wd('/refresh',{});await until('return !document.querySelector("#workspace").hidden && document.querySelector("#registries").textContent.includes("2026-08")');
 const cross=[];
 for(const origin of origins) {
  await open(origin+'/account');await wd('/cookie',undefined,'DELETE');await wd('/refresh',{});await until('return !!document.querySelector("#auth")');
  await login(ownerEmail);
  await until('return document.querySelector("#identity").textContent.includes("E2E real organization")');await noOverflow();cross.push({origin,role:'merchant',persisted:true});
 }
 await open(origins[0]+'/mobile.html');await js('document.querySelector("#mobile-frame").src="/account"');await wd('/frame',{id:await element('#mobile-frame')});
 await until('return location.pathname==="/account" && document.querySelector("#identity")?.textContent.includes("E2E real organization")');
 assert.equal(await js('return innerWidth'),390);await noOverflow();await screenshot(evidence,'merchant-mobile');
 await writeFile(evidence+'summary.json',JSON.stringify({at:new Date().toISOString(),cross,desktop:1440,mobile:390,checks:['signup','login','logout','empty-real-tenant','policy','registry','invitation','partner-scope','enrollment','MCP-probe','agent-revoke','delayed-mint-after-logout','delayed-invite-after-logout','delayed-refresh-after-membership-switch','cross-host-persistence','no-horizontal-overflow'],providerLive:false},null,2));
});
