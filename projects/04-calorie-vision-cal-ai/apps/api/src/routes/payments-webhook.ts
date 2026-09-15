// `POST /api/v1/webhooks/payments/{provider}` — приём уведомлений об оплате.
//
// ЕДИНСТВЕННЫЙ публичный маршрут без cookie-сессии, поэтому вся его защита — в подлинности
// уведомления и ключе повторности.
//
// ПОРЯДОК ИСПРАВЛЕН ОТНОСИТЕЛЬНО ПЛАНА. `02_pseudocode.md` заявлял «заявить ключ
// повторности, затем подтвердить подлинность перезапросом». Это обратный порядок к уроку,
// на который план же и ссылался (N1): подделка с угаданным идентификатором заявляет ключ
// первой, и НАСТОЯЩЕЕ уведомление отбрасывается как дубль. Здесь подлинность
// подтверждается ПЕРВОЙ и ВНЕ транзакции — тогда:
//   1) подделка не касается таблицы ключей вовсе;
//   2) соединение пула не удерживается, пока отвечает провайдер
//      (`shared-resource-verification.md`, вопрос 1);
//   3) недоступность провайдера случается ДО любой записи, и откатывать нечего.
//
// ПЕРЕСТАНОВКА решена построением, а не версиями: продление ТОЛЬКО удлиняет период
// (`GREATEST(current_period_end, now()) + 30 дней`), возврат только прекращает подписку.
// Обработчик перестановочен — событие, приехавшее не в том порядке, не откатывает состояние
// (`incoming-webhooks.md`, «порядок доставки не гарантирован»).

import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { withTransaction } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { PaymentProviderUnavailable, PaymentVerificationError, type PaymentProvider, type RemotePayment } from '../payments/provider.js';
import { accrueCommission, clawbackCommission } from '../commission/accrue.js';

export interface PaymentsWebhookDeps {
  readonly pool: DbPool;
  readonly payments: PaymentProvider;
  readonly priceMinor: number;
  readonly holdDays: number;
  readonly periodDays: number;
  readonly logger: Logger;
}

/**
 * ПОЛЕ ключа повторности (`incoming-webhooks.md`, требование «ключ обязан быть НАЗВАН»).
 * У ЮKassa отдельного идентификатора события НЕТ, поэтому тождество события у отправителя
 * составляют ДВА его поля: тип события и идентификатор объекта. Оно одинаково во всех
 * попытках доставки одного события и различно у двух разных (успех и возврат по одному
 * платежу — разные события). Значение, выданное нами на приёме, ключом быть не может: оно
 * различно на каждой доставке, и повтор по нему не узнать никогда.
 */
function repeatKey(kind: string, objectId: string): string {
  return `${kind}:${objectId}`;
}

export function registerPaymentsWebhookRoute(app: FastifyInstance, deps: PaymentsWebhookDeps): void {
  // Отдельная область плагина: разборщик сырого тела не должен действовать на остальные
  // маршруты. Тело обязано дойти БАЙТАМИ — разбор и повторная сборка меняют байты, и
  // подпись (там, где провайдер её даёт) не сойдётся никогда.
  void app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    scope.post('/api/v1/webhooks/payments/:provider', async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
      if (request.params.provider !== deps.payments.name) {
        // Уведомление не от того провайдера, который включён: 404, а не 400 — существование
        // маршрута под чужое имя подтверждать незачем.
        return reply.code(404).send(fail('not_found', 'маршрут не найден'));
      }
      const rawBody = request.body as Buffer | undefined;
      if (rawBody === undefined || rawBody.byteLength === 0) {
        return reply.code(400).send(fail('empty_body', 'тело уведомления пусто'));
      }

      // ── ШАГ 1: подлинность. ВНЕ транзакции и ДО любой записи ────────────────────────
      let verified;
      try {
        verified = await deps.payments.verifyNotification({
          rawBody,
          headers: request.headers as Record<string, string | undefined>,
          sourceIp: request.ip,
        });
      } catch (error) {
        if (error instanceof PaymentProviderUnavailable) {
          // 503 РЕТРАИБЕЛЕН и это важно: провайдер повторит, а мы ничего не записали.
          deps.logger.error('payments_webhook_provider_unavailable', { reason: error.reason });
          return reply.code(503).send(fail('provider_unavailable', 'источник истины недоступен'));
        }
        if (error instanceof PaymentVerificationError) {
          // 400, а не 200: отказ обязан быть виден отправителю, а не проглочен.
          deps.logger.warn('payments_webhook_rejected', { message: error.message });
          return reply.code(400).send(fail('verification_failed', 'уведомление не прошло проверку подлинности'));
        }
        throw error;
      }

      if (verified.kind === 'ignored') {
        // Событие, которое нас не касается: 200 и НИЧЕГО не менять, иначе провайдер будет
        // ретраить то, что мы игнорируем сознательно.
        return reply.code(200).send(ok({ applied: false, reason: 'ignored_event' }));
      }

      const payment = verified.payment;
      const objectId = verified.kind === 'refund_succeeded' ? verified.refund.id : payment.id;
      const key = repeatKey(verified.kind, objectId);

      try {
        const outcome = await withTransaction(deps.pool, async (client) => {
          // ── ШАГ 2: ключ повторности, АТОМАРНО ───────────────────────────────────────
          const claimed = await client.query<{ id: string }>(
            `INSERT INTO payment_event (provider, provider_event_id, payload_sha256, occurred_at)
             VALUES ($1, $2, $3, $4) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
            [deps.payments.name, key, sha256(rawBody), payment.paidAt ?? new Date().toISOString()],
          );
          // Пустой результат И ЕСТЬ «уже обработано»: две попытки приезжают ОДНОВРЕМЕННО,
          // и «прочитать, потом записать» пропустило бы обе.
          if (claimed.rows[0] === undefined) return { applied: false as const, reason: 'duplicate' as const };

          if (verified.kind === 'refund_succeeded') return applyRefund(client, deps, payment);
          return applyPayment(client, deps, payment);
        });
        return reply.code(200).send(ok(outcome));
      } catch (error) {
        if (error instanceof PaymentProviderUnavailable) {
          deps.logger.error('payments_webhook_provider_unavailable', { reason: error.reason });
          return reply.code(503).send(fail('provider_unavailable', 'источник истины недоступен'));
        }
        deps.logger.error('payments_webhook_failed', { message: (error as Error).message });
        return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
      }
    });
  });
}

function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

type ApplyOutcome =
  | { readonly applied: true; readonly commission: string }
  | { readonly applied: false; readonly reason: 'duplicate' | 'needs_review' | 'no_subscription' };

async function applyPayment(client: Parameters<typeof accrueCommission>[0], deps: PaymentsWebhookDeps, payment: RemotePayment): Promise<ApplyOutcome> {
  const orderId = payment.orderId;
  if (orderId === null) return { applied: false, reason: 'no_subscription' };

  const intent = await client.query<{ account_id: string; price_minor: number }>(
    `UPDATE payment_intent SET status = 'succeeded' WHERE id = $1 RETURNING account_id, price_minor`,
    [orderId],
  );
  const intentRow = intent.rows[0];
  if (intentRow === undefined) return { applied: false, reason: 'no_subscription' };

  // Сумма, не совпавшая с ценой: платёж ПРИНИМАЕТСЯ (деньги реальны), но начисление не
  // делается автоматически — расхождение означает либо смену цены, либо подделку.
  const mismatch = payment.amountMinor !== intentRow.price_minor;
  // `net` НЕ вычисляется нами: провайдер не назвал удержание — начислять не от чего (ADR-011).
  const netMinor = payment.feeMinor === null ? null : payment.amountMinor - payment.feeMinor;

  const subscription = await client.query<{ id: string }>(
    `INSERT INTO subscription (account_id, status, price_minor, current_period_start, current_period_end, provider)
     VALUES ($1, 'active', $2, now(), now() + make_interval(days => $3), $4)
     ON CONFLICT (account_id) WHERE status = 'active'
     DO UPDATE SET
       -- Продление ТОЛЬКО удлиняет: событие, приехавшее не по порядку, не укоротит период.
       current_period_end = GREATEST(subscription.current_period_end, now()) + make_interval(days => $3),
       failed_renewals = 0, status = 'active'
     RETURNING id`,
    [intentRow.account_id, intentRow.price_minor, deps.periodDays, deps.payments.name],
  );
  const subscriptionId = subscription.rows[0]!.id;

  const inserted = await client.query<{ id: string; paid_at: Date }>(
    `INSERT INTO payment (subscription_id, account_id, provider, provider_payment_id, gross_minor, fee_minor, net_minor, status, needs_review, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'succeeded', $8, $9)
     ON CONFLICT (provider, provider_payment_id) DO NOTHING RETURNING id, paid_at`,
    [subscriptionId, intentRow.account_id, deps.payments.name, payment.id, payment.amountMinor,
     payment.feeMinor ?? 0, netMinor ?? 0, mismatch || netMinor === null, payment.paidAt ?? new Date().toISOString()],
  );
  const paymentRow = inserted.rows[0];
  if (paymentRow === undefined) return { applied: false, reason: 'duplicate' };
  if (mismatch || netMinor === null) return { applied: false, reason: 'needs_review' };

  const accrual = await accrueCommission(client, {
    paymentId: paymentRow.id,
    accountId: intentRow.account_id,
    subscriptionId,
    netMinor,
    paidAt: paymentRow.paid_at,
    holdDays: deps.holdDays,
  });
  return { applied: true, commission: accrual.kind === 'accrued' ? `accrued:${accrual.amountMinor}` : `skipped:${accrual.reason}` };
}

async function applyRefund(client: Parameters<typeof accrueCommission>[0], deps: PaymentsWebhookDeps, payment: RemotePayment): Promise<ApplyOutcome> {
  const updated = await client.query<{ id: string; subscription_id: string | null }>(
    `UPDATE payment SET status = 'refunded' WHERE provider = $1 AND provider_payment_id = $2 RETURNING id, subscription_id`,
    [deps.payments.name, payment.id],
  );
  const row = updated.rows[0];
  if (row === undefined) return { applied: false, reason: 'no_subscription' };
  if (row.subscription_id !== null) {
    await client.query(`UPDATE subscription SET status = 'expired' WHERE id = $1`, [row.subscription_id]);
  }
  const clawback = await clawbackCommission(client, row.id);
  return { applied: true, commission: clawback.kind === 'clawed_back' ? `clawback:${clawback.amountMinor}` : `skipped:${clawback.reason}` };
}
