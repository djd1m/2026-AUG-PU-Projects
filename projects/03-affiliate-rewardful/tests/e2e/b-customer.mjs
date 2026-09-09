import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { wd, js, open, mobile, click, fill, until, element, screenshot, noOverflow } from '../helpers/browser.mjs';

const base=process.env.N3_B_URL || 'http://127.0.0.1:13032';
const host=process.env.N3_A_URL || 'http://127.0.0.1:13031';
const evidence=process.env.N3_EVIDENCE_DIR || '.runtime/e2e-b';
const $=id=>`[data-testid="${id}"]`;
const visible=id=>until(`return !!document.querySelector(${JSON.stringify($(id))})`);
const text=id=>js('return document.querySelector(arguments[0])?.textContent',$(id));
const nav=id=>click($('nav-'+id));
const settled=()=>until('return !document.querySelector("[aria-busy=true]")');
async function command(action,input={},options={}) {
  return js(`const s=JSON.parse(sessionStorage.getItem('n3.fixture.B'));
    const [action,input,options]=arguments;
    return fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.token},
      body:JSON.stringify({action,input,actorId:s.actors.find(a=>a.role===(options.role||'customer')).id,
        grantId:options.grantId,idempotencyKey:options.key||crypto.randomUUID()})})
      .then(async r=>({status:r.status,...await r.json()}));`,action,input,options);
}
const credit=async()=>{const r=await command('credit.read');assert.equal(r.status,200);return r.data;};
async function fresh() {
  await open(base);await js("for(const k of Object.keys(sessionStorage))if(k.startsWith('n3.fixture.B'))sessionStorage.removeItem(k)");
  await wd('/refresh',{});await visible('publish-widget');
}
async function enroll() {
  await click($('publish-widget'));await visible('invite-offer');await click($('enrollment-consent'));
  await click($('enrollment-submit'));await visible('share-kit');
}

test('B customer actual browser journey',{timeout:180000},async t=>{
  const startedAt=new Date().toISOString(),checks=[];await mkdir(evidence,{recursive:true});
  await fresh();
  await t.test('SC-US-201-2 reads and unchecked submit cannot enroll',async()=>{
    assert.equal((await command('program.read')).data.enrollment,null);
    assert.equal(await js('return !!document.querySelector("[data-testid=invite-offer]")'),false);
    await click($('publish-widget'));await visible('invite-offer');assert.match(await text('credit-policy'),/20%/);
    await click($('enrollment-submit'));assert.equal((await command('program.read')).data.enrollment,null);
    assert.match(await js('return document.querySelector("#feedback").textContent'),/флажком/);
  });
  await t.test('SC-US-201-1 decline preserves product and explicit consent creates enrollment',async()=>{
    await click($('decline-invite'));await visible('restore-invite');assert.match(await text('widget-status'),/опубликован/);
    assert.equal((await command('program.read')).data.enrollment,null);
    await click($('restore-invite'));await screenshot(evidence,'b-invitation');checks.push(await noOverflow());
    await click($('enrollment-consent'));await click($('enrollment-submit'));await visible('share-kit');
    assert.ok((await command('program.read')).data.enrollment);
  });
  await t.test('SC-US-204-1 share kit matches read-only agent output and copies disclosure',async()=>{
    const grant=(await command('grant.create',{actions:['share.read','credit.read'],expiresInSeconds:600})).data;
    const shared=(await command('share.read',{}, {grantId:grant.grantId})).data;
    assert.equal(await js('return document.querySelector("#share-url").value'),shared.referralUrl);
    assert.equal(await text('share-disclosure'),shared.disclosure);
    await click($('copy-share'));await until('return document.querySelector("#feedback").textContent.includes("Скопировано")');
    await screenshot(evidence,'b-share');
  });
  await t.test('SC-US-203-3 unknown keeps original reserve through reload and failed releases once',async()=>{
    await nav('credits');await visible('reserve-credit');assert.equal((await credit()).availableMinor,30000);
    await click($('reserve-credit'));await visible('reservation-pending');
    const first=await credit();assert.equal(first.reservedMinor,30000);assert.equal(first.invoice.remainingMinor,150000);
    await click($('billing-unknown'));await visible('reservation-unknown');
    await wd('/refresh',{});await visible('credit-balance');await nav('credits');await visible('reservation-unknown');
    assert.equal((await credit()).reservations.length,1);assert.ok(await js('return document.querySelector("#reserve-credit").disabled'));
    await screenshot(evidence,'b-unknown');
    await click($('billing-failed'));await visible('reservation-failed');
    const released=await credit();assert.equal(released.availableMinor,30000);assert.equal(released.reservedMinor,0);
    assert.equal((await command('credit.resolve',{reservationId:first.reservations[0].id,outcome:'failed'},{role:'merchant'})).status,200);
    assert.equal((await credit()).availableMinor,30000);
  });
  await t.test('SC-US-203-1 confirmed application changes invoice1500 to1200 once',async()=>{
    await click($('reserve-credit'));await visible('reservation-pending');await click($('billing-success'));await visible('reservation-success');
    const state=await credit();assert.equal(state.appliedMinor,30000);assert.equal(state.invoice.remainingMinor,120000);
    const completed=state.reservations.find(r=>r.state==='success');
    await command('credit.resolve',{reservationId:completed.id,outcome:'success'},{role:'merchant'});
    assert.equal((await credit()).appliedMinor,30000);assert.match(await text('invoice-remaining'),/1\s*200/);
  });
  await t.test('SC-US-202-1 verified friend payment creates held credit with source and policy',async()=>{
    const before=await credit();await click($('lab-payment'));await settled();
    await until('return document.querySelector("#feedback").textContent.includes("hold")');
    const after=await credit();assert.equal(after.heldMinor,before.heldMinor+30000);assert.equal(after.availableMinor,before.availableMinor);
    await nav('overview');await visible('credit-ledger');assert.ok((await text('credit-ledger')).includes(after.ledger.at(-1).paymentId));
    assert.match(await text('credit-ledger'),/Проверка до/);
  });
  await t.test('SC-US-202-2 self-referral and unpaid registration never add available bonus',async()=>{
    const before=await credit();await nav('credits');await visible('lab-self-referral');await click($('lab-self-referral'));
    await until('return document.querySelector("#feedback").textContent.includes("Самореферал проверен")');
    assert.equal((await credit()).availableMinor,before.availableMinor);assert.equal((await credit()).ledger.length,before.ledger.length);
    await nav('overview');assert.match(await js('return document.body.textContent'),/Переход или регистрация/);
  });
  await t.test('SC-US-204-2 read-balance grant cannot join or reserve and customer cannot buy owner tariff',async()=>{
    const before=await credit(),program=(await command('program.read')).data;
    const grant=(await command('grant.create',{actions:['credit.read'],expiresInSeconds:600})).data;
    assert.equal((await command('enrollment.join',{consent:true},{grantId:grant.grantId})).status,403);
    assert.equal((await command('credit.reserve',{amountMinor:1,invoiceId:before.invoice.id},{grantId:grant.grantId})).status,403);
    assert.equal((await command('dashboard')).status,403);
    assert.deepEqual((await credit()).reservations,before.reservations);assert.deepEqual((await command('program.read')).data.enrollment,program.enrollment);
    assert.doesNotMatch(await js('return document.body.textContent'),/Выбрать тариф|Купить тариф/);
  });
  await t.test('B error recovery, keyboard and mobile390 remain usable',async()=>{
    await js('document.querySelector("[data-testid=nav-share]").focus()');
    await wd('/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\ue007'},{type:'keyUp',value:'\ue007'}]}]});await visible('share-kit');
    await js("window.__realFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError('Нет связи'))");
    await nav('credits');await until('return document.querySelector("#feedback").getAttribute("role")==="alert"');
    await js('window.fetch=window.__realFetch');await nav('credits');await visible('invoice-card');
    await mobile(base);await visible('credit-balance');checks.push(await noOverflow());await screenshot(evidence,'b-mobile-overview');
    await nav('credits');await visible('invoice-card');checks.push(await noOverflow());await screenshot(evidence,'b-mobile-credit');
  });
  await t.test('SC-US-203-2 losing stale tab refreshes current balance after server conflict',async()=>{
    await fresh();await enroll();await nav('credits');await visible('reserve-credit');
    const before=await credit();
    assert.equal((await command('credit.reserve',{amountMinor:30000,invoiceId:before.invoice.id})).status,200);
    // Another request has won after the UI read. The user still sees its old button.
    await click($('reserve-credit'));await visible('reservation-pending');
    await until('return document.querySelector("#feedback").getAttribute("role")==="alert"');
    assert.ok(await js('return document.querySelector("#reserve-credit").disabled'));assert.equal((await credit()).reservations.length,1);
    assert.match(await text('invoice-reserved'),/300/);
  });
  await t.test('B embed enforces CSP CORS exact origin source schema and survives hostile host CSS',async()=>{
    await fresh(); // Clear standalone enrollment before embedding the same B origin.
    await open(host+'/_fixtures/embed-host.html');await until('return !document.querySelector("#host-publish").disabled');
    const cors=await js('return fetch(arguments[0]+"/health").then(r=>r.status)',base);assert.equal(cors,200);
    await wd('/frame',{id:await element('#customer-frame')});await visible('value-moment-waiting');
    await js("for(const k of Object.keys(sessionStorage))if(k.startsWith('n3.fixture.B'))sessionStorage.removeItem(k)");
    await wd('/frame',{id:null});
    await js('document.querySelector("#customer-frame").contentWindow.postMessage({type:"n3.value-moment",version:1,event:"widget_published",extra:true},arguments[0]);',base);
    // A real same-origin sibling frame sends an exact message, but is not the parent.
    await js('const f=document.createElement("iframe");f.id="sibling";document.body.append(f)');
    await wd('/frame',{id:await element('#sibling')});
    await js('parent.document.querySelector("#customer-frame").contentWindow.postMessage({type:"n3.value-moment",version:1,event:"widget_published"},arguments[0]);',base);
    await wd('/frame',{id:null});await wd('/frame',{id:await element('#customer-frame')});
    await visible('value-moment-waiting');assert.equal(await js('return !!document.querySelector("[data-testid=invite-offer]")'),false);
    await wd('/frame',{id:null});await click('#host-publish');await wd('/frame',{id:await element('#customer-frame')});await visible('invite-offer');
    const style=await js('const s=getComputedStyle(document.querySelector("#enrollment-submit"));return {background:s.backgroundColor,font:s.fontFamily}');
    assert.notEqual(style.background,'rgb(255, 0, 255)');assert.match(style.font,/Rubik/);checks.push(await noOverflow());
    await wd('/frame',{id:null});await screenshot(evidence,'b-foreign-origin-embed');
    await wd('/frame',{id:await element('#customer-frame')});await click($('decline-invite'));
    await wd('/frame',{id:null});await until('return document.querySelector("#customer-frame").hidden');
    await fill('#widget-title-input','Виджет работает после отказа');await click('#host-edit');
    assert.equal(await js('return document.querySelector("#widget-title").textContent'),'Виджет работает после отказа');
  });
  await writeFile(join(evidence,'browser-summary.json'),JSON.stringify({variant:'B',startedAt,endedAt:new Date().toISOString(),checks,
    scope:'Actual Firefox UI and foreign-origin iframe; explicit HTTP commands set up grant and competing-client actions. F1 synthetic only.',
    verdictSource:'Node test exit and TAP output'},null,2)+'\n');
});
