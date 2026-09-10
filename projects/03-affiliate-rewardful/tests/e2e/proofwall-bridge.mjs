import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { open, until, fill, click, js, wd, screenshot, noOverflow } from '../helpers/browser.mjs';

const control = process.env.BRIDGE_CONTROL_URL, token = process.env.BRIDGE_CONTROL_TOKEN;
const evidence = process.env.BRIDGE_EVIDENCE_DIR;
assert.match(control || '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(token && evidence, 'Explicit isolated controller and evidence required');
async function api(path, body) {
  const response = await fetch(control + path, { method: body ? 'POST' : 'GET', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000) });
  assert.equal(response.ok, true, `Harness control failed: ${path.split('?')[0]}`); return response.json();
}
async function eventually(operation, condition, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await operation(); if (condition(result)) return result; await new Promise(resolve => setTimeout(resolve,250)); }
  throw new Error(`Timed out: ${label}`);
}
async function button(text) {
  const item = await wd('/element', { using: 'xpath', value: `//button[contains(normalize-space(.), "${text}")]` });
  await js('arguments[0].scrollIntoView({block:"center"})', item);
  await wd(`/element/${Object.values(item)[0]}/click`, {});
}
async function labelInput(label, value) {
  const item = await wd('/element', { using: 'xpath', value: `//label[contains(normalize-space(.), "${label}")]//input` });
  const id = Object.values(item)[0]; await wd(`/element/${id}/clear`, {}); await wd(`/element/${id}/value`, { text: value });
}
async function p1Status() {
  return wd('/execute/async', { script: `const done=arguments[arguments.length-1];fetch('/api/n3/status').then(async r=>done({status:r.status,data:await r.json()})).catch(()=>done({status:0}));`, args: [] });
}
async function dashboardReady() {
  await until('return location.pathname.startsWith("/dashboard/") && document.body.innerText.includes("Партнёрская покупка")', 30000);
}
async function loginPartner(context) {
  await open(`${context.n3Origin}/account`);
  await until('return !!document.querySelector("#auth") && !document.querySelector("#auth").hidden');
  await fill('#email', context.partnerEmail); await fill('#password', context.password); await click('#login button[type=submit]');
  await until('return !document.querySelector("#workspace").hidden');
  await js('const select=document.querySelector("#membership");select.value=arguments[0];select.dispatchEvent(new Event("change",{bubbles:true}))', context.partnerMembershipId);
  await until('return !document.querySelector("#participant").hidden && document.querySelector("#share").textContent.includes("/r/")');
}
const context = await api('/context');

test('actual Proofwall browser signup, email proof, native checkout, durable N3 commission and refund review', { timeout: 240000 }, async () => {
  await loginPartner(context);
  const referral = await js(String.raw`return document.querySelector("#share").textContent.match(/https:\/\/[^\s]+\/r\/[0-9a-f-]+/i)?.[0]`);
  assert.equal(referral, context.referralUrl, 'Use real displayed N3 referral link');
  await open(referral);
  await until('return location.origin===arguments[0] && location.pathname==="/" && !!document.querySelector("input[type=email]")'.replace('arguments[0]', JSON.stringify(context.p1Origin)));
  assert.equal(await js('return location.search.includes("n3_ref")'), false);
  const cookieName = `n3_ref_${context.tenantId}`;
  const firstCookie = (await wd('/cookie')).find(row => row.name === cookieName);
  assert.ok(firstCookie); assert.equal(firstCookie.httpOnly, true); assert.equal(firstCookie.secure, true);
  assert.equal(firstCookie.sameSite, 'Lax'); assert.equal(firstCookie.domain, new URL(context.p1Origin).hostname);
  assert.equal((await js('return document.cookie')).includes(cookieName), false, 'Receipt is not readable by browser scripts');
  await open(referral); await until('return location.pathname==="/" && !!document.querySelector("input[type=email]")');
  assert.equal((await wd('/cookie')).find(row => row.name === cookieName)?.value, firstCookie.value, 'First receipt preserved');

  const email = `p1-${randomUUID()}@example.test`, slug = `bridge-${randomUUID().slice(0,8)}`;
  await fill('input[type=email]', email); await fill('input[type=password]', `Browser ${randomUUID()}!`);
  await labelInput('Название проекта', 'Bridge browser project'); await fill('input[placeholder=acme]', slug);
  await until('return !document.querySelector("button[type=submit]").disabled'); await click('button[type=submit]');
  await dashboardReady(); assert.equal(await js('return location.pathname'), `/dashboard/${slug}`);
  const forgedWebhook = await wd('/execute/async', { script: `const done=arguments[arguments.length-1];fetch('/api/webhooks/payment',{
    method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'185.71.76.1'},
    body:JSON.stringify({event:'payment.succeeded',object:{id:arguments[0]}})}).then(r=>done(r.status)).catch(()=>done(0));`, args: [randomUUID()] });
  assert.equal(forgedWebhook, 400, 'Browser cannot forge trusted provider source at ordinary ingress');
  assert.equal((await api('/provider')).calls.length, 0, 'Rejected webhook never queries provider');
  await button('Оплатить 30 дней');
  await until('return document.body.innerText.includes("Подтвердите почту")');
  assert.equal((await api('/provider')).payments.length, 0);
  assert.equal((await api('/n3')).metrics.registrations, 0);
  await screenshot(evidence, 'p1-unverified-checkout');
  await button('Отправить письмо подтверждения');
  await until('return document.body.innerText.includes("Письмо отправлено")');
  const mail = await eventually(() => api(`/mail?email=${encodeURIComponent(email)}`), x => Boolean(x.link), 'actual Resend proof message');
  await open(mail.link); mail.link = null;
  await until('return location.pathname==="/n3/verify" && location.hash==="" && !document.querySelector("button").disabled');
  assert.equal((await p1Status()).data.verified, false, 'GET proof link does not consume proof');
  assert.equal((await api('/n3')).metrics.registrations, 0);
  await button('Подтвердить');
  await until('return document.body.innerText.includes("Почта подтверждена")');
  await click('a[href="/dashboard"]'); await dashboardReady();
  await eventually(p1Status, x => x.status === 200 && x.data.bound === true, 'real worker customer bind');
  await until('return document.body.innerText.includes("партнёрская регистрация сохранена")');
  assert.equal((await api('/n3')).metrics.registrations, 1);
  await noOverflow(); await screenshot(evidence, 'p1-verified-bound');

  await button('Оплатить 30 дней'); await until('return !!document.querySelector("#provider-pay")');
  const before = await api('/provider'); assert.equal(before.payments.length, 1);
  const payment = before.payments[0]; assert.equal(payment.amount.value, '990.00'); assert.equal(payment.amount.currency, 'RUB');
  assert.equal(await js('return location.href'), payment.confirmationUrl);
  assert.ok(payment.metadata.order_id && payment.metadata.proofwall_invoice_id && payment.metadata.project_id);
  const orderPath = `/n3?orderId=${payment.metadata.order_id}`;
  assert.equal((await api(orderPath)).order.verified, false);
  await open(payment.returnUrl); await dashboardReady();
  assert.equal((await p1Status()).data.purchases[0].state === 'completed', false, 'Return navigation is not payment proof');
  assert.equal((await api('/n3')).payments.length, 0);
  await screenshot(evidence, 'p1-pending-return');
  await open(payment.confirmationUrl); await click('#provider-pay'); await dashboardReady();
  await eventually(p1Status, x => x.data?.purchases?.[0]?.state === 'completed', 'native webhook entitlement');
  const settled = await eventually(() => api(orderPath), x => x.order?.verified && x.payments.length === 1, 'durable P1 worker N3 settlement');
  assert.equal(settled.order.netAmountMinor, 99000); assert.equal(settled.order.testMode, true);
  assert.equal(settled.payments[0].rewardMinor, 19800); assert.equal(settled.payments[0].testMode, true);
  assert.equal(settled.metrics.testPayingCustomers, 1); assert.equal(settled.metrics.payingCustomers, 0);
  assert.equal(settled.summary.accruedMinor, 0); assert.equal(settled.summary.availableMinor, 0);
  await wd('/refresh', {}); await dashboardReady();
  await until('return document.body.innerText.includes("Оплачено до") && document.body.innerText.includes("Тестовая оплата подтверждена")');
  const paidUntil = await js('return [...document.querySelectorAll("p")].find(p=>p.textContent.includes("Оплачено до"))?.querySelector("b")?.textContent');
  assert.ok(paidUntil); await screenshot(evidence, 'p1-native-paid');
  const providerState = await api('/provider'); assert.equal(providerState.payments.length, 1);
  for (const client of ['p1', 'n3']) assert.ok(providerState.calls.some(call => call.client === client && call.method === 'GET' && call.path === `/v3/payments/${payment.id}`), `${client} independently queried provider`);

  await api('/replay', { paymentId: payment.id });
  await wd('/refresh', {}); await dashboardReady();
  assert.equal(await js('return [...document.querySelectorAll("p")].find(p=>p.textContent.includes("Оплачено до"))?.querySelector("b")?.textContent'), paidUntil);
  assert.equal((await api(orderPath)).payments.length, 1);
  await open(`${context.n3Origin}/account`);
  await until('return !document.querySelector("#workspace").hidden');
  await js('const s=document.querySelector("#membership");s.value=arguments[0];s.dispatchEvent(new Event("change",{bubbles:true}))', context.partnerMembershipId);
  await until('return !document.querySelector("#participant").hidden');
  await until('return /198[.,]00/.test(document.querySelector("#summary").textContent) && /тест/i.test(document.querySelector("#summary").textContent)');
  assert.match(await js('return document.querySelector("#summary").textContent'), /выплат|реестр/i);
  await wd('/refresh', {});
  await until('return !document.querySelector("#workspace").hidden');
  await js('const s=document.querySelector("#membership");s.value=arguments[0];s.dispatchEvent(new Event("change",{bubbles:true}))', context.partnerMembershipId);
  await until('return /198[.,]00/.test(document.querySelector("#summary")?.textContent || "")');
  await noOverflow(); await screenshot(evidence, 'n3-partner-test-commission');

  const refund = await api('/refund', { paymentId: payment.id, amountMinor: 49500 });
  const corrected = await eventually(() => api(orderPath), x => x.order?.refundedAmountMinor === 49500 && x.refunds.length === 1, 'real refund relay');
  assert.equal(corrected.order.netAmountMinor, 49500);
  assert.equal(corrected.ledger.reduce((sum, row) => sum + row.amountMinor, 0), 9900);
  assert.equal(corrected.summary.availableMinor, 0);
  await api('/replay-refund', { refundId: refund.refundId });
  const replayed = await api(orderPath); assert.equal(replayed.refunds.length, 1);
  assert.equal(replayed.ledger.reduce((sum, row) => sum + row.amountMinor, 0), 9900);
  await open(`${context.p1Origin}/dashboard/${slug}`); await dashboardReady();
  await until('return document.body.innerText.includes("Срок тарифа требует ручной проверки")');
  assert.equal((await p1Status()).data.purchases[0].refund_review, true);
  assert.equal(await js('return [...document.querySelectorAll("p")].find(p=>p.textContent.includes("Оплачено до"))?.querySelector("b")?.textContent'), paidUntil);
  await wd('/window/rect', { width: 390, height: 844 }); await noOverflow(); await screenshot(evidence, 'p1-refund-review-mobile');
  await writeFile(`${evidence}/summary.json`, JSON.stringify({ at: new Date().toISOString(),
    actualProducts: ['P1 Next', 'P1 worker', 'N3 API', `N3 ${context.variant.toUpperCase()} account UI`], mockedExternal: ['Resend', 'YooKassa'],
    transport: 'HTTPS over isolated Unix sockets', browserAndServerCertificateVerification: true,
    productionDeploymentVerified: false, paymentId: payment.id, orderId: payment.metadata.order_id,
    checksPassed: ['browser-referral', 'HttpOnly-first-touch', 'real-signup', 'forged-webhook-origin-refused', 'proof-required', 'real-mail-fragment', 'GET-no-proof-consumption',
      'worker-customer-bind', 'native-checkout', 'pending-return-no-entitlement', 'independent-provider-reads', 'worker-settlement',
      'one-test-commission', 'zero-live-payout', 'reload-persistence', 'duplicate-payment', 'partner-visible-test-commission',
      'partial-refund-relay', 'duplicate-refund', 'manual-entitlement-review', 'mobile-no-overflow'],
    uncovered: ['public DNS/Caddy', 'real mail delivery', 'real provider/shop', 'outage retry browser scenario', 'remaining A-D UI regressions'],
  }, null, 2));
});
