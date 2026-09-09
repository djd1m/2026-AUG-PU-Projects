const API_BASE = 'https://api.yookassa.ru/v3';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_BODY_BYTES = 64 * 1024;
const MAX_NOTIFICATION_BYTES = 64 * 1024;
const RUB = 'RUB';

const PAYMENT_STATUSES = new Set(['pending', 'waiting_for_capture', 'succeeded', 'canceled']);
const REFUND_STATUSES = new Set(['pending', 'succeeded', 'canceled']);
const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class YooKassaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class YooKassaConfigError extends YooKassaError {}
export class YooKassaInputError extends YooKassaError {}
export class YooKassaProviderError extends YooKassaError {
  constructor(message, code, status = null) {
    super(message, code);
    this.status = status;
  }
}
export class YooKassaVerificationError extends YooKassaError {}

function config(condition, message) {
  if (!condition) throw new YooKassaConfigError(message, 'invalid_config');
}

function input(condition, message) {
  if (!condition) throw new YooKassaInputError(message, 'invalid_input');
}

function verification(condition, message) {
  if (!condition) throw new YooKassaVerificationError(message, 'verification_failed');
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireProviderId(value, label, ErrorClass = YooKassaInputError) {
  if (typeof value !== 'string' || !PROVIDER_ID.test(value)) {
    throw new ErrorClass(`${label} is invalid`,
      ErrorClass === YooKassaVerificationError ? 'verification_failed' : 'invalid_input');
  }
  return value;
}

function requireOrderId(value, label = 'orderId', ErrorClass = YooKassaInputError) {
  if (typeof value !== 'string' || !ORDER_ID.test(value)) {
    throw new ErrorClass(`${label} must be a canonical UUID`,
      ErrorClass === YooKassaVerificationError ? 'verification_failed' : 'invalid_input');
  }
  return value;
}

function providerTimestamp(value, label, { optional = false } = {}) {
  if (optional && value === undefined) return null;
  const match = typeof value === 'string' && value.length <= 64
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value)
    : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const lastDay = month >= 1 && month <= 12
    ? new Date(Date.UTC(year, month, 0)).getUTCDate()
    : 0;
  verification(match !== null && month >= 1 && month <= 12 && day >= 1 && day <= lastDay
    && Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59
    && Number.isFinite(Date.parse(value)), `${label} is not a valid provider timestamp`);
  return value;
}

function formatMinor(amountMinor) {
  input(Number.isSafeInteger(amountMinor) && amountMinor > 0,
    'amountMinor must be a positive safe integer');
  const major = Math.floor(amountMinor / 100);
  const minor = amountMinor % 100;
  return `${major}.${String(minor).padStart(2, '0')}`;
}

function parseRubAmount(amount, label) {
  verification(isRecord(amount), `${label} is missing`);
  verification(amount.currency === RUB, `${label}.currency must be RUB`);
  verification(typeof amount.value === 'string' && /^(?:0|[1-9]\d*)\.\d{2}$/.test(amount.value),
    `${label}.value must be an exact decimal string`);
  const [major, minor] = amount.value.split('.');
  const value = Number(major) * 100 + Number(minor);
  verification(Number.isSafeInteger(value) && value > 0, `${label}.value is out of range`);
  return value;
}

function safeHttpsUrl(value, label) {
  input(typeof value === 'string' && value.length <= 2_048, `${label} must be a bounded HTTPS URL`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new YooKassaInputError(`${label} must be a bounded HTTPS URL`, 'invalid_input');
  }
  input(url.protocol === 'https:' && url.username === '' && url.password === '',
    `${label} must be an HTTPS URL without credentials`);
  return url.toString();
}

function providerHttpsUrl(value, label) {
  verification(typeof value === 'string' && value.length <= 2_048,
    `${label} is missing or invalid`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new YooKassaVerificationError(`${label} is missing or invalid`, 'verification_failed');
  }
  verification(url.protocol === 'https:' && url.username === '' && url.password === '',
    `${label} is missing or invalid`);
  return url.toString();
}

async function readBoundedJson(response) {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new YooKassaProviderError('YooKassa returned a non-JSON response', 'non_json');
  }
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_PROVIDER_BODY_BYTES)) {
    throw new YooKassaProviderError('YooKassa response body exceeds the limit', 'body_too_large');
  }
  if (!response.body?.getReader) {
    throw new YooKassaProviderError('YooKassa returned an empty response', 'invalid_json');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_BODY_BYTES) {
        await reader.cancel();
        throw new YooKassaProviderError('YooKassa response body exceeds the limit', 'body_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof YooKassaProviderError) throw error;
    throw new YooKassaProviderError('YooKassa response body could not be read', 'invalid_json');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new YooKassaProviderError('YooKassa returned invalid JSON', 'invalid_json');
  }
  if (!isRecord(parsed)) {
    throw new YooKassaProviderError('YooKassa returned an invalid object', 'invalid_json');
  }
  return parsed;
}

function normalizePayment(raw, expectedId, shopId, testMode) {
  verification(isRecord(raw), 'payment is not an object');
  const id = requireProviderId(raw.id, 'payment.id', YooKassaVerificationError);
  if (expectedId !== null) verification(id === expectedId, 'payment.id does not match the request');
  verification(PAYMENT_STATUSES.has(raw.status), 'payment.status is unknown');
  const amountMinor = parseRubAmount(raw.amount, 'payment.amount');
  verification(isRecord(raw.recipient) && raw.recipient.account_id === shopId,
    'payment.recipient.account_id does not match this shop');
  verification(raw.test === testMode, 'payment.test does not match configured mode');
  verification(typeof raw.paid === 'boolean', 'payment.paid is invalid');
  verification(typeof raw.refundable === 'boolean', 'payment.refundable is invalid');

  let orderId = null;
  if (raw.metadata?.order_id !== undefined) {
    orderId = requireOrderId(raw.metadata.order_id, 'payment.metadata.order_id',
      YooKassaVerificationError);
  }
  const confirmationUrl = raw.confirmation?.confirmation_url === undefined
    ? null
    : providerHttpsUrl(raw.confirmation.confirmation_url, 'payment.confirmation.confirmation_url');
  const paidAt = providerTimestamp(raw.captured_at, 'payment.captured_at', { optional: true });

  return Object.freeze({
    id,
    status: raw.status,
    amountMinor,
    currency: RUB,
    recipientAccountId: shopId,
    test: raw.test,
    paid: raw.paid,
    refundable: raw.refundable,
    orderId,
    confirmationUrl,
    paidAt,
  });
}

function normalizeRefund(raw, expectedId) {
  verification(isRecord(raw), 'refund is not an object');
  const id = requireProviderId(raw.id, 'refund.id', YooKassaVerificationError);
  if (expectedId !== null) verification(id === expectedId, 'refund.id does not match the request');
  verification(REFUND_STATUSES.has(raw.status), 'refund.status is unknown');
  const amountMinor = parseRubAmount(raw.amount, 'refund.amount');
  const paymentId = requireProviderId(raw.payment_id, 'refund.payment_id',
    YooKassaVerificationError);
  const refundedAt = providerTimestamp(raw.created_at, 'refund.created_at');
  return Object.freeze({ id, status: raw.status, amountMinor, currency: RUB, paymentId, refundedAt });
}

function samePaymentClaim(claimed, remote) {
  return claimed.id === remote.id
    && claimed.status === remote.status
    && claimed.amountMinor === remote.amountMinor
    && claimed.currency === remote.currency
    && claimed.recipientAccountId === remote.recipientAccountId
    && claimed.test === remote.test
    && claimed.paid === remote.paid
    && claimed.orderId === remote.orderId
    && claimed.paidAt === remote.paidAt;
}

function sameRefundClaim(claimed, remote) {
  return claimed.id === remote.id
    && claimed.status === remote.status
    && claimed.amountMinor === remote.amountMinor
    && claimed.currency === remote.currency
    && claimed.paymentId === remote.paymentId
    && claimed.refundedAt === remote.refundedAt;
}

function parseNotification(body) {
  let bytes;
  if (typeof body === 'string') bytes = Buffer.from(body, 'utf8');
  else if (Buffer.isBuffer(body) || body instanceof Uint8Array) bytes = body;
  else throw new YooKassaInputError('notification body must be raw bytes or a string', 'invalid_input');
  input(bytes.byteLength > 0 && bytes.byteLength <= MAX_NOTIFICATION_BYTES,
    'notification body is empty or exceeds the limit');
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new YooKassaInputError('notification body is invalid JSON', 'invalid_input');
  }
  input(isRecord(parsed), 'notification body must contain an object');
  return parsed;
}

export function createYooKassa(options) {
  config(isRecord(options), 'YooKassa configuration is required');
  const { shopId, secretKey, testMode, fetchImpl = globalThis.fetch } = options;
  config(typeof shopId === 'string' && /^[0-9]{1,64}$/.test(shopId),
    'shopId must be a nonempty decimal YooKassa shop identifier');
  config(typeof secretKey === 'string' && secretKey.length > 0 && secretKey.length <= 512,
    'secretKey must be configured and bounded');
  config(typeof testMode === 'boolean', 'testMode must be an explicit boolean');
  config(typeof fetchImpl === 'function', 'fetchImpl must be available');

  const authorization = `Basic ${Buffer.from(`${shopId}:${secretKey}`, 'utf8').toString('base64')}`;

  async function request(path, { method = 'GET', body = undefined, idempotenceKey = undefined } = {}) {
    const url = `${API_BASE}${path}`;
    const headers = { accept: 'application/json', authorization };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (idempotenceKey !== undefined) headers['idempotence-key'] = idempotenceKey;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timeout = error?.name === 'AbortError' || error?.name === 'TimeoutError';
      throw new YooKassaProviderError(
        timeout ? 'YooKassa request timed out' : 'YooKassa request failed',
        timeout ? 'timeout' : 'network_error',
      );
    }
    if (!response || typeof response.ok !== 'boolean' || response.redirected === true) {
      throw new YooKassaProviderError('YooKassa returned an invalid or redirected response',
        'invalid_response');
    }
    if (!response.ok) {
      const status = Number.isInteger(response.status) ? response.status : null;
      throw new YooKassaProviderError('YooKassa rejected the request', 'http_error', status);
    }
    return readBoundedJson(response);
  }

  async function createPayment({ orderId, amountMinor, returnUrl, description } = {}) {
    const stableOrderId = requireOrderId(orderId);
    const value = formatMinor(amountMinor);
    const safeReturnUrl = safeHttpsUrl(returnUrl, 'returnUrl');
    input(typeof description === 'string' && description.length > 0
      && Array.from(description).length <= 128, 'description must contain 1-128 characters');
    const raw = await request('/payments', {
      method: 'POST',
      idempotenceKey: stableOrderId,
      body: {
        amount: { value, currency: RUB },
        capture: true,
        confirmation: { type: 'redirect', return_url: safeReturnUrl },
        description,
        metadata: { order_id: stableOrderId },
      },
    });
    const payment = normalizePayment(raw, null, shopId, testMode);
    verification(payment.orderId === stableOrderId, 'created payment order id does not match');
    verification(payment.amountMinor === amountMinor, 'created payment amount does not match');
    verification(payment.confirmationUrl !== null, 'created payment has no confirmation URL');
    return payment;
  }

  async function getPayment(id) {
    const paymentId = requireProviderId(id, 'payment id');
    const raw = await request(`/payments/${encodeURIComponent(paymentId)}`);
    return normalizePayment(raw, paymentId, shopId, testMode);
  }

  async function getRefund(id) {
    const refundId = requireProviderId(id, 'refund id');
    const raw = await request(`/refunds/${encodeURIComponent(refundId)}`);
    return normalizeRefund(raw, refundId);
  }

  async function verifyNotification(body) {
    const notification = parseNotification(body);
    if (notification.event !== 'payment.succeeded' && notification.event !== 'refund.succeeded') {
      return null;
    }
    verification(notification.type === 'notification', 'notification.type is invalid');
    verification(isRecord(notification.object), 'notification.object is invalid');
    const objectId = requireProviderId(notification.object.id, 'notification.object.id',
      YooKassaVerificationError);

    if (notification.event === 'payment.succeeded') {
      const payment = await getPayment(objectId);
      const claimed = normalizePayment(notification.object, objectId, shopId, testMode);
      verification(payment.status === 'succeeded' && payment.paid,
        'provider has not confirmed a succeeded payment');
      verification(payment.paidAt !== null, 'succeeded payment has no provider timestamp');
      verification(payment.orderId !== null, 'payment has no order binding');
      verification(samePaymentClaim(claimed, payment), 'notification payment does not match provider');
      return Object.freeze({ event: notification.event, objectId, payment, refund: null });
    }

    const refund = await getRefund(objectId);
    const claimed = normalizeRefund(notification.object, objectId);
    verification(refund.status === 'succeeded', 'provider has not confirmed a succeeded refund');
    verification(sameRefundClaim(claimed, refund), 'notification refund does not match provider');
    const payment = await getPayment(refund.paymentId);
    verification(payment.status === 'succeeded' && payment.paid,
      'originating payment is not succeeded');
    verification(payment.paidAt !== null, 'originating payment has no provider timestamp');
    verification(payment.orderId !== null, 'originating payment has no order binding');
    verification(refund.amountMinor <= payment.amountMinor,
      'refund amount exceeds originating payment amount');
    return Object.freeze({ event: notification.event, objectId, payment, refund });
  }

  return Object.freeze({ createPayment, getPayment, getRefund, verifyNotification });
}
