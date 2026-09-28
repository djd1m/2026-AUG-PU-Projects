// из N6: projects/06-rag-sales-chatbase/apps/web/src/server/billing-handler.ts — адаптировано (фича 30 payments, OWN-019,
// ADR-019): платный план ОДИН, тело оформления — только {idempotency_key}; вход — обвязка N5 (`clientIp` по числу
// доверенных хопов, `allowMutation`/`allowRead`, cookie `__Host-n5_session`); при выключенной оплате ВСЕ маршруты оплаты
// отвечают 404 (AC-1); сеть ЮKassa проверяется в обработчике для ЛЮБОГО провайдера (и ещё раз в адаптере ЮKassa);
// интерес остаётся tRPC `interest.create` N5 — `createInterestHandler` N6 не перенесён.
//
// ПОРЯДОК — это и есть защита (security-operation-order):
//  POST /api/checkout          режим → лимит частоты → Origin → сессия → тело (закрытое: idempotency_key) →
//                              намерение (id ДО провайдера, long-running-job) → платёж у провайдера ВНЕ транзакции.
//  POST /api/webhooks/yookassa режим → сырые байты (≤ 64 КиБ) → адрес источника clientIp(hops) ∈ сети ЮKassa из кода →
//                              подлинность ВНЕ транзакции (ПЕРЕЗАПРОС + сверка) → транзакция (ключ повторности →
//                              блокировка платежа → применение). Недоступность ЮKassa — 503 без единой записи; повтор
//                              проходит полным путём (урок N1: потерянная оплата).
import { createHash } from 'node:crypto';
import type { ApplyPaymentOutcome, CreateIntentResult, IntentView, PaymentEvent } from '@clipmaker/db';
import type { PaymentProviderName } from '@clipmaker/shared/enums';
import { PAID_PLAN_TITLE, PAID_PLAN_DAYS, PAID_PRICE_MINOR, effectivePlan } from '@clipmaker/shared/tariff';
import { readSessionCookie } from './auth-handler';
import { clientIp } from './ip';
import { verifyYooKassaOrigin } from './payments/origin';
import { PaymentProviderUnavailable, PaymentVerificationError, type PaymentProvider } from './payments/provider';

export const MAX_NOTIFICATION_BYTES = 64 * 1024;
const MAX_CHECKOUT_BYTES = 1024;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;
const INTENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAYMENT_DESCRIPTION = `КлипМейкер: тариф ${PAID_PLAN_TITLE} на ${PAID_PLAN_DAYS} дней`;

export interface BillingDependencies {
  publicOrigin: string;
  trustedProxyHops: number;
  authenticate: (token: string) => Promise<{ account_id: string } | null>;
  allowMutation: (ip: string, account?: string) => Promise<boolean>;
  allowRead: (ip: string, account?: string) => Promise<boolean>;
  // null — оплата выключена (N5_PAYMENTS_MODE не задан или off): все маршруты оплаты — 404.
  provider: PaymentProvider | null;
  createIntent: (input: { accountId: string; priceMinor: number; idempotencyKey: string }) => Promise<CreateIntentResult>;
  // false — у намерения уже ДРУГОЙ платёж: второй платёж по одному намерению — отказ, а не молчание.
  setIntentPayment: (intentId: string, providerPaymentId: string) => Promise<boolean>;
  readIntent: (intentId: string, accountId: string) => Promise<IntentView | null>;
  markCanceled: (intentId: string) => Promise<void>;
  applyPayment: (input: PaymentEvent) => Promise<ApplyPaymentOutcome>;
  recordRefund: (input: PaymentEvent) => Promise<ApplyPaymentOutcome>;
  log?: (line: string) => void;
  clock?: () => Date;
}

const json = (payload: object, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
const notFound = () => fail(404, 'not_found', 'Не найдено');
const logOf = (deps: BillingDependencies) => deps.log ?? ((line: string) => console.error(line));
function run(deps: BillingDependencies, what: string, handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((error: unknown) => {
    logOf(deps)(`Оплата: ${what} не выполнено (${error instanceof Error ? error.name : 'ошибка'})`);
    return fail(503, 'unavailable', 'Сервис временно недоступен. Повторите через минуту');
  });
}
const providerName = (provider: PaymentProvider): PaymentProviderName => {
  if (provider.name === 'yookassa' || provider.name === 'fake') return provider.name;
  throw new Error('Неизвестный платёжный провайдер: платёж не записывается');
};

async function readRawBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  return size > 0 ? Buffer.concat(chunks) : null;
}

// Лимит частоты → Origin → сессия. Лимит ДО всего остального: перебор без сессии тоже упирается в него.
async function guardMutation(request: Request, deps: BillingDependencies): Promise<{ accountId: string } | Response> {
  let ip: string;
  try { ip = clientIp(request.headers, deps.trustedProxyHops); } catch { return fail(400, 'no_client_ip', 'Адрес клиента не определён'); }
  const token = readSessionCookie(request);
  const session = token ? await deps.authenticate(token) : null;
  if (!await deps.allowMutation(ip, session?.account_id)) return fail(429, 'rate_limited', 'Слишком много запросов. Повторите через минуту');
  // Деньги создаются только со своей страницы: Origin ОБЯЗАТЕЛЕН и равен публичному (браузер шлёт его на любой POST).
  if (request.headers.get('origin') !== new URL(deps.publicOrigin).origin) return fail(403, 'origin_forbidden', 'Источник запроса не разрешён');
  if (!session) return fail(401, 'unauthorized', 'Войдите, чтобы оплатить тариф');
  return { accountId: session.account_id };
}

// POST /api/checkout { idempotency_key } → 201 { intent_id, redirect_url } — форма оплаты ЮKassa.
export function createCheckoutHandler(deps: BillingDependencies) {
  return (request: Request) => run(deps, 'оформление', async () => {
    const provider = deps.provider;
    if (!provider) return notFound();
    const entry = await guardMutation(request, deps);
    if (entry instanceof Response) return entry;
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return fail(422, 'invalid_body', 'Ожидается JSON');
    const raw = await readRawBody(request, MAX_CHECKOUT_BYTES);
    let body: unknown;
    try { body = raw ? JSON.parse(Buffer.from(raw).toString('utf8')) : null; } catch { body = null; }
    // Закрытое тело: ровно один ключ. Цена и план НЕ читаются из запроса — только из кода (fail-closed-defaults п.3).
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'idempotency_key') {
      return fail(422, 'invalid_body', 'Нужен только ключ повтора idempotency_key');
    }
    const key = (body as { idempotency_key: unknown }).idempotency_key;
    if (typeof key !== 'string' || !IDEMPOTENCY_KEY.test(key)) return fail(422, 'idempotency_key_required', 'Нужен ключ повтора: 8–128 латинских букв, цифр, «-» или «_»');
    const created = await deps.createIntent({ accountId: entry.accountId, priceMinor: PAID_PRICE_MINOR, idempotencyKey: key });
    if (created.kind === 'account_inactive') return fail(401, 'unauthorized', 'Войдите, чтобы оплатить тариф');
    if (created.kind === 'conflict') return fail(409, 'idempotency_conflict', 'Этот ключ уже использован. Обновите страницу');
    const intent = created.intent;
    if (intent.status !== 'created') return json({ data: { intent_id: intent.id, redirect_url: null, status: intent.status } });
    try {
      // Платёж по намерению уже создан (ревью N6, находка 2): НЕ создавать второй — идемпотентность ЮKassa держит ключ
      // только 24 часа. Перезапросить сохранённый: ждёт оплаты — та же форма; отменён — намерение canceled.
      if (intent.provider_payment_id) {
        const existing = await provider.getPayment(intent.provider_payment_id);
        if (existing.status === 'pending' && existing.confirmationUrl) {
          return json({ data: { intent_id: intent.id, redirect_url: existing.confirmationUrl, status: 'created' } }, 201);
        }
        if (existing.status === 'canceled') { await deps.markCanceled(intent.id); return json({ data: { intent_id: intent.id, redirect_url: null, status: 'canceled' } }); }
        return json({ data: { intent_id: intent.id, redirect_url: null, status: 'created' } });
      }
      // Сетевой вызов ВНЕ транзакции (shared-resource-verification п.1). Ключ идемпотентности у ЮKassa — id намерения.
      const payment = await provider.createPayment({
        orderId: intent.id, amountMinor: intent.price_minor,
        returnUrl: new URL(`/upgrade/return?intent=${intent.id}`, deps.publicOrigin).href,
        description: PAYMENT_DESCRIPTION,
      });
      if (!payment.confirmationUrl) return fail(503, 'payment_provider_failed', 'Платёжный сервис не выдал форму оплаты. Повторите позже');
      if (!await deps.setIntentPayment(intent.id, payment.id)) {
        logOf(deps)('Оплата: у намерения уже другой платёж — второй не выдаётся');
        return fail(409, 'intent_has_payment', 'По этой оплате уже создан платёж. Обновите страницу');
      }
      return json({ data: { intent_id: intent.id, redirect_url: payment.confirmationUrl, status: 'created' } }, 201);
    } catch (error) {
      // Намерение остаётся created: повтор с тем же ключом попадёт в него же.
      if (error instanceof PaymentProviderUnavailable) return fail(503, 'payment_provider_unavailable', 'Платёжный сервис временно недоступен. Повторите через минуту');
      if (error instanceof PaymentVerificationError) {
        logOf(deps)(`Оплата: провайдер отклонил создание платежа (${error.message.slice(0, 120)})`);
        return fail(503, 'payment_provider_failed', 'Платёжный сервис отклонил платёж. Повторите позже');
      }
      throw error;
    }
  });
}

// GET /api/checkout/{intent_id} — опрос экрана возврата: pending | succeeded | canceled. Чужое намерение — 404.
export function createCheckoutStatusHandler(deps: BillingDependencies) {
  return (request: Request, intentId: string) => run(deps, 'статус оплаты', async () => {
    if (!deps.provider) return notFound();
    let ip: string;
    try { ip = clientIp(request.headers, deps.trustedProxyHops); } catch { return fail(400, 'no_client_ip', 'Адрес клиента не определён'); }
    const token = readSessionCookie(request);
    const session = token ? await deps.authenticate(token) : null;
    if (!await deps.allowRead(ip, session?.account_id)) return fail(429, 'rate_limited', 'Слишком много запросов. Повторите через минуту');
    if (!session) return fail(401, 'unauthorized', 'Войдите в аккаунт, из которого оплачивали');
    if (!INTENT_ID.test(intentId)) return notFound();
    const view = await deps.readIntent(intentId, session.account_id);
    if (!view) return notFound();
    let status: 'pending' | 'succeeded' | 'canceled' = view.status === 'created' ? 'pending' : view.status;
    // Отмену видит только провайдер (payment.canceled мы не принимаем): спросить его. Сбой опроса — «неизвестно», то есть
    // по-прежнему pending, а не отказ оплаты.
    if (status === 'pending' && view.provider_payment_id) {
      try {
        const remote = await deps.provider.getPayment(view.provider_payment_id);
        if (remote.status === 'canceled') { await deps.markCanceled(view.id); status = 'canceled'; }
      } catch (error) {
        if (!(error instanceof PaymentProviderUnavailable) && !(error instanceof PaymentVerificationError)) throw error;
      }
    }
    // План — ДЕЙСТВУЮЩИЙ (AC-10): старое успешное намерение при истёкшем или снятом плане — не «включено».
    const plan = effectivePlan(view.account_plan, view.plan_source, view.plan_paid_until, (deps.clock ?? (() => new Date()))());
    return json({ data: { intent_id: view.id, status, account_plan: plan, plan_paid_until: plan === 'paid' ? view.plan_paid_until : null } });
  });
}

// POST /api/webhooks/yookassa — ЕДИНСТВЕННЫЙ вебхук продукта (ADR-019). Без cookie: вся защита — подлинность уведомления
// и ключ повторности. 200 — «обработано или сознательно проигнорировано», 400 — подделка/мусор (не ретраится), 503 —
// источник истины или БД недоступны (ЮKassa повторит, записано ничего не было). Лимит частоты приложения НЕ применяется:
// ЮKassa повторяет сама, а 429 превратил бы всплеск доставок в потерянные уведомления.
export function createPaymentWebhookHandler(deps: BillingDependencies) {
  return (request: Request) => run(deps, 'уведомление об оплате', async () => {
    const provider = deps.provider;
    if (!provider) return notFound();
    const raw = await readRawBody(request, MAX_NOTIFICATION_BYTES);
    if (!raw) return fail(400, 'invalid_body', 'Тело уведомления пусто или превышает предел');
    let sourceIp: string;
    // Адрес ИСТОЧНИКА — по числу доверенных прокси справа (внешний прокси машины + Caddy проекта), как у ограничителя.
    try { sourceIp = clientIp(request.headers, deps.trustedProxyHops); } catch { return fail(400, 'no_source_ip', 'Адрес отправителя не определён'); }
    const origin = verifyYooKassaOrigin(sourceIp);
    if (!origin.ok) {
      logOf(deps)(`Оплата: уведомление с адреса вне сетей ЮKassa отвергнуто (${origin.reason})`);
      return fail(400, 'verification_failed', 'Уведомление не прошло проверку подлинности');
    }
    let verified;
    try {
      verified = await provider.verifyNotification({ rawBody: raw, headers: {}, sourceIp });
    } catch (error) {
      if (error instanceof PaymentProviderUnavailable) {
        logOf(deps)(`Оплата: ЮKassa недоступна при проверке уведомления (${error.reason})`);
        return fail(503, 'provider_unavailable', 'Источник истины недоступен');
      }
      if (error instanceof PaymentVerificationError) {
        logOf(deps)(`Оплата: уведомление отвергнуто (${error.message.slice(0, 120)})`);
        return fail(400, 'verification_failed', 'Уведомление не прошло проверку подлинности');
      }
      throw error;
    }
    if (verified.kind === 'ignored') return json({ data: { applied: false, reason: 'ignored_event' } });
    const name = providerName(provider);
    const payloadSha256 = createHash('sha256').update(raw).digest('hex');
    const p = verified.payment;
    const payment = { id: p.id, orderId: p.orderId, amountMinor: p.amountMinor, feeMinor: p.feeMinor, paidAt: p.paidAt };
    const outcome = verified.kind === 'refund_succeeded'
      ? await deps.recordRefund({ provider: name, eventKey: `refund_succeeded:${verified.refund.id}`, payloadSha256, payment })
      : await deps.applyPayment({ provider: name, eventKey: `payment_succeeded:${p.id}`, payloadSha256, payment });
    // Разбор — дело оператора (OWN-019 п.3): строка журнала без персональных данных, id платежа провайдера — для поиска.
    if (!outcome.applied && outcome.reason !== 'duplicate') logOf(deps)(`Оплата: платёж ${p.id} план не выдал (${outcome.reason}) — разбор оператором, payment.needs_review`);
    return json({ data: outcome });
  });
}
