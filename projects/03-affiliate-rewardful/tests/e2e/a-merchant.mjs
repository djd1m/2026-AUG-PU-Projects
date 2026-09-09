import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wd, js, open, mobile, click, fill, until, screenshot, noOverflow } from '../helpers/browser.mjs';
import { fixtureSession } from '../helpers/http-session.mjs';

const base=process.env.N3_A_URL || 'http://127.0.0.1:13031';
const evidence=process.env.N3_EVIDENCE_DIR || '.runtime/e2e-a';
const $=id=>`[data-testid="${id}"]`;
const visible=id=>until(`return !!document.querySelector(${JSON.stringify($(id))})`);
const text=id=>js('return document.querySelector(arguments[0])?.textContent',$(id));
async function nav(id) { await click($('nav-'+id)); }
async function select(id,value) {
  await js('const e=document.querySelector(arguments[0]);e.value=arguments[1];e.dispatchEvent(new Event("change",{bubbles:true}));',$(id),value);
}
async function snapshot() {
  return js(`const session=JSON.parse(sessionStorage.getItem('n3.fixture.A'));
    return fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},
    body:JSON.stringify({action:'dashboard',actorId:session.actors.find(a=>a.role==='merchant').id,input:{}})}).then(r=>r.json()).then(r=>r.data);`);
}
async function fresh() {
  await open(base);
  await js("for(const key of Object.keys(sessionStorage))if(key.startsWith('n3.fixture.'))sessionStorage.removeItem(key)");
  await wd('/refresh',{});await visible('dashboard-summary');
}

test('A merchant actual browser journey', {timeout:180000}, async t=>{
  const startedAt=new Date().toISOString();const checks=[];
  await mkdir(evidence,{recursive:true});
  await fresh();
  await t.test('SC-US-101-2 missing rate cannot publish and field remains repairable',async()=>{
    const before=(await snapshot()).policies.length;
    await nav('program');await fill($('policy-rate'),'');await click($('policy-save'));
    await until('return !document.querySelector("#policy-errors").hidden');
    assert.equal((await snapshot()).policies.length,before);
  });
  await t.test('SC-US-101-1 saved policy is visible and survives reload',async()=>{
    await fill($('policy-rate'),'25');await click($('policy-save'));
    await until('return document.querySelector("#feedback").textContent.includes("Опубликована")');
    assert.equal((await snapshot()).policy.bps,2500);
    await wd('/refresh',{});await visible('dashboard-summary');await nav('program');
    assert.equal(await js('return document.querySelector("#policy-rate").value'),'25');
  });
  await t.test('SC-US-101-1 credit policy selection and reload keep independent settings and noncash terms',async()=>{
    await select('policy-kind','credit');await fill($('policy-rate'),'30');await click($('policy-save'));
    await until('return document.querySelector("#feedback").textContent.includes("Опубликована")');
    await wd('/refresh',{});await visible('dashboard-summary');await nav('program');
    assert.equal(await js('return document.querySelector("#policy-kind").value'),'credit');
    assert.equal(await js('return document.querySelector("#policy-rate").value'),'30');
    assert.match(await js('return document.querySelector(".preview-panel").textContent'),/Денежная выплата недоступна/);
    await select('policy-kind','cash');assert.equal(await js('return document.querySelector("#policy-rate").value'),'25');
  });
  await t.test('SC-US-102-1 confirmed fixture payment displays its rule and reward once',async()=>{
    await nav('dashboard');const before=await snapshot();
    await click($('fixture-payment'));
    await until('return document.querySelector("#feedback").textContent.includes("Оплата подтверждена")');
    const after=await snapshot();assert.equal(after.payments.length,before.payments.length+1);
    const payment=after.payments.find(p=>p.objectId===after.fixtureEvents.payment.objectId);
    assert.equal(payment.policyVersion,after.policy.version);assert.equal(payment.rewardMinor,25000);
    assert.match(await text('payment-history'),/additional-renewal/);
    await screenshot(evidence,'a-desktop-overview');checks.push(await noOverflow());
  });
  let reference;
  await t.test('SC-US-103-1 registry approval exports exact version with exclusions',async()=>{
    await nav('registry');await click($('registry-prepare'));await visible('artifact-id');
    const before=await snapshot();reference=before.registries.at(-1);
    assert.equal(reference.amountMinor,85000);assert.ok(reference.exclusions.length>=3);
    assert.match(await text('registry-exclusions'),/Бонус на подписку/);
    await click($('registry-approve'));await visible('registry-export');
    await js(`window.__n3Downloaded=null;const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{
      blob.text().then(text=>{window.__n3Downloaded=text});return original(blob)};`);
    await click($('registry-export'));await until('return typeof window.__n3Downloaded === "string"');
    const csv=await js('return window.__n3Downloaded');assert.ok(csv.includes(reference.hash));
    assert.ok(csv.includes('amount_minor'));assert.equal((await snapshot()).transfers.length,0);
    await screenshot(evidence,'a-desktop-registry');checks.push(await noOverflow());
  });
  await t.test('SC-US-102-2 refund and replay of same payment preserve correction and stale registry guard',async()=>{
    await nav('dashboard');await click($('fixture-refund'));
    await until('return document.querySelector("#feedback").textContent.includes("Возврат зарегистрирован")');
    const refunded=await snapshot(),amount=refunded.summary.adjustmentMinor;
    assert.equal(amount,-16250);
    await click($('fixture-replay'));await until('return document.querySelector("#feedback").textContent.includes("Повтор доставлен")');
    assert.equal((await snapshot()).summary.adjustmentMinor,amount);
    await nav('registry');await visible('registry-stale');
    assert.equal(await js('return !!document.querySelector("#registry-export")'),false);
    await click($('registry-recompute'));await visible('registry-approve');
    const current=(await snapshot()).registries.at(-1);
    assert.equal(current.artifactId,reference.artifactId);assert.equal(current.revision,reference.revision+1);
    assert.equal(current.amountMinor,78750);
    await click($('registry-approve'));await visible('registry-export');
  });
  await t.test('SC-US-103-2 manual send is separate and persists actor, date and evidence',async()=>{
    assert.equal((await snapshot()).transfers.length,0);
    const partner=await js('return [...document.querySelector("#sent-partner").options].find(o=>o.textContent.includes("Анна")).value');
    await select('sent-partner',partner);await fill($('sent-evidence'),'E2E synthetic transfer reference');
    await select('sent-date','2026-09-03');await click($('registry-sent'));await visible('transfer-facts');
    const state=await snapshot();assert.equal(state.transfers.length,1);
    assert.equal(state.transfers[0].actorId,state.actor.id);assert.equal(state.transfers[0].credited,false);
    assert.match(await text('transfer-facts'),/Не подтверждает зачисление/);
    await wd('/refresh',{});await visible('dashboard-summary');await nav('registry');await visible('transfer-facts');
    assert.equal((await snapshot()).transfers.length,1);
  });
  await t.test('SC-US-103-2 past transfer cannot mark a new revision obligation sent',async()=>{
    await nav('dashboard');await click('.lab-controls summary');await fill($('advance-days'),'7');await click($('fixture-advance'));
    await until('return document.querySelector("#feedback").textContent.includes("Демо-время обновлено")');
    await nav('registry');await visible('registry-recompute');await click($('registry-recompute'));await visible('registry-approve');
    await click($('registry-approve'));await visible('sent-partner');
    const state=await snapshot();const anna=state.partners.find(p=>p.name==='Анна');
    assert.ok(await js('return [...document.querySelector("#sent-partner").options].some(o=>o.value===arguments[0])',anna.id));
    const row=await js('return [...document.querySelectorAll("[data-testid=registry-rows] tbody tr")].find(r=>r.textContent.includes("Анна")).textContent');
    assert.doesNotMatch(row,/Отправлено/);assert.match(row,/Утверждён/);
    assert.equal(state.transfers.length,1);
  });
  await t.test('SC-US-104-1 invitation opens enrollment terms and never a referral link',async()=>{
    await nav('invite');const url=await js('return document.querySelector("#enrollment-link").value');
    assert.equal(new URL(url).pathname,'/join');assert.ok(!url.includes('/r/'));
    await click($('copy-enrollment'));await until('return document.querySelector("#feedback").textContent.includes("Скопировано")');
    await open(url);await visible('enrollment-preview');assert.match(await text('enrollment-preview'),/25%/);
    await open(base);await visible('dashboard-summary');
  });
  await t.test('A error recovery and mobile390 UI remain usable',async()=>{
    await nav('registry');await visible('registry-refresh');
    await js("window.__n3Fetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Нет связи с сервером'))");
    await click($('registry-refresh'));await until('return document.querySelector("#feedback").getAttribute("role")==="alert"');
    await js('window.fetch=window.__n3Fetch');await click($('registry-refresh'));
    await until('return document.querySelector("#feedback").textContent.includes("актуальная")');
    await mobile(base);await visible('dashboard-summary');checks.push(await noOverflow());
    await screenshot(evidence,'a-mobile-overview');await nav('registry');await visible('artifact-id');checks.push(await noOverflow());
    await screenshot(evidence,'a-mobile-registry');await nav('program');await visible('policy-form');checks.push(await noOverflow());
    await screenshot(evidence,'a-mobile-policy');
  });
  await t.test('SC-US-104-2 owner opens revised deterministic agent artifact in A',async()=>{
    // Only setup uses fixture HTTP task commands; the handoff and artifact display use the actual A UI.
    const {session,command}=await fixtureSession(base,'D');
    const grant=(await command('grant.create',{actions:['registry.prepare','registry.read'],expiresInSeconds:600})).data;
    const task=(await command('task.create',{kind:'registry',input:{period:'2026-08'}},{grantId:grant.grantId})).data;
    const first=(await command('task.run',{taskId:task.taskId},{grantId:grant.grantId})).data.result;
    const dashboard=(await command('dashboard')).data;await command('fixture.event',dashboard.fixtureEvents.refund);
    const next=(await command('task.create',{kind:'registry',input:{period:'2026-08',artifactId:first.artifactId}},{grantId:grant.grantId})).data;
    const revised=(await command('task.run',{taskId:next.taskId},{grantId:grant.grantId})).data.result;
    const url=new URL(base);url.hash=new URLSearchParams({handoff:Buffer.from(JSON.stringify({session,artifactId:revised.artifactId})).toString('base64')});
    await open(url.href);await visible('handoff-artifact');
    assert.equal(await text('artifact-id'),revised.artifactId);assert.equal(await text('artifact-hash'),revised.hash);
    assert.equal(revised.revision,2);assert.equal(await js('return location.hash'),'');
    await screenshot(evidence,'a-handoff');
  });
  await t.test('A navigation can be activated by keyboard',async()=>{
    await js('document.querySelector("[data-testid=nav-program]").focus()');
    await wd('/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\ue007'},{type:'keyUp',value:'\ue007'}]}]});
    await visible('policy-form');
  });
  await writeFile(join(evidence,'browser-summary.json'),JSON.stringify({variant:'A',startedAt,endedAt:new Date().toISOString(),
    checks,scope:'Actual Firefox A UI via Docker/PostgreSQL. D handoff setup uses fixture task HTTP; real D UI and protocol interoperability remain separate.',
    verdictSource:'Use Node test process exit and TAP result; this file records observations, not an independent pass verdict.'},null,2)+'\n');
});
