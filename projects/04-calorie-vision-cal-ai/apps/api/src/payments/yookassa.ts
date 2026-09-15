// Клиент ЮKassa.
//
// ПОРТИРОВАНО из `projects/03-affiliate-rewardful/shared/payments/yookassa.mjs` (374 строки,
// JavaScript) с сохранением ВСЕХ проверок и их обоснований — см. `04_reuse-map.md`. Изменено
// только то, что обязано измениться: типы TypeScript, наши классы ошибок и форма результата
// (`PaymentProvider`).
//
// У ЮKassa уведомления НЕ ПОДПИСАНЫ. Подлинность даёт СОЧЕТАНИЕ трёх вещей, и ни одна не
// заменяет другие: адрес источника из списка сетей (`origin.ts`), ПЕРЕЗАПРОС статуса по API и
// сверка объекта, заявленного уведомлением, с перезапрошенным. Уведомление — лишь сигнал
// «сходи посмотри», а не источник фактов.

import {
  PaymentProviderUnavailable,
  PaymentVerificationError,
  type CreatePaymentInput,
  type NotificationContext,
  type PaymentProvider,
  type RemotePayment,
  type RemotePaymentStatus,
  type RemoteRefund,
  type VerifiedNotification,
} from './provider.js';
import { verifyYooKassaOrigin } from './origin.js';

const API_BASE = 'https://api.yookassa.ru/v3';
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_PROVIDER_BODY_BYTES = 64 * 1024;
const MAX_NOTIFICATION_BYTES = 64 * 1024;

const PAYMENT_STATUSES: ReadonlySet<string> = new Set(['pending', 'waiting_for_capture', 'succeeded', 'canceled']);
const PROVIDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function verify(condition: boolean, message: string): asserts condition {
  if (!condition) throw new PaymentVerificationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Копейки → строка вида «970.00». Провайдер принимает ТОЧНУЮ десятичную строку, не число:
 * число с плавающей точкой дало бы «969.9999999999999». */
function formatMinor(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new PaymentVerificationError('сумма обязана быть положительным целым числом копеек');
  }
  return `${Math.floor(amountMinor / 100)}.${String(amountMinor % 100).padStart(2, '0')}`;
}

/** Строка провайдера → копейки. Разбор через `Number` целиком запрещён: «970.10» в double
 * не равно 97010 копейкам после умножения. */
function parseRubAmount(amount: unknown, label: string): number {
  verify(isRecord(amount), `${label} отсутствует`);
  verify(amount.currency === 'RUB', `${label}.currency обязан быть RUB`);
  verify(typeof amount.value === 'string' && /^(?:0|[1-9]\d*)\.\d{2}$/.test(amount.value), `${label}.value не точная десятичная строка`);
  const [major, minor] = (amount.value as string).split('.');
  const value = Number(major) * 100 + Number(minor);
  verify(Number.isSafeInteger(value) && value > 0, `${label}.value вне диапазона`);
  return value;
}

function providerTimestamp(value: unknown, label: string, optional = false): string | null {
  if (optional && value === undefined) return null;
  const ok = typeof value === 'string' && value.length <= 64
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
  verify(ok, `${label} не является меткой времени провайдера`);
  return value as string;
}

function httpsUrl(value: unknown, label: string): string {
  verify(typeof value === 'string' && value.length <= 2048, `${label} отсутствует или слишком длинный`);
  let url: URL;
  try {
    url = new URL(value as string);
  } catch {
    throw new PaymentVerificationError(`${label} не разбирается как адрес`);
  }
  // Учётные данные в адресе — способ увести редирект на чужой хост.
  verify(url.protocol === 'https:' && url.username === '' && url.password === '', `${label} обязан быть HTTPS без учётных данных`);
  return url.toString();
}

export interface YooKassaOptions {
  readonly shopId: string;
  readonly secretKey: string;
  readonly testMode: boolean;
  readonly fetchImpl?: typeof globalThis.fetch;
}

export function createYooKassaProvider(options: YooKassaOptions): PaymentProvider {
  const { shopId, secretKey, testMode, fetchImpl = globalThis.fetch } = options;
  if (!/^[0-9]{1,64}$/.test(shopId)) throw new Error('YOOKASSA_SHOP_ID обязан быть десятичным идентификатором магазина');
  if (secretKey.length === 0 || secretKey.length > 512) throw new Error('YOOKASSA_SECRET_KEY не задан или неправдоподобно длинный');
  const authorization = `Basic ${Buffer.from(`${shopId}:${secretKey}`, 'utf8').toString('base64')}`;

  async function request(path: string, init: { method?: string; body?: unknown; idempotenceKey?: string } = {}): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { accept: 'application/json', authorization };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.idempotenceKey !== undefined) headers['idempotence-key'] = init.idempotenceKey;
    let response: Response;
    try {
      response = await fetchImpl(`${API_BASE}${path}`, {
        method: init.method ?? 'GET',
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        // Редирект от платёжного API — либо подмена, либо сбой; следовать ему нельзя.
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const name = (error as Error).name;
      // Таймаут и сетевой сбой — НЕДОСТУПНОСТЬ, то есть исключение, откатывающее транзакцию.
      throw new PaymentProviderUnavailable(name === 'TimeoutError' || name === 'AbortError' ? 'таймаут' : 'сетевой сбой');
    }
    if (response.redirected) throw new PaymentProviderUnavailable('ответ перенаправлен');
    if (!response.ok) throw new PaymentProviderUnavailable(`http ${response.status}`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw new PaymentProviderUnavailable('ответ не JSON');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_PROVIDER_BODY_BYTES)) {
      throw new PaymentProviderUnavailable('тело ответа превышает предел');
    }
    const text = await response.text();
    if (text.length > MAX_PROVIDER_BODY_BYTES) throw new PaymentProviderUnavailable('тело ответа превышает предел');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PaymentProviderUnavailable('ответ не разбирается как JSON');
    }
    if (!isRecord(parsed)) throw new PaymentProviderUnavailable('ответ не объект');
    return parsed;
  }

  function normalizePayment(raw: unknown, expectedId: string | null): RemotePayment {
    verify(isRecord(raw), 'платёж не объект');
    const id = raw.id;
    verify(typeof id === 'string' && PROVIDER_ID.test(id), 'payment.id недействителен');
    if (expectedId !== null) verify(id === expectedId, 'payment.id не совпадает с запрошенным');
    verify(typeof raw.status === 'string' && PAYMENT_STATUSES.has(raw.status), 'payment.status неизвестен');
    const amountMinor = parseRubAmount(raw.amount, 'payment.amount');
    // Чужой магазин не может подсунуть свой платёж как наш.
    verify(isRecord(raw.recipient) && raw.recipient.account_id === shopId, 'payment.recipient.account_id не наш магазин');
    // Боевое уведомление в тестовом режиме (и наоборот) — отказ, а не «наверное, сойдёт».
    verify(raw.test === testMode, 'payment.test не совпадает с настроенным режимом');
    verify(typeof raw.paid === 'boolean', 'payment.paid недействителен');

    const metadata = isRecord(raw.metadata) ? raw.metadata : {};
    let orderId: string | null = null;
    if (metadata.order_id !== undefined) {
      verify(typeof metadata.order_id === 'string' && UUID_V4.test(metadata.order_id), 'payment.metadata.order_id не канонический UUID');
      orderId = metadata.order_id;
    }
    const confirmation = isRecord(raw.confirmation) ? raw.confirmation : {};
    const confirmationUrl = confirmation.confirmation_url === undefined
      ? null
      : httpsUrl(confirmation.confirmation_url, 'payment.confirmation.confirmation_url');

    // Удержание провайдера: ЮKassa отдаёт его в income_amount (сколько РЕАЛЬНО зачислено).
    // Нет поля — `null`, и вызывающий обязан отказаться начислять, а не вычислять сам (ADR-011).
    const incomeMinor = raw.income_amount === undefined ? null : parseRubAmount(raw.income_amount, 'payment.income_amount');

    return Object.freeze({
      id,
      status: raw.status as RemotePaymentStatus,
      amountMinor,
      feeMinor: incomeMinor === null ? null : amountMinor - incomeMinor,
      currency: 'RUB' as const,
      orderId,
      paid: raw.paid,
      confirmationUrl,
      paidAt: providerTimestamp(raw.captured_at, 'payment.captured_at', true),
    });
  }

  function normalizeRefund(raw: unknown, expectedId: string | null): RemoteRefund {
    verify(isRecord(raw), 'возврат не объект');
    const id = raw.id;
    verify(typeof id === 'string' && PROVIDER_ID.test(id), 'refund.id недействителен');
    if (expectedId !== null) verify(id === expectedId, 'refund.id не совпадает с запрошенным');
    verify(raw.status === 'succeeded', 'refund.status не succeeded');
    const paymentId = raw.payment_id;
    verify(typeof paymentId === 'string' && PROVIDER_ID.test(paymentId), 'refund.payment_id недействителен');
    return Object.freeze({
      id,
      amountMinor: parseRubAmount(raw.amount, 'refund.amount'),
      paymentId,
      refundedAt: providerTimestamp(raw.created_at, 'refund.created_at') as string,
    });
  }

  /** Сверка ЗАЯВЛЕННОГО уведомлением с ПЕРЕЗАПРОШЕННЫМ. Расхождение означает, что уведомление
   * описывает не тот объект, который есть у провайдера, — то есть подделку или рассинхрон. */
  function samePaymentClaim(claimed: RemotePayment, remote: RemotePayment): boolean {
    return claimed.id === remote.id && claimed.status === remote.status
      && claimed.amountMinor === remote.amountMinor && claimed.currency === remote.currency
      && claimed.paid === remote.paid && claimed.orderId === remote.orderId
      && claimed.paidAt === remote.paidAt;
  }

  async function getPayment(id: string): Promise<RemotePayment> {
    verify(PROVIDER_ID.test(id), 'идентификатор платежа недействителен');
    return normalizePayment(await request(`/payments/${encodeURIComponent(id)}`), id);
  }

  return Object.freeze({
    name: 'yookassa',

    async createPayment(input: CreatePaymentInput): Promise<RemotePayment> {
      verify(UUID_V4.test(input.orderId), 'orderId обязан быть каноническим UUID');
      const value = formatMinor(input.amountMinor);
      const returnUrl = httpsUrl(input.returnUrl, 'returnUrl');
      verify(input.description.length > 0 && Array.from(input.description).length <= 128, 'описание обязано быть 1–128 символов');
      const raw = await request('/payments', {
        method: 'POST',
        // Ключ идемпотентности — НАШ orderId: повтор запроса не создаёт второй платёж.
        idempotenceKey: input.orderId,
        body: {
          amount: { value, currency: 'RUB' },
          capture: true,
          confirmation: { type: 'redirect', return_url: returnUrl },
          description: input.description,
          metadata: { order_id: input.orderId },
        },
      });
      const payment = normalizePayment(raw, null);
      verify(payment.orderId === input.orderId, 'созданный платёж не привязан к нашему заказу');
      verify(payment.amountMinor === input.amountMinor, 'сумма созданного платежа не совпадает');
      verify(payment.confirmationUrl !== null, 'созданный платёж без адреса формы оплаты');
      return payment;
    },

    getPayment,

    async verifyNotification(context: NotificationContext): Promise<VerifiedNotification> {
      // ШАГ 1: адрес источника. Сам по себе не доказательство, но отсекает шум до любых запросов.
      const origin = verifyYooKassaOrigin(context.sourceIp);
      if (!origin.ok) throw new PaymentVerificationError(`адрес источника отвергнут: ${origin.reason}`);

      // ШАГ 2: разбор ИЗ СЫРЫХ БАЙТ. Разбор и повторная сборка меняют байты, и если завтра
      // появится подпись, считать её будет уже не от чего.
      verify(context.rawBody.byteLength > 0 && context.rawBody.byteLength <= MAX_NOTIFICATION_BYTES, 'тело уведомления пусто или превышает предел');
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(context.rawBody).toString('utf8'));
      } catch {
        throw new PaymentVerificationError('тело уведомления не разбирается как JSON');
      }
      verify(isRecord(parsed), 'тело уведомления не объект');
      const event = parsed.event;
      if (event !== 'payment.succeeded' && event !== 'refund.succeeded') {
        // Событие, которое нас не касается: 200 и НИЧЕГО не менять. Отказ заставил бы
        // провайдера ретраить то, что мы игнорируем сознательно.
        return { kind: 'ignored', event: typeof event === 'string' ? event : 'unknown' };
      }
      verify(parsed.type === 'notification', 'notification.type недействителен');
      verify(isRecord(parsed.object), 'notification.object недействителен');
      const objectId = (parsed.object as Record<string, unknown>).id;
      verify(typeof objectId === 'string' && PROVIDER_ID.test(objectId), 'notification.object.id недействителен');

      // ШАГ 3: ПЕРЕЗАПРОС у провайдера — единственный источник фактов.
      if (event === 'payment.succeeded') {
        const payment = await getPayment(objectId);
        const claimed = normalizePayment(parsed.object, objectId);
        verify(payment.status === 'succeeded' && payment.paid, 'провайдер не подтвердил успешный платёж');
        verify(payment.paidAt !== null, 'у успешного платежа нет метки времени провайдера');
        verify(payment.orderId !== null, 'платёж не привязан к заказу');
        verify(samePaymentClaim(claimed, payment), 'уведомление не совпадает с данными провайдера');
        return { kind: 'payment_succeeded', payment };
      }

      const refundRaw = await request(`/refunds/${encodeURIComponent(objectId)}`);
      const refund = normalizeRefund(refundRaw, objectId);
      const claimedRefund = normalizeRefund(parsed.object, objectId);
      verify(claimedRefund.amountMinor === refund.amountMinor && claimedRefund.paymentId === refund.paymentId, 'уведомление о возврате не совпадает с данными провайдера');
      const payment = await getPayment(refund.paymentId);
      verify(payment.status === 'succeeded' && payment.paid, 'исходный платёж не успешен');
      verify(refund.amountMinor <= payment.amountMinor, 'сумма возврата превышает исходный платёж');
      return { kind: 'refund_succeeded', payment, refund };
    },
  });
}
