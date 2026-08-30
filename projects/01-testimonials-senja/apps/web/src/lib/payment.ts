// FR-008 — приём оплаты через ЮKassa. Источник: Pseudocode §7.2/§7.3, ADR-006,
// решение о провайдере — decisions/D-009.
//
// ПОЧЕМУ ЗДЕСЬ НЕТ ПРОВЕРКИ ПОДПИСИ. ADR-006 и Architecture §3.5 описывали HMAC от
// сырого тела — это модель Stripe. Провайдером выбрана ЮKassa, а она уведомления
// НЕ ПОДПИСЫВАЕТ вовсе (https://yookassa.ru/developers/using-api/webhooks). Проверять
// подпись, которой провайдер не присылает, — это не защита, а её видимость.
//
// ЮKassa предлагает два способа подтвердить подлинность, и мы применяем ОБА:
//   1. адрес источника принадлежит опубликованному списку сетей;
//   2. статус объекта перезапрашивается у самой ЮKassa — тело уведомления не является
//      источником истины о том, оплачено ли.
// Второй способ сильнее первого: он не зависит от того, насколько точно мы определили
// адрес источника, и переживает любую ошибку в цепочке прокси.

import type { PoolClient } from 'pg';
import { isPaid } from './tariff';
import { ipInAnyCidr } from './ip-range';

export const PROVIDER = 'yookassa';
export const CURRENCY = 'RUB';
const API_BASE = process.env.YOOKASSA_API_URL ?? 'https://api.yookassa.ru/v3';

/**
 * Сети, из которых ЮKassa шлёт уведомления.
 * Источник: https://yookassa.ru/developers/using-api/webhooks (проверено 2026-08-26).
 * Список ЖЁСТКО зашит намеренно: вынесенный в переменную окружения, он однажды
 * приедет пустым или с опечаткой — и превратится в «пускать всех».
 */
export const YOOKASSA_NETWORKS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11',
  '77.75.156.35',
  '77.75.154.128/25',
  '2a02:5180::/32',
] as const;

/** Заглушка платежей — тот же приём, что в 2026-APR-PU-LESSON-06 (PAYMENTS_STUB). */
export function isStub(): boolean {
  return process.env.PAYMENTS_STUB === 'true';
}

function credentials(): { shopId: string; secretKey: string } | null {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return null;
  return { shopId, secretKey };
}

// ───────────────────────── шаг 1: адрес источника ─────────────────────────

export type OriginVerdict =
  | { ok: true; ip: string }
  | { ok: false; reason: 'no_ip' | 'foreign_ip' };

/**
 * Первый рубеж: уведомление пришло с адреса ЮKassa.
 *
 * ВНИМАНИЕ на связь с client-ip.ts: адрес берётся из X-Forwarded-For, которому можно
 * верить ТОЛЬКО пока web недоступен снаружи в обход Caddy. Если этот инвариант нарушить,
 * атакующий подставит заголовок с адресом ЮKassa и пройдёт эту проверку. Поэтому она
 * и не единственная — см. второй шаг.
 */
export function verifyWebhookOrigin(ip: string | null | undefined): OriginVerdict {
  const value = (ip ?? '').trim();
  if (value === '' || value === 'unknown') return { ok: false, reason: 'no_ip' };
  if (!ipInAnyCidr(value, YOOKASSA_NETWORKS)) return { ok: false, reason: 'foreign_ip' };
  return { ok: true, ip: value };
}

// ───────────────────── шаг 2: перезапрос статуса у ЮKassa ─────────────────

export interface RemotePayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: number;
}

export class PaymentProviderError extends Error {}

/**
 * Перезапрашивает платёж у ЮKassa. Тело уведомления при этом НЕ используется как
 * источник истины — только как повод сходить и проверить.
 */
/**
 * Верхняя граница ожидания провайдера платежей.
 *
 * ДОБАВЛЕНО ПОСЛЕ FR-015. Найдено не ревью и не тестом, а ложной посылкой: документы FR-015
 * утверждали, что письмо будет «первым внешним вызовом в проекте». Утверждение оказалось
 * неверным — вызовы к ЮKassa живут здесь с FR-008, — и именно проверка этого утверждения
 * заставила посмотреть на существующий образец.
 *
 * У образца таймаута не было ВООБЩЕ. Хуже: `fetchRemotePayment` вызывается ВНУТРИ транзакции
 * (`app/api/webhooks/payment/route.ts:94`, внутри `withService`), и это осознанно — недоступность
 * провайдера обязана быть исключением, откатывающим заявку на `event_id`, иначе повтор вебхука
 * упрётся в занятый ключ и оплата потеряется (FR-008, security-operation-order.md). Но без
 * таймаута соединение ОБЩЕГО пула удерживалось всё время ответа ЮKassa, а верхней границы у
 * этого времени не существовало.
 *
 * 10 с — с запасом над нормальным ответом платёжного API и заметно ниже того, где удержание
 * соединения становится проблемой. Срабатывание таймаута даёт AbortError, который
 * `PaymentProviderError` не является и потому пробрасывается наружу — то есть транзакция
 * откатывается, а вебхук повторится. Это верное поведение: недоступность источника истины
 * есть отказ, а не значение (fail-closed-defaults.md).
 */
export const PAYMENT_TIMEOUT_MS = 10_000;

export async function fetchRemotePayment(paymentId: string): Promise<RemotePayment | null> {
  if (isStub()) {
    // Заглушка отвечает «оплачено» — ровно как stub в 2026-APR-PU-LESSON-06.
    return { id: paymentId, status: 'succeeded', paid: true, amount: 0 };
  }
  const creds = credentials();
  if (!creds) throw new PaymentProviderError('YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY не заданы');

  const auth = Buffer.from(`${creds.shopId}:${creds.secretKey}`).toString('base64');
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(PAYMENT_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new PaymentProviderError(`ЮKassa ответила ${res.status} на запрос платежа`);

  const data = (await res.json()) as {
    id: string;
    status: RemotePayment['status'];
    paid: boolean;
    amount?: { value?: string };
  };
  return {
    id: data.id,
    status: data.status,
    paid: data.paid === true,
    amount: Number(data.amount?.value ?? 0),
  };
}

// ───────────────────────────── идемпотентность ─────────────────────────────

/**
 * ADR-006: гарантия «ровно один раз» — на уровне СХЕМЫ (unique(provider, event_id)),
 * а не логики приложения. INSERT ... ON CONFLICT DO NOTHING, а не «проверить, потом
 * вставить»: последнее оставляет окно, где два параллельных повтора оба видят «нет».
 *
 * ЮKassa повторяет уведомление, пока не получит 200, — то есть повторы штатны, а не аномальны.
 */
export async function claimWebhookEvent(
  client: PoolClient,
  eventId: string,
  payload: unknown,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `insert into webhook_events (provider, event_id, payload)
     values ($1, $2, $3) on conflict (provider, event_id) do nothing`,
    [PROVIDER, eventId, JSON.stringify(payload ?? null)],
  );
  return (rowCount ?? 0) > 0;
}

// ───────────────────────────── применение оплаты ────────────────────────────

export type UpgradeResult =
  | { applied: true; projectId: string; alreadyPaid: boolean }
  | { applied: false; reason: 'unknown_session' };

/** Pseudocode §7.3 applyTariffUpgrade. Идемпотентна: paid → paid это no-op. */
export async function applyTariffUpgrade(
  client: PoolClient,
  providerPaymentId: string,
): Promise<UpgradeResult> {
  const { rows } = await client.query<{ id: string; project_id: string; tier: string }>(
    `select cs.id, cs.project_id, p.tier
       from checkout_sessions cs join projects p on p.id = cs.project_id
      where cs.provider_session_id = $1`,
    [providerPaymentId],
  );
  const session = rows[0];
  // Неизвестный платёж — не ошибка: staging и prod могут делить один магазин ЮKassa.
  if (!session) return { applied: false, reason: 'unknown_session' };

  const alreadyPaid = isPaid(session.tier);
  await client.query("update projects set tier = 'paid' where id = $1", [session.project_id]);
  await client.query("update checkout_sessions set status = 'completed' where id = $1", [session.id]);
  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action, reason)
     values ($1, 'project', $1, 'system', 'tariff_upgraded', $2)`,
    [session.project_id, alreadyPaid ? 'repeat_webhook_no_change' : 'payment_succeeded'],
  );
  return { applied: true, projectId: session.project_id, alreadyPaid };
}

// ───────────────────────────── создание платежа ─────────────────────────────

export interface CheckoutSession {
  providerSessionId: string;
  redirectUrl: string;
}

/**
 * Создание платежа в ЮKassa (Pseudocode §7.3 initiateCheckout, часть без БД).
 *
 * Idempotence-Key обязателен по контракту ЮKassa: повторный запрос с тем же ключом
 * вернёт ТОТ ЖЕ платёж, а не создаст второй. Ключом берём id проекта плюс сумму —
 * повтор из-за таймаута сети не заведёт владельцу вторую оплату.
 */
export async function createRemotePayment(
  projectId: string,
  amount: number,
  returnUrl: string,
): Promise<CheckoutSession> {
  if (isStub()) {
    const id = `stub-${projectId}`;
    return { providerSessionId: id, redirectUrl: `https://yookassa.ru/checkout/stub/${id}` };
  }
  const creds = credentials();
  if (!creds) throw new PaymentProviderError('PAYMENT_PROVIDER_NOT_CONFIGURED');

  const auth = Buffer.from(`${creds.shopId}:${creds.secretKey}`).toString('base64');
  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Idempotence-Key': `${projectId}:${amount}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency: CURRENCY },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description: `Proofwall: платный тариф для проекта ${projectId}`,
      metadata: { project_id: projectId },
    }),
    // Та же верхняя граница, что у чтения платежа: без неё создание платежа висело бы
    // столько, сколько молчит ЮKassa, занимая обработчик.
    signal: AbortSignal.timeout(PAYMENT_TIMEOUT_MS),
  });
  if (!res.ok) throw new PaymentProviderError(`ЮKassa ответила ${res.status} на создание платежа`);

  const data = (await res.json()) as { id?: string; confirmation?: { confirmation_url?: string } };
  if (!data.id || !data.confirmation?.confirmation_url) {
    throw new PaymentProviderError('ЮKassa вернула ответ без id или ссылки подтверждения');
  }
  return { providerSessionId: data.id, redirectUrl: data.confirmation.confirmation_url };
}

/**
 * Запись сессии в БД. Под app_authenticated, а НЕ app_service: так распорядилась схема
 * (007_rls.sql:63-64) — вставку делает владелец, инициирующий апгрейд.
 */
export async function recordCheckoutSession(
  client: PoolClient,
  projectId: string,
  session: CheckoutSession,
): Promise<void> {
  await client.query(
    `insert into checkout_sessions (project_id, provider_session_id, status)
     values ($1, $2, 'pending')
     on conflict (provider_session_id) do nothing`,
    [projectId, session.providerSessionId],
  );
}
