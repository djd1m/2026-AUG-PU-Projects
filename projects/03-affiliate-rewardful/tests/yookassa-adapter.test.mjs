import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createYooKassa,
  YooKassaConfigError,
  YooKassaInputError,
  YooKassaProviderError,
  YooKassaVerificationError,
} from '../shared/payments/yookassa.mjs';

const SHOP = '123456';
const SECRET = 'unit-test-secret';
const ORDER = '11111111-1111-4111-8111-111111111111';
const PAYMENT = '2419a771-000f-5000-9000-1edaf29243f2';
const OTHER_PAYMENT = '29f31de9-000f-5000-a000-109987b98a6a';
const REFUND = '216749f7-0016-50be-b000-078d43a63ae4';
const PAID_AT = '2026-09-09T08:53:12.123Z';
const REFUNDED_AT = '2026-09-09T09:00:00.456Z';

function paymentRaw(overrides = {}) {
  const base = {
    id: PAYMENT,
    status: 'succeeded',
    paid: true,
    refundable: true,
    amount: { value: '1990.00', currency: 'RUB' },
    recipient: { account_id: SHOP, gateway_id: '654321' },
    test: true,
    captured_at: PAID_AT,
    metadata: { order_id: ORDER },
  };
  return {
    ...base,
    ...overrides,
    amount: { ...base.amount, ...(overrides.amount ?? {}) },
    recipient: { ...base.recipient, ...(overrides.recipient ?? {}) },
    metadata: overrides.metadata === null
      ? undefined
      : { ...base.metadata, ...(overrides.metadata ?? {}) },
  };
}

function pendingPaymentRaw(overrides = {}) {
  const raw = paymentRaw({
    status: 'pending', paid: false, refundable: false, captured_at: undefined,
    confirmation: { type: 'redirect', confirmation_url: 'https://yoomoney.ru/checkout/abc' },
    ...overrides,
  });
  return raw;
}

function refundRaw(overrides = {}) {
  const base = {
    id: REFUND,
    status: 'succeeded',
    amount: { value: '990.00', currency: 'RUB' },
    payment_id: PAYMENT,
    created_at: REFUNDED_AT,
  };
  return { ...base, ...overrides, amount: { ...base.amount, ...(overrides.amount ?? {}) } };
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json;charset=UTF-8', ...(init.headers ?? {}) },
  });
}

function notification(event, object) {
  return JSON.stringify({ type: 'notification', event, object });
}

function adapter(fetchImpl, overrides = {}) {
  return createYooKassa({
    shopId: SHOP, secretKey: SECRET, testMode: true, fetchImpl, ...overrides,
  });
}

async function rejectsCode(action, ErrorClass, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof ErrorClass);
    assert.equal(error.code, code);
    return true;
  });
}

test('factory refuses absent, empty, malformed, and unknown configuration', () => {
  const noop = async () => jsonResponse({});
  assert.throws(() => createYooKassa(), YooKassaConfigError);
  assert.throws(() => createYooKassa(null), YooKassaConfigError);
  for (const value of [undefined, null, '', 'shop-1', 123]) {
    assert.throws(() => createYooKassa({
      shopId: value, secretKey: SECRET, testMode: true, fetchImpl: noop,
    }), YooKassaConfigError);
  }
  for (const secretKey of [undefined, null, '', 'x'.repeat(513)]) {
    assert.throws(() => createYooKassa({
      shopId: SHOP, secretKey, testMode: true, fetchImpl: noop,
    }), YooKassaConfigError);
  }
  for (const testMode of [undefined, null, 0, 'true']) {
    assert.throws(() => createYooKassa({
      shopId: SHOP, secretKey: SECRET, testMode, fetchImpl: noop,
    }), YooKassaConfigError);
  }
  assert.throws(() => createYooKassa({
    shopId: SHOP, secretKey: SECRET, testMode: true, fetchImpl: null,
  }), YooKassaConfigError);
});

test('createPayment uses fixed transport, exact RUB decimal, and the order UUID as stable key', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(pendingPaymentRaw({ amount: { value: '1990.01' } }));
  };
  const yk = adapter(fetchImpl);
  const request = {
    orderId: ORDER,
    amountMinor: 199001,
    returnUrl: 'https://n3.example/account?checkout=return',
    description: 'N3 order',
  };

  const first = await yk.createPayment(request);
  const second = await yk.createPayment(request);
  assert.deepEqual(first, second);
  assert.equal(first.amountMinor, 199001);
  assert.equal(first.orderId, ORDER);
  assert.equal(first.confirmationUrl, 'https://yoomoney.ru/checkout/abc');
  assert.equal(first.paidAt, null);
  assert.equal(calls.length, 2);

  for (const { url, options } of calls) {
    assert.equal(url, 'https://api.yookassa.ru/v3/payments');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.authorization,
      `Basic ${Buffer.from(`${SHOP}:${SECRET}`).toString('base64')}`);
    assert.equal(options.headers.accept, 'application/json');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.equal(options.headers['idempotence-key'], ORDER);
    assert.deepEqual(JSON.parse(options.body), {
      amount: { value: '1990.01', currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: request.returnUrl },
      description: request.description,
      metadata: { order_id: ORDER },
    });
  }
});

test('createPayment validates every caller-controlled boundary before transport', async () => {
  let calls = 0;
  const yk = adapter(async () => { calls += 1; return jsonResponse({}); });
  const valid = {
    orderId: ORDER, amountMinor: 100, returnUrl: 'https://n3.example/return', description: 'N3',
  };
  const invalid = [
    { ...valid, orderId: 'not-a-uuid' },
    { ...valid, amountMinor: 0 },
    { ...valid, amountMinor: 1.5 },
    { ...valid, amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, returnUrl: 'http://n3.example/return' },
    { ...valid, returnUrl: 'https://user:pass@n3.example/return' },
    { ...valid, description: '' },
    { ...valid, description: '🙂'.repeat(129) },
  ];
  for (const candidate of invalid) {
    await assert.rejects(() => yk.createPayment(candidate), YooKassaInputError);
  }
  assert.equal(calls, 0);
});

test('getPayment makes an authenticated GET and returns authoritative normalized facts', async () => {
  let seen;
  const yk = adapter(async (url, options) => {
    seen = { url, options };
    return jsonResponse(paymentRaw());
  });
  const result = await yk.getPayment(PAYMENT);
  assert.deepEqual(result, {
    id: PAYMENT,
    status: 'succeeded',
    amountMinor: 199000,
    currency: 'RUB',
    recipientAccountId: SHOP,
    test: true,
    paid: true,
    refundable: true,
    orderId: ORDER,
    confirmationUrl: null,
    paidAt: PAID_AT,
  });
  assert.equal(seen.url, `https://api.yookassa.ru/v3/payments/${PAYMENT}`);
  assert.equal(seen.options.method, 'GET');
  assert.equal(seen.options.redirect, 'error');
  assert.equal(seen.options.headers['idempotence-key'], undefined);
  assert.equal(seen.options.headers['content-type'], undefined);
  assert.equal(seen.options.body, undefined);
});

test('getPayment rejects wrong id, amount, currency, account, mode, status, and timestamp', async () => {
  const cases = [
    paymentRaw({ id: OTHER_PAYMENT }),
    paymentRaw({ amount: { value: '1990.001' } }),
    paymentRaw({ amount: { currency: 'USD' } }),
    paymentRaw({ recipient: { account_id: '999999' } }),
    paymentRaw({ test: false }),
    paymentRaw({ status: 'unknown' }),
    paymentRaw({ captured_at: 'not-a-date' }),
    paymentRaw({ captured_at: '2026-02-30T08:53:12Z' }),
  ];
  for (const raw of cases) {
    await assert.rejects(() => adapter(async () => jsonResponse(raw)).getPayment(PAYMENT),
      YooKassaVerificationError);
  }
});

test('verifyNotification ignores all events except succeeded without contacting YooKassa', async () => {
  let calls = 0;
  const yk = adapter(async () => { calls += 1; return jsonResponse(paymentRaw()); });
  assert.equal(await yk.verifyNotification(notification('payment.canceled', paymentRaw())), null);
  assert.equal(await yk.verifyNotification(notification('refund.pending', refundRaw())), null);
  assert.equal(await yk.verifyNotification(notification('something.unknown', {})), null);
  assert.equal(calls, 0);
});

test('payment.succeeded is accepted only after authenticated read-back and exact comparison', async () => {
  const calls = [];
  const remote = paymentRaw();
  const yk = adapter(async (url, options) => {
    calls.push({ url, options });
    return jsonResponse(remote);
  });
  const result = await yk.verifyNotification(Buffer.from(notification('payment.succeeded', remote)));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.yookassa.ru/v3/payments/${PAYMENT}`);
  assert.equal(result.event, 'payment.succeeded');
  assert.equal(result.objectId, PAYMENT);
  assert.deepEqual(result.payment, await adapter(async () => jsonResponse(remote)).getPayment(PAYMENT));
  assert.equal(result.refund, null);
});

test('payment notification rejects forged or mismatched provider facts', async () => {
  const mismatchClaims = [
    paymentRaw({ amount: { value: '1.00' } }),
    paymentRaw({ status: 'canceled', paid: false }),
    paymentRaw({ recipient: { account_id: '999999' } }),
    paymentRaw({ test: false }),
    paymentRaw({ amount: { currency: 'USD' } }),
    paymentRaw({ metadata: { order_id: '22222222-2222-4222-8222-222222222222' } }),
    paymentRaw({ captured_at: '2026-09-09T08:53:13.123Z' }),
  ];
  for (const claimed of mismatchClaims) {
    const yk = adapter(async () => jsonResponse(paymentRaw()));
    await assert.rejects(() => yk.verifyNotification(notification('payment.succeeded', claimed)),
      YooKassaVerificationError);
  }
  const forged = adapter(async () => jsonResponse(paymentRaw({ id: OTHER_PAYMENT })));
  await assert.rejects(() => forged.verifyNotification(notification(
    'payment.succeeded', paymentRaw())), YooKassaVerificationError);
});

test('refund.succeeded verifies refund and then its originating succeeded payment', async () => {
  const calls = [];
  const refund = refundRaw();
  const payment = paymentRaw();
  const yk = adapter(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/refunds/${REFUND}`)) return jsonResponse(refund);
    if (url.endsWith(`/payments/${PAYMENT}`)) return jsonResponse(payment);
    assert.fail(`unexpected URL ${url}`);
  });
  const result = await yk.verifyNotification(notification('refund.succeeded', refund));
  assert.deepEqual(calls.map(({ url }) => url), [
    `https://api.yookassa.ru/v3/refunds/${REFUND}`,
    `https://api.yookassa.ru/v3/payments/${PAYMENT}`,
  ]);
  assert.deepEqual(result.refund, {
    id: REFUND,
    status: 'succeeded',
    amountMinor: 99000,
    currency: 'RUB',
    paymentId: PAYMENT,
    refundedAt: REFUNDED_AT,
  });
  assert.equal(result.payment.id, PAYMENT);
  assert.equal(result.payment.orderId, ORDER);
  assert.equal(result.payment.paidAt, PAID_AT);
});

test('refund notification rejects refund mismatches and an unverified originating payment', async () => {
  const claims = [
    refundRaw({ amount: { value: '1.00' } }),
    refundRaw({ amount: { currency: 'USD' } }),
    refundRaw({ status: 'canceled' }),
    refundRaw({ payment_id: OTHER_PAYMENT }),
    refundRaw({ created_at: '2026-09-09T09:00:01.456Z' }),
  ];
  for (const claimed of claims) {
    const yk = adapter(async (url) => url.includes('/refunds/')
      ? jsonResponse(refundRaw()) : jsonResponse(paymentRaw()));
    await assert.rejects(() => yk.verifyNotification(notification('refund.succeeded', claimed)),
      YooKassaVerificationError);
  }

  const badPayments = [
    paymentRaw({ status: 'canceled', paid: false, captured_at: undefined }),
    paymentRaw({ recipient: { account_id: '999999' } }),
    paymentRaw({ test: false }),
    paymentRaw({ amount: { currency: 'USD' } }),
    paymentRaw({ amount: { value: '100.00' } }),
    paymentRaw({ metadata: null }),
  ];
  for (const payment of badPayments) {
    const yk = adapter(async (url) => url.includes('/refunds/')
      ? jsonResponse(refundRaw()) : jsonResponse(payment));
    await assert.rejects(() => yk.verifyNotification(notification(
      'refund.succeeded', refundRaw())), YooKassaVerificationError);
  }
});

test('notification body is raw, valid JSON, object-shaped, nonempty, and bounded', async () => {
  const yk = adapter(async () => jsonResponse(paymentRaw()));
  for (const body of [undefined, null, {}, '', '[]', '{']) {
    await assert.rejects(() => yk.verifyNotification(body), YooKassaInputError);
  }
  await assert.rejects(() => yk.verifyNotification(' '.repeat(65 * 1024)), YooKassaInputError);
  await assert.rejects(() => yk.verifyNotification(JSON.stringify({
    type: 'wrong', event: 'payment.succeeded', object: paymentRaw(),
  })), YooKassaVerificationError);
});

test('transport fails closed on timeout, network error, redirect, HTTP error, and non-JSON', async () => {
  await rejectsCode(() => adapter(async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('simulated', 'TimeoutError');
  }).getPayment(PAYMENT), YooKassaProviderError, 'timeout');

  await rejectsCode(() => adapter(async () => {
    throw new Error(`network ${SECRET}`);
  }).getPayment(PAYMENT), YooKassaProviderError, 'network_error');

  await rejectsCode(() => adapter(async () => ({ ok: true, redirected: true }))
    .getPayment(PAYMENT), YooKassaProviderError, 'invalid_response');

  await assert.rejects(() => adapter(async () => new Response(
    JSON.stringify({ description: `leak ${SECRET}` }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  )).getPayment(PAYMENT), (error) => {
    assert.ok(error instanceof YooKassaProviderError);
    assert.equal(error.code, 'http_error');
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, new RegExp(SECRET));
    return true;
  });

  await rejectsCode(() => adapter(async () => new Response('<html>bad</html>', {
    headers: { 'content-type': 'text/html' },
  })).getPayment(PAYMENT), YooKassaProviderError, 'non_json');
  await rejectsCode(() => adapter(async () => new Response('{', {
    headers: { 'content-type': 'application/json' },
  })).getPayment(PAYMENT), YooKassaProviderError, 'invalid_json');
});

test('provider response body is bounded by declared and actual bytes', async () => {
  await rejectsCode(() => adapter(async () => new Response('{}', {
    headers: { 'content-type': 'application/json', 'content-length': `${65 * 1024}` },
  })).getPayment(PAYMENT), YooKassaProviderError, 'body_too_large');

  await rejectsCode(() => adapter(async () => new Response(JSON.stringify({
    padding: 'x'.repeat(65 * 1024),
  }), { headers: { 'content-type': 'application/json' } })).getPayment(PAYMENT),
  YooKassaProviderError, 'body_too_large');
});
