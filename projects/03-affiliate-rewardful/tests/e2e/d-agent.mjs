import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wd, js, open, mobile, click, until, screenshot, noOverflow } from '../helpers/browser.mjs';
import { browserCommand, freshBrowserSession, limitedBrowserSession } from '../helpers/browser-session.mjs';

const base=process.env.N3_D_URL || 'http://127.0.0.1:13034';
const b=process.env.N3_B_URL || 'http://127.0.0.1:13032';
const evidence=process.env.N3_EVIDENCE_DIR || '.runtime/e2e-d';
const $=id=>`[data-testid="${id}"]`;
const visible=id=>until(`return !!document.querySelector(${JSON.stringify($(id))})`);
const enabled=id=>until(`const e=document.querySelector(${JSON.stringify($(id))});return e && !e.disabled && !document.querySelector('[aria-busy=true]')`);
const text=id=>js('return document.querySelector(arguments[0])?.textContent',$(id));
const state=expected=>until(`return document.querySelector('[data-testid=task-state]')?.dataset.state===${JSON.stringify(expected)}`);
const command=(role,action,input={},options={})=>browserCommand('D',role,action,input,options);
const dashboard=async()=>{const r=await command('merchant','dashboard');assert.equal(r.status,200);return r.data;};
const fresh=()=>freshBrowserSession(base,'D',$('grant-consent'));
async function grant() {
  await click($('grant-consent'));await click($('grant-create'));await visible('grant-id');await enabled('task-create');
}
async function createAndRun() {
  await enabled('task-create');await click($('task-create'));await state('pending');
  await enabled('task-run');await click($('task-run'));await state('completed');
}
async function reference() {
  return {artifactId:await text('artifact-id'),revision:Number(await text('artifact-revision')),hash:await text('artifact-hash'),
    amountMinor:Number(await js('return document.querySelector("[data-testid=artifact-amount]").dataset.amountMinor'))};
}
const sameRef=({artifactId,revision,hash})=>({artifactId,revision,hash});

test('D actual browser delegated tasks and owner handoff',{timeout:210000},async t=>{
  const startedAt=new Date().toISOString(),checks=[];await mkdir(evidence,{recursive:true});await fresh();
  await t.test('SC-US-401-1 consent creates only subject-scoped read and draft grant',async()=>{
    await click($('grant-create'));await visible('state-error');assert.equal((await dashboard()).grants.length,0);
    await grant();const granted=(await dashboard()).grants[0];
    assert.deepEqual(granted.actions,['registry.prepare','registry.read']);assert.equal(granted.actorId,(await dashboard()).actor.id);
    assert.ok(granted.expiresAt);assert.match(await text('grant-scope'),/registry.read/);assert.doesNotMatch(await text('grant-scope'),/approve|export|sent/);
    assert.ok((await text('grant-subject')).includes(granted.actorId));await screenshot(evidence,'d-grant');checks.push(await noOverflow());
  });
  let first,revised;
  await t.test('SC-US-402-1 replay keeps logical task and one payable registry',async()=>{
    await createAndRun();await visible('artifact-id');first=await reference();assert.equal(first.amountMinor,60000);
    const taskId=await text('task-id');await click($('task-repeat'));await state('completed');assert.equal(await text('task-id'),taskId);
    await enabled('task-run');await click($('task-run'));await state('completed');assert.deepEqual(await reference(),first);
    assert.equal((await dashboard()).registries.length,1);assert.equal((await dashboard()).tasks.length,1);
    await click('[data-view=result]');await screenshot(evidence,'d-owner-result');await click('[data-view=task]');
  });
  await t.test('SC-US-403-1 owner exports only approved exact snapshot and never sends',async()=>{
    await enabled('owner-export');await click($('owner-export'));await visible('state-error');assert.equal((await dashboard()).transfers.length,0);
    await enabled('owner-approve');await click($('owner-approve'));await enabled('owner-export');
    await js('window.__csv=null;const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.text().then(s=>window.__csv=s);return original(blob)}');
    await click($('owner-export'));await until('return typeof window.__csv==="string"');
    assert.ok((await js('return window.__csv')).includes(first.hash));assert.equal((await dashboard()).transfers.length,0);
    const grantId=await text('grant-id');assert.equal((await command('merchant','registry.approve',sameRef(first),{grantId})).status,403);
  });
  await t.test('SC-US-402-2 refund recount changes same artifact and explains exact correction',async()=>{
    await enabled('lab-open');await click($('lab-open'));await enabled('lab-refund');await click($('lab-refund'));
    await visible('stale-task-result');assert.equal((await dashboard()).registries[0].approval,null);
    await enabled('owner-export');await click($('owner-export'));await visible('state-error');
    await enabled('task-recount');await click($('task-recount'));await state('pending');await click($('task-run'));await state('completed');
    revised=await reference();assert.equal(revised.artifactId,first.artifactId);assert.equal(revised.revision,2);assert.notEqual(revised.hash,first.hash);
    assert.equal(revised.amountMinor,55000);assert.equal((await dashboard()).registries.length,1);
    await visible('artifact-corrections');
    assert.ok(await js('return [...document.querySelectorAll("[data-testid=correction-amount]")].some(e=>Number(e.dataset.amountMinor)===-5000)'));
    const server=await dashboard(),correction=server.ledger.find(e=>e.amountMinor===-5000);
    assert.ok((await text('artifact-corrections')).includes(correction.paymentId));assert.ok((await text('artifact-corrections')).includes(correction.id));
    await wd('/refresh',{});await visible('artifact-corrections');assert.deepEqual(await reference(),revised);
    await click('[data-view=result]');await screenshot(evidence,'d-refund-recount');checks.push(await noOverflow());await click('[data-view=task]');
  });
  await t.test('SC-US-403-2 revoke denies cached agent read and owner continues exact revised artifact in A',async()=>{
    await enabled('grant-revoke');await click($('grant-revoke'));await enabled('task-read');await click($('task-read'));await visible('state-denied');
    assert.match(await text('state-denied'),/GRANT_INACTIVE/);await enabled('owner-approve');await click($('owner-approve'));
    assert.equal((await dashboard()).registries[0].approval.hash,revised.hash);await click('[data-view=result]');await screenshot(evidence,'d-revoked-owner');
    await click($('owner-handoff'));await visible('handoff-artifact');
    assert.equal(await text('artifact-id'),revised.artifactId);assert.equal(await text('artifact-hash'),revised.hash);
    assert.equal(await js('return location.origin'),new URL(process.env.N3_A_URL || 'http://127.0.0.1:13031').origin);assert.equal(await js('return location.hash'),'');
    await screenshot(evidence,'d-to-a-handoff');
  });
  await t.test('SC-US-401-2 expired grant denies next step while owner read stays available',async()=>{
    await fresh();await grant();await createAndRun();await visible('artifact-id');const ref=await reference();
    await click($('lab-open'));await enabled('lab-advance');await click($('lab-advance'));await enabled('task-read');
    await click($('task-read'));await visible('state-denied');assert.match(await text('state-denied'),/GRANT_INACTIVE/);
    await click($('owner-refresh'));await enabled('owner-refresh');assert.equal(await text('artifact-id'),ref.artifactId);
    assert.equal(await js('return !!document.querySelector("[data-testid=state-denied]")'),false);
  });
  let t1,t2;
  await t.test('SC-US-404-1 partner repeat preserves same own task with no settlement side effects',async()=>{
    await click($('role-partner'));await visible('grant-consent');await grant();await click($('task-create'));await state('pending');
    t1=await text('task-id');await click($('task-repeat'));await state('pending');assert.equal(await text('task-id'),t1);
    assert.equal((await command('partner','dashboard')).status,403);assert.equal((await dashboard()).transfers.length,0);
  });
  await t.test('SC-US-404-2 canceled T1 late response never completes selected T2',async()=>{
    await click($('task-cancel'));await state('canceled');await click($('task-new'));await state('pending');t2=await text('task-id');assert.notEqual(t2,t1);
    await click('.late-lab summary');await click($('task-late'));await visible('late-result');
    assert.equal(await text('task-id'),t2);await state('pending');assert.ok((await text('late-result')).includes(t1));
    await click($('task-run'));await state('completed');await visible('partner-result');
    assert.doesNotMatch(await text('partner-result'),/Илья|Мария/);await click('[data-view=result]');await screenshot(evidence,'d-partner-result');
  });
  let personal;
  await t.test('SC-US-405-1 customer agent answer matches the actual B credit UI on same session',async()=>{
    await click($('role-customer'));await visible('grant-consent');await grant();await createAndRun();await visible('credit-result');
    personal=(await command('customer','credit.read')).data;assert.equal(personal.availableMinor,30000);assert.equal(personal.reservedMinor,0);
    assert.doesNotMatch(await text('credit-result'),/Анна|Илья|cash/);await click('[data-view=result]');await screenshot(evidence,'d-customer-result');
    // Test setup only: carry the same fixture session to B without logging its token.
    const session=await js('return JSON.parse(sessionStorage.getItem("n3.fixture.D"))');
    await open(b);await until('return !!document.querySelector("#feedback, .fatal")');
    await js('sessionStorage.setItem("n3.fixture.B",JSON.stringify(arguments[0]))',session);await wd('/refresh',{});await visible('publish-widget');
    await click($('publish-widget'));await click($('enrollment-consent'));await click($('enrollment-submit'));await visible('share-kit');
    await click($('nav-credits'));await visible('credit-balance');
    const inB=(await browserCommand('B','customer','credit.read')).data;
    for(const key of ['availableMinor','heldMinor','reservedMinor','appliedMinor'])assert.equal(inB[key],personal[key]);
    assert.match(await text('credit-balance'),/300/);assert.match(await text('invoice-remaining'),/1\s*500/);
    await open(base);await visible('credit-result');
  });
  await t.test('SC-US-405-2 read-only customer grant cannot reserve or apply credit',async()=>{
    const before=(await command('customer','credit.read')).data;
    await click($('credit-deny-reserve'));await visible('state-denied');assert.match(await text('state-denied'),/GRANT_SCOPE/);
    const after=(await command('customer','credit.read')).data;assert.deepEqual(after,before);
    const grantId=await text('grant-id');assert.equal((await command('customer','credit.resolve',{reservationId:'none',outcome:'success'},{grantId})).status,403);
  });
  await t.test('D network recovery keyboard and mobile390 preserve task and own result',async()=>{
    await js("window.__realFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Нет связи'))");
    await click($('task-read'));await visible('state-error');await js('window.fetch=window.__realFetch');await click($('retry'));await state('completed');
    await js('document.querySelector("[data-view=result]").focus()');
    await wd('/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\ue007'},{type:'keyUp',value:'\ue007'}]}]});await visible('credit-result');
    await mobile(base);await visible('credit-result');await click('[data-view=result]');checks.push(await noOverflow());await screenshot(evidence,'d-mobile-customer');
    await click($('role-partner'));await visible('partner-result');await click('[data-view=result]');checks.push(await noOverflow());await screenshot(evidence,'d-mobile-partner');
  });
  await t.test('D limited customer session exposes no merchant role or owner controls',async()=>{
    assert.equal((await limitedBrowserSession('D','customer')).actors,1);await open(base);await visible('role-customer');
    assert.equal(await js('return !!document.querySelector("[data-testid=role-merchant]")'),false);
    await grant();await createAndRun();await visible('credit-result');
    assert.equal(await js('return !!document.querySelector("[data-testid=lab-open], [data-testid=owner-approve]")'),false);
  });
  await writeFile(join(evidence,'browser-summary.json'),JSON.stringify({variant:'D',startedAt,endedAt:new Date().toISOString(),checks,
    scope:'Actual Firefox D owner/partner/customer plus A handoff and B same-session credit UI; fixture-only deterministic tasks, no MCP/A2A wire or LLM.',verdictSource:'Node test exit and TAP output'},null,2)+'\n');
});
