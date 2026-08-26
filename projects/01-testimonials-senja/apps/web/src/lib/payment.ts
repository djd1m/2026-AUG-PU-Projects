// FR-008 — приём оплаты. Источник: Pseudocode §7.2/§7.3, ADR-006, Specification FR-008.
//
// Провайдер не выбран ни одним документом ([GAP] в 005_payments.sql, Architecture §3.5/§9/§11),
// поэтому здесь описан провайдер-АГНОСТИЧНЫЙ контракт из ADR-006:
//   project_id -> { provider_session_id, redirect_url }
// Конкретная интеграция подключается реализацией CheckoutProvider — остальной код не меняется.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { isPaid } from './tariff';

export const PROVIDER = process.env.PAYMENT_PROVIDER ?? 'stub';
/** Pseudocode §7.2: повтор старого валидного тела отсекается по возрасту метки времени. */
export const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;

// ───────────────────────────── подпись вебхука ─────────────────────────────

export function signWebhook(rawBody: string, secret: string, timestamp: number): string {
  // Метка времени входит В ПОДПИСЬ. Иначе её можно подменить, не ломая подпись,
  // и проверка свежести становится бессмысленной.
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export type SignatureVerdict =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'no_secret' | 'missing_headers' | 'bad_signature' | 'stale' };

/**
 * Проверка подписи — ПЕРВОЕ, что происходит с вебхуком (Pseudocode §7.2).
 *
 * Порядок принципиален и объяснён в псевдокоде: если сначала записать event_id, а подпись
 * проверить после, атакующий шлёт подделку с угаданным id, мы её записываем — и НАСТОЯЩИЙ
 * вебхук отбрасывается как дубль. Оплата не применится никогда.
 *
 * HMAC считается от СЫРОГО тела: любая пере-сериализация JSON (порядок ключей, пробелы,
 * экранирование) ломает подпись.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  now: number = Date.now(),
): SignatureVerdict {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  // Fail-closed: без секрета принимать вебхуки нельзя — это открытый апгрейд тарифа всем.
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: 'missing_headers' };

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'missing_headers' };

  const expected = Buffer.from(signWebhook(rawBody, secret, timestamp), 'hex');
  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader.trim(), 'hex');
  } catch {
    return { ok: false, reason: 'bad_signature' };
  }
  // Длины сверяем ДО timingSafeEqual: он бросает на разной длине, а не возвращает false.
  if (provided.length !== expected.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: 'bad_signature' };

  // Свежесть — ПОСЛЕ подписи: иначе по времени ответа различимы «подпись верна, но старая»
  // и «подпись неверна». Math.abs — метка из будущего тоже подозрительна.
  if (Math.abs(now - timestamp) > MAX_WEBHOOK_AGE_MS) return { ok: false, reason: 'stale' };

  return { ok: true, timestamp };
}

// ───────────────────────────── идемпотентность ─────────────────────────────

/**
 * ADR-006: гарантия «ровно один раз» — на уровне СХЕМЫ (unique(provider, event_id)),
 * а не логики приложения. Поэтому здесь INSERT ... ON CONFLICT DO NOTHING, а не
 * «проверить exists, затем вставить»: последнее оставляет окно, в котором два
 * параллельных повтора вебхука оба увидят «события ещё нет».
 *
 * @returns true — событие НОВОЕ и бизнес-логику надо выполнить; false — повтор, тихий no-op.
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

// ───────────────────────────── применение оплаты ─────────────────────────────

export type UpgradeResult =
  | { applied: true; projectId: string; alreadyPaid: boolean }
  | { applied: false; reason: 'unknown_session' };

/**
 * Pseudocode §7.3 applyTariffUpgrade. Идемпотентна сама по себе: paid → paid это no-op,
 * поэтому повторный (но прошедший все проверки) вебхук ничего не портит.
 */
export async function applyTariffUpgrade(
  client: PoolClient,
  providerSessionId: string,
): Promise<UpgradeResult> {
  const { rows } = await client.query<{ id: string; project_id: string; tier: string }>(
    `select cs.id, cs.project_id, p.tier
       from checkout_sessions cs join projects p on p.id = cs.project_id
      where cs.provider_session_id = $1`,
    [providerSessionId],
  );
  const session = rows[0];
  // Неизвестная сессия — не ошибка провайдера и не повод для 500: возможно, вебхук
  // относится к чужому окружению (staging/prod делят один аккаунт провайдера).
  if (!session) return { applied: false, reason: 'unknown_session' };

  // Через общий источник правила (FR-007): сравнение с 'paid' живёт в одном месте.
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

// ───────────────────────────── checkout ─────────────────────────────

export interface CheckoutSession {
  providerSessionId: string;
  redirectUrl: string;
}

/** Контракт ADR-006, провайдер-агностичный. Реальная интеграция реализует его. */
export type CheckoutProvider = (projectId: string) => Promise<CheckoutSession>;

/**
 * Pseudocode §7.3 initiateCheckout, часть с БД.
 *
 * Выполняется под app_authenticated, а НЕ под app_service. Так распорядилась схема
 * (007_rls.sql:63-64): вставку делает ВЛАДЕЛЕЦ, инициирующий апгрейд, а app_service
 * получает только select+update — ему достаточно, чтобы вебхук закрыл сессию.
 * Попытка вставить под app_service даёт «permission denied» — граница ролей реальна,
 * а не декоративна (поймано тестом).
 *
 * Обращение к провайдеру сюда НЕ входит намеренно: сетевой вызов внутри открытой
 * транзакции держал бы соединение пула всё время ответа стороннего сервиса.
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
