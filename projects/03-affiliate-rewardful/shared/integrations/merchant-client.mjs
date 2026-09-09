const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 8_000;
const ROUTES = Object.freeze({ customer: '/api/integration/customers', checkout: '/api/integration/checkout', order: '/api/integration/order' });

export class ReferralMerchantError extends Error {
  constructor(message, status = 503, code = 'REFERRAL_CLIENT_ERROR') {
    super(message); this.name = 'ReferralMerchantError'; this.status = status; this.code = code;
  }
}

function exactObject(input, required, optional = []) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError('Input must be a plain object.');
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(input).some(key => !allowed.has(key)) || required.some(key => !Object.hasOwn(input, key))) {
    throw new TypeError('Input fields do not match the referral API contract.');
  }
}

function text(value, name, maximum) {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.trim() !== value) {
    throw new TypeError(`${name} is invalid.`);
  }
  return value;
}

function customerInput(input) {
  exactObject(input, ['customerId', 'email', 'emailVerified'], ['visitToken', 'promoCode']);
  if (input.emailVerified !== true) throw new TypeError('emailVerified must be true after merchant verification.');
  const result = { customerId: text(input.customerId, 'customerId', 160), email: text(input.email, 'email', 254), emailVerified: true };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new TypeError('email is invalid.');
  if (input.visitToken !== undefined) {
    if (!TOKEN.test(input.visitToken)) throw new TypeError('visitToken is invalid.');
    result.visitToken = input.visitToken;
  }
  if (input.promoCode !== undefined) result.promoCode = text(input.promoCode, 'promoCode', 64);
  return result;
}

function checkoutInput(input) {
  exactObject(input, ['customerId', 'amountMinor', 'idempotencyKey']);
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1 || input.amountMinor > 100_000_000) {
    throw new TypeError('amountMinor is invalid.');
  }
  return { customerId: text(input.customerId, 'customerId', 160), amountMinor: input.amountMinor,
    idempotencyKey: text(input.idempotencyKey, 'idempotencyKey', 160) };
}

async function responseText(response) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new ReferralMerchantError('N3 response exceeded the client limit.', 503, 'RESPONSE_LIMIT');
  }
  if (!response.body?.getReader) {
    const value = await response.text();
    if (Buffer.byteLength(value, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new ReferralMerchantError('N3 response exceeded the client limit.', 503, 'RESPONSE_LIMIT');
    }
    return value;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '', total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ReferralMerchantError('N3 response exceeded the client limit.', 503, 'RESPONSE_LIMIT');
    }
    result += decoder.decode(value, { stream: true });
  }
  return result + decoder.decode();
}

function safeApiMessage(payload, secret) {
  const message = typeof payload?.error?.message === 'string' ? payload.error.message : 'N3 rejected the referral request.';
  return message.split(secret).join('[redacted]').slice(0, 500);
}

export function createReferralMerchantClient({ baseUrl, secret, mode = 'production', fetch: fetchImpl = globalThis.fetch }) {
  if (!['production', 'isolated-test'].includes(mode)) throw new TypeError('mode must be production or isolated-test.');
  if (!TOKEN.test(secret ?? '')) throw new TypeError('A valid N3 connector secret is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required.');
  let base;
  try { base = new URL(baseUrl); } catch { throw new TypeError('A valid N3 baseUrl is required.'); }
  const loopback = base.hostname === '127.0.0.1' || base.hostname === '[::1]';
  const transportAllowed = base.protocol === 'https:' || (mode === 'isolated-test' && base.protocol === 'http:' && loopback);
  if (!transportAllowed || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new TypeError('N3 baseUrl must be an HTTPS origin (HTTP loopback is isolated-test only).');
  }

  async function call(route, input, { signal } = {}) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await fetchImpl(new URL(ROUTES[route], base), {
        method: 'POST', redirect: 'error', signal: requestSignal,
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ReferralMerchantError('N3 referral service could not be reached.', 503, 'NETWORK');
    }
    let payload;
    try { payload = JSON.parse(await responseText(response)); }
    catch (error) {
      if (error instanceof ReferralMerchantError) throw error;
      throw new ReferralMerchantError('N3 returned an invalid response.', 503, 'INVALID_RESPONSE');
    }
    if (!response.ok) throw new ReferralMerchantError(safeApiMessage(payload, secret), response.status,
      typeof payload?.error?.code === 'string' ? payload.error.code : 'REQUEST_FAILED');
    if (!payload || !Object.hasOwn(payload, 'data')) {
      throw new ReferralMerchantError('N3 returned an invalid response.', 503, 'INVALID_RESPONSE');
    }
    return payload.data;
  }

  return Object.freeze({
    bindCustomer(input, options) { return call('customer', customerInput(input), options); },
    createCheckout(input, options) { return call('checkout', checkoutInput(input), options); },
    getOrder(input, options) {
      exactObject(input, ['orderId']);
      return call('order', { orderId: text(input.orderId, 'orderId', 160) }, options);
    },
  });
}

export function referralTokenFromCookie(cookieHeader, tenantId, { now = Date.now() } = {}) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 8192 || !UUID.test(tenantId ?? '')
    || !Number.isSafeInteger(now)) return undefined;
  const name = `n3_ref_${tenantId}`;
  const matches = cookieHeader.split(';').map(part => part.trim()).filter(part => part.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(name.length + 1);
  const dot = value.lastIndexOf('.');
  const token = value.slice(0, dot), expiry = Number(value.slice(dot + 1));
  if (!TOKEN.test(token) || !Number.isSafeInteger(expiry) || expiry <= now) return undefined;
  return token;
}
