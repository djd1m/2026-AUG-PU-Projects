import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wd, js, open, mobile, click, fill, until, screenshot, noOverflow } from '../helpers/browser.mjs';
import { browserCommand, freshBrowserSession, limitedBrowserSession } from '../helpers/browser-session.mjs';

const base=process.env.N3_C_URL || 'http://127.0.0.1:13033';
const evidence=process.env.N3_EVIDENCE_DIR || '.runtime/e2e-c';
const $=id=>`[data-testid="${id}"]`;
const visible=id=>until(`return !!document.querySelector(${JSON.stringify($(id))})`);
const enabled=id=>until(`const e=document.querySelector(${JSON.stringify($(id))});return e && !e.disabled`);
const text=id=>js('return document.querySelector(arguments[0])?.textContent',$(id));
const nav=async id=>{await click($('nav-'+id));await until('return !document.querySelector("[data-testid=state-loading]")');};
const command=(action,input={},options={})=>browserCommand('C',options.role||'partner',action,input,options);
const snapshot=async()=>{const r=await command('partner.read');assert.equal(r.status,200);return r.data;};

test('C partner actual browser journey',{timeout:150000},async t=>{
  const startedAt=new Date().toISOString(),checks=[];await mkdir(evidence,{recursive:true});
  await freshBrowserSession(base,'C',$('program-terms'));
  await t.test('SC-US-301-1 complete terms and participation status precede consent',async()=>{
    for(const id of ['term-kind','term-rate','term-window','term-hold','term-version','term-effective','term-schedule'])assert.ok((await text(id))?.trim(),id);
    assert.match(await text('term-rate'),/20/);assert.match(await text('term-schedule'),/5/);
    assert.equal((await command('program.read')).data.enrollment,null);
    await click($('enrollment-submit'));assert.equal((await command('program.read')).data.enrollment,null);
    await screenshot(evidence,'c-terms');checks.push(await noOverflow());
  });
  let enrollment,share;
  await t.test('SC-US-302-1 explicit enrollment returns personal referral distinct from invitation',async()=>{
    await click($('enrollment-consent'));await click($('enrollment-submit'));await visible('share-kit');
    const p=(await command('program.read')).data;enrollment=p.enrollment;share=(await command('share.read')).data;
    assert.ok(enrollment);assert.notEqual(share.referralUrl,p.enrollmentUrl);
    assert.equal(await js('return document.querySelector("#share-url").value'),share.referralUrl);
    await click($('share-copy'));await until('return document.querySelector("#feedback").textContent.includes("Скопировано")');await screenshot(evidence,'c-share');
  });
  await t.test('SC-US-302-2 repeat enrollment returns same participant and attribution',async()=>{
    const before=await snapshot();await command('enrollment.join',{consent:true});await command('enrollment.join',{consent:true});
    assert.deepEqual((await command('program.read')).data.enrollment,enrollment);assert.deepEqual((await command('share.read')).data,share);
    assert.deepEqual((await snapshot()).payments,before.payments);
  });
  await t.test('SC-US-301-2 changed terms preserve historical commission policy',async()=>{
    await nav('history');await visible('commission-history');
    await js("window.__realFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Нет связи с лабораторией'))");
    await click($('open-operator-lab'));await visible('state-error');
    await js('window.fetch=window.__realFetch');await click($('retry'));await visible('open-operator-lab');
    await click($('open-operator-lab'));await visible('lab-policy-rate');
    await fill($('lab-policy-rate'),'35');await click($('lab-policy-save'));
    await until('return document.querySelector("#feedback").textContent.includes("опубликовал")');
    const state=await snapshot();assert.ok(state.payments.every(p=>p.policyVersion===1));
    assert.match(await text('commission-history'),/20/);
    await nav('terms');assert.match(await text('term-rate'),/35/);
    await wd('/refresh',{});await visible('partner-summary');
  });
  await t.test('SC-US-303-1 history is own scoped with hold corrections and payout schedule',async()=>{
    const state=await snapshot();assert.equal(state.actor.name,'Анна');
    assert.ok(state.ledger.every(e=>e.beneficiaryId===state.actor.id));assert.equal(state.summary.adjustmentMinor,-10000);
    await nav('history');await visible('commission-history');assert.match(await text('commission-history'),/возврат|корректиров/i);
    assert.match(await text('payout-history'),/5/);assert.doesNotMatch(await text('commission-history'),/Илья|Мария/);
    await screenshot(evidence,'c-history');checks.push(await noOverflow());
  });
  await t.test('SC-US-303-2 owner send displays date but never asserts bank credit',async()=>{
    if(await js('return !!document.querySelector("[data-testid=open-operator-lab]")'))await click($('open-operator-lab'));
    await enabled('lab-registry-prepare');await click($('lab-registry-prepare'));await enabled('lab-registry-approve');
    await click($('lab-registry-approve'));await enabled('lab-registry-sent');await click($('lab-registry-sent'));
    await until('return document.querySelector("#feedback").textContent.includes("отметил")');
    const state=await snapshot();assert.equal(state.transfers.length,1);assert.equal(state.transfers[0].credited,false);
    assert.match(await text('payout-history'),/сент|09|2026/);assert.match(await text('payout-history'),/не подтвержд|Не подтвержд|не заяв/);
    await wd('/refresh',{});await visible('partner-summary');await nav('history');await visible('payout-history');assert.equal((await snapshot()).transfers.length,1);
    await screenshot(evidence,'c-payout');
  });
  await t.test('SC-US-304-1 own read grant returns the UI source time and exact payout data',async()=>{
    await nav('overview');await visible('read-only-parity');
    const grant=(await command('grant.create',{actions:['partner.read'],expiresInSeconds:600})).data;
    const direct=await snapshot(),agent=(await command('partner.read',{}, {grantId:grant.grantId})).data;
    assert.deepEqual(agent,direct);assert.ok(agent.sourceVersion);assert.ok(agent.clock);
    assert.match(await text('read-only-parity'),/агент|grant|MCP/);
  });
  await t.test('SC-US-304-2 known foreign partner and merchant registry remain forbidden',async()=>{
    await nav('history');await visible('commission-history');
    const foreign=await js('const s=JSON.parse(sessionStorage.getItem("n3.fixture.C"));return s.actors.filter(a=>a.role==="partner")[1].id');
    const grant=(await command('grant.create',{actions:['partner.read'],expiresInSeconds:600})).data;
    assert.equal((await command('partner.read',{partnerId:foreign},{grantId:grant.grantId})).status,403);
    assert.equal((await command('dashboard')).status,403);assert.equal((await command('registry.read',{artifactId:'known-id'})).status,403);
    assert.doesNotMatch(await text('commission-history'),/Илья|Мария/);
  });
  await t.test('C recovery keyboard and mobile390 preserve the partner journey',async()=>{
    await nav('overview');await visible('refresh-partner');
    await js("window.__realFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Нет связи'))");
    await click($('refresh-partner'));await visible('state-error');
    await js('window.fetch=window.__realFetch');await click($('retry'));await visible('partner-summary');
    await js('document.querySelector("[data-testid=nav-terms]").focus()');
    await wd('/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\ue007'},{type:'keyUp',value:'\ue007'}]}]});await visible('program-terms');
    await mobile(base);await visible('partner-summary');checks.push(await noOverflow());await screenshot(evidence,'c-mobile-overview');
    await nav('history');await visible('commission-history');checks.push(await noOverflow());await screenshot(evidence,'c-mobile-history');
  });
  await t.test('C limited partner session opens own cabinet without merchant authority',async()=>{
    assert.equal((await limitedBrowserSession('C','partner')).actors,1);
    await open(base);await visible('program-terms');
    await nav('history');await visible('commission-history');assert.equal((await snapshot()).actor.role,'partner');
    assert.equal(await js('return !!document.querySelector("[data-testid=open-operator-lab]")'),false);
  });
  await writeFile(join(evidence,'browser-summary.json'),JSON.stringify({variant:'C',startedAt,endedAt:new Date().toISOString(),checks,
    scope:'Actual Firefox C UI on shared Docker/PostgreSQL; explicit API commands set up permission and replay checks. Synthetic only.',verdictSource:'Node test exit and TAP output'},null,2)+'\n');
});
