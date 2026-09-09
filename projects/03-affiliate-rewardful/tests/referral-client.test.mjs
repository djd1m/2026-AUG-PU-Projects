import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import { captureReferral, createReferralTrackerScript } from '../shared/client/referral-tracker.mjs';
import { createReferralMerchantClient, referralTokenFromCookie } from '../shared/integrations/merchant-client.mjs';

const tenantId = '123e4567-e89b-42d3-a456-426614174000';
const firstToken = 'A'.repeat(43), secondToken = 'B'.repeat(43), secret = 'S'.repeat(43);

function fakeBrowser(href, now, { blocked = false, initialCookie = '' } = {}) {
  let cookie = initialCookie, assignment = '';
  const location = new URL(href);
  const document = {
    get cookie() { return cookie; },
    set cookie(value) {
      assignment = value;
      if (!blocked) cookie = cookie ? `${cookie}; ${value.split(';')[0]}` : value.split(';')[0];
    },
  };
  const history = { state: { host: true }, replaced: '', replaceState(_state, _title, value) { this.replaced = value; } };
  return { location, document, history, URL, now: () => now, get assignment() { return assignment; } };
}

test('tracker keeps the first live receipt, strips reserved query fields, and does not slide policy expiry', () => {
  const now = Date.parse('2026-09-09T12:00:00Z'), expiry = now + 30 * 86400000;
  const browser = fakeBrowser(`https://merchant.example/register?campaign=fall&n3_ref=${firstToken}&n3_ref_expires=${new Date(expiry).toISOString()}#join`, now);
  assert.deepEqual(captureReferral({ tenantId, windowDays: 30, landingOrigin: 'https://merchant.example' }, browser),
    { status: 'stored', expiresAt: expiry });
  assert.equal(browser.history.replaced, '/register?campaign=fall#join');
  assert.match(browser.assignment, new RegExp(`^n3_ref_${tenantId}=${firstToken}\\.${expiry}; Path=/; SameSite=Lax; Expires=`));
  assert.match(browser.assignment, /; Secure$/);

  browser.location = new URL(`https://merchant.example/register?n3_ref=${secondToken}&n3_ref_expires=${new Date(now + 90 * 86400000).toISOString()}`);
  browser.now = () => now + 86400000;
  assert.deepEqual(captureReferral({ tenantId, windowDays: 90, landingOrigin: 'https://merchant.example' }, browser),
    { status: 'retained', expiresAt: expiry });
  assert.match(browser.document.cookie, new RegExp(`${firstToken}\\.${expiry}`));
  assert.doesNotMatch(browser.document.cookie, new RegExp(secondToken));
});

test('tracker replaces an expired receipt using only the frozen server expiry', () => {
  const now = 2_000_000_000_000, oldExpiry = now - 1, newExpiry = now + 60 * 86400000;
  const browser = fakeBrowser(`https://merchant.example/?n3_ref=${secondToken}&n3_ref_expires=${new Date(newExpiry).toISOString()}`, now,
    { initialCookie: `n3_ref_${tenantId}=${firstToken}.${oldExpiry}` });
  assert.deepEqual(captureReferral({ tenantId, windowDays: 1, landingOrigin: 'https://merchant.example' }, browser),
    { status: 'stored', expiresAt: newExpiry });
  assert.match(browser.document.cookie, new RegExp(secondToken));
});

test('tracker rejects malformed, overlong and wrong-origin referrals after safe origin handling', () => {
  const now = 2_000_000_000_000;
  for (const [token, expiry] of [['bad', new Date(now + 1000).toISOString()], [firstToken, 'tomorrow'],
    [firstToken, new Date(now + 366 * 86400000).toISOString()], [firstToken, '2033-05-18T03:33:21Z']]) {
    const browser = fakeBrowser(`https://merchant.example/?n3_ref=${token}&n3_ref_expires=${expiry}&keep=1`, now);
    assert.equal(captureReferral({ tenantId, windowDays: 30, landingOrigin: 'https://merchant.example' }, browser).status,
      'invalid-referral');
    assert.equal(browser.history.replaced, '/?keep=1');
    assert.equal(browser.document.cookie, '');
  }
  const foreign = fakeBrowser(`https://other.example/?n3_ref=${firstToken}&n3_ref_expires=${new Date(now + 1000).toISOString()}`, now);
  assert.equal(captureReferral({ tenantId, windowDays: 30, landingOrigin: 'https://merchant.example' }, foreign).status,
    'origin-mismatch');
  assert.equal(foreign.history.replaced, '');
});

test('tracker reports blocked cookie storage and generated classic script is self-contained', () => {
  const now = 2_000_000_000_000, expiry = now + 1000;
  const blocked = fakeBrowser(`https://merchant.example/?n3_ref=${firstToken}&n3_ref_expires=${new Date(expiry).toISOString()}`, now, { blocked: true });
  assert.equal(captureReferral({ tenantId, windowDays: 30, landingOrigin: 'https://merchant.example' }, blocked).status,
    'cookie-blocked');
  const script = createReferralTrackerScript({ tenantId, windowDays: 30, landingOrigin: 'https://merchant.example' });
  const browser = fakeBrowser(`https://merchant.example/?n3_ref=${firstToken}&n3_ref_expires=${new Date(expiry).toISOString()}`, now);
  vm.runInNewContext(script, { location: browser.location, document: browser.document, history: browser.history,
    URL, Date: class extends Date { static now() { return now; } } });
  assert.match(browser.document.cookie, new RegExp(firstToken));
  assert.doesNotMatch(script, /import|export|fetch|XMLHttpRequest/);
});

test('merchant client uses only fixed routes, bearer auth, bounded requests and no redirects', async () => {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ data: { ok: true } }), { headers: { 'content-type': 'application/json' } });
  };
  const client = createReferralMerchantClient({ baseUrl: 'http://127.0.0.1:9876', secret, mode: 'isolated-test', fetch });
  await client.bindCustomer({ customerId: 'cus_42', email: 'buyer@example.com', emailVerified: true, visitToken: firstToken });
  await client.createCheckout({ customerId: 'cus_42', amountMinor: 199000, idempotencyKey: 'invoice_42' });
  await client.getOrder({ orderId: 'order_42' });
  assert.deepEqual(calls.map(call => call.url), [
    'http://127.0.0.1:9876/api/integration/customers',
    'http://127.0.0.1:9876/api/integration/checkout',
    'http://127.0.0.1:9876/api/integration/order',
  ]);
  for (const call of calls) {
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.headers.authorization, `Bearer ${secret}`);
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.deepEqual(JSON.parse(calls[0].options.body), { customerId: 'cus_42', email: 'buyer@example.com',
    emailVerified: true, visitToken: firstToken });
});

test('merchant client fails closed on transport, authority fields, verification and oversized bodies', async () => {
  assert.throws(() => createReferralMerchantClient({ baseUrl: 'http://n3.example', secret }), /HTTPS origin/);
  assert.throws(() => createReferralMerchantClient({ baseUrl: 'http://localhost:9000', secret, mode: 'isolated-test' }), /HTTPS origin/);
  const oversized = createReferralMerchantClient({ baseUrl: 'https://n3.example', secret,
    fetch: async () => new Response('{}', { headers: { 'content-length': String(1024 * 1024 + 1) } }) });
  await assert.rejects(oversized.getOrder({ orderId: 'order_1' }), error => error.code === 'RESPONSE_LIMIT');
  const client = createReferralMerchantClient({ baseUrl: 'https://n3.example', secret,
    fetch: async () => new Response(JSON.stringify({ data: {} })) });
  assert.throws(() => client.bindCustomer({ customerId: 'c', email: 'a@b.example', emailVerified: false }), /must be true/);
  assert.throws(() => client.createCheckout({ customerId: 'c', amountMinor: 1, idempotencyKey: 'i', beneficiaryId: 'foreign' }),
    /do not match/);
});

test('cookie parser returns token evidence only and rejects expired or ambiguous cookies', () => {
  const now = 2_000_000_000_000, live = now + 1000;
  assert.equal(referralTokenFromCookie(`theme=green; n3_ref_${tenantId}=${firstToken}.${live}`, tenantId, { now }), firstToken);
  assert.equal(referralTokenFromCookie(`n3_ref_${tenantId}=${firstToken}.${now}`, tenantId, { now }), undefined);
  assert.equal(referralTokenFromCookie(`n3_ref_${tenantId}=${firstToken}.${live}; n3_ref_${tenantId}=${secondToken}.${live}`, tenantId, { now }), undefined);
});

test('merchant external methods use fixed server routes and validate event identifiers before IO',async()=>{
  const calls=[];
  const client=createReferralMerchantClient({baseUrl:'https://n3.example.test',secret,fetch:async(url,options)=>{
    calls.push({url:String(url),body:JSON.parse(options.body)});return Response.json({data:{accepted:true}});
  }});
  await client.reserveExternalOrder({customerId:'account-1',amountMinor:99000,idempotencyKey:'invoice-1'});
  await client.reportExternalEvent({orderId:tenantId,event:'payment.succeeded',objectId:tenantId});
  assert.deepEqual(calls.map(c=>c.url),['https://n3.example.test/api/integration/external-orders','https://n3.example.test/api/integration/external-events']);
  assert.throws(()=>client.reportExternalEvent({orderId:tenantId,event:'payment.pending',objectId:tenantId}));
  assert.throws(()=>client.reportExternalEvent({orderId:'../bad',event:'payment.succeeded',objectId:tenantId}));
  assert.throws(()=>client.reportExternalEvent({orderId:tenantId,event:'payment.succeeded',objectId:tenantId,amountMinor:1}));
  assert.equal(calls.length,2);
});
