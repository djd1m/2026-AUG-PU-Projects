// `POST /api/v1/subscription/checkout`, `GET /api/v1/subscription`, `POST /api/v1/subscription/cancel`
// (`02_pseudocode.md` шаг 1, FR-SUB-1…5). Ограничение частоты — общий хук `onRequest`
// сервера, ДО разбора тела; здесь не переопределяется (`security-operation-order.md`).

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DbPool } from '@n4/db';
import { fail, ok, type Logger } from '@n4/shared';
import { requireSession } from './scans.js';
import { PaymentProviderUnavailable, PaymentVerificationError, type PaymentProvider } from '../payments/provider.js';

export interface SubscriptionRoutesDeps {
  readonly pool: DbPool;
  readonly payments: PaymentProvider;
  readonly priceMinor: number;
  readonly appOrigin: string;
  readonly logger: Logger;
}

interface CheckoutBody {
  readonly idempotency_key?: unknown;
}

interface SubscriptionRow {
  readonly id: string;
  readonly status: string;
  readonly current_period_end: Date;
  readonly price_minor: number;
  readonly canceled_at: Date | null;
}

export function registerSubscriptionRoutes(app: FastifyInstance, deps: SubscriptionRoutesDeps): void {
  app.post('/api/v1/subscription/checkout', async (request: FastifyRequest<{ Body: CheckoutBody }>, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));
    // ⚠ Вход проверяется ДО создания намерения (FR-SUB-1): намерение без владельца никому
    // не принадлежит, а подписка, привязанная к cookie, теряется при её очистке — человек
    // заплатил и остался ни с чем.
    if (session.accountId === null) {
      return reply.code(401).send(fail('account_required', 'оплата требует входа: подписка принадлежит аккаунту, а не сессии устройства'));
    }

    const active = await deps.pool.query<SubscriptionRow>(
      `SELECT id, status::text AS status, current_period_end, price_minor, canceled_at
       FROM subscription WHERE account_id = $1 AND status = 'active'`,
      [session.accountId],
    );
    if (active.rows[0] !== undefined) {
      return reply.code(409).send(fail('already_subscribed', 'подписка уже действует'));
    }

    const rawKey = (request.body ?? {}).idempotency_key;
    if (typeof rawKey !== 'string' || rawKey.trim() === '' || rawKey.length > 128) {
      return reply.code(422).send(fail('idempotency_key_required', 'Idempotency-Key обязателен и обязан быть непустой строкой не длиннее 128 символов'));
    }

    // Идентификатор намерения выдаётся ДО ухода к провайдеру (`long-running-job.md`): ручка,
    // приходящая вместе с результатом, умирает вместе с оборванным ответом.
    // `ON CONFLICT DO NOTHING` + повторный SELECT — атомарно; «прочитать, потом записать»
    // при двойном клике создало бы два намерения и два платежа.
    const intentId = randomUUID();
    const claimed = await deps.pool.query<{ id: string; status: string }>(
      `INSERT INTO payment_intent (id, account_id, idempotency_key, price_minor)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (account_id, idempotency_key) DO NOTHING
       RETURNING id, status`,
      [intentId, session.accountId, rawKey, deps.priceMinor],
    );
    let intent = claimed.rows[0];
    if (intent === undefined) {
      const existing = await deps.pool.query<{ id: string; status: string }>(
        `SELECT id, status FROM payment_intent WHERE account_id = $1 AND idempotency_key = $2`,
        [session.accountId, rawKey],
      );
      intent = existing.rows[0];
      if (intent === undefined) return reply.code(503).send(fail('dependency_unavailable', 'база данных недоступна'));
    }

    try {
      // Сетевой вызов — ВНЕ транзакции (`shared-resource-verification.md`, вопрос 1):
      // соединение пула не удерживается, пока отвечает чужой сервис.
      const payment = await deps.payments.createPayment({
        orderId: intent.id,
        amountMinor: deps.priceMinor,
        returnUrl: `${deps.appOrigin}/pro/return?intent=${intent.id}`,
        description: 'Подписка «Тарелка» Pro на 30 дней',
      });
      if (payment.confirmationUrl === null) {
        return reply.code(503).send(fail('payment_provider_failed', 'провайдер не выдал адрес формы оплаты'));
      }
      return reply.code(201).send(ok({ intent_id: intent.id, redirect_url: payment.confirmationUrl }));
    } catch (error) {
      if (error instanceof PaymentProviderUnavailable) {
        // Намерение остаётся в состоянии `created`: повтор с тем же ключом попадёт в него же.
        deps.logger.error('payments_provider_unavailable', { reason: error.reason });
        return reply.code(503).send(fail('payment_provider_unavailable', 'платёжный сервис временно недоступен, попробуйте ещё раз'));
      }
      if (error instanceof PaymentVerificationError) {
        deps.logger.error('payments_create_rejected', { message: error.message });
        return reply.code(503).send(fail('payment_provider_failed', 'провайдер отклонил создание платежа'));
      }
      throw error;
    }
  });

  app.get('/api/v1/subscription', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));
    if (session.accountId === null) return reply.code(200).send(ok({ status: 'none', current_period_end: null, price_minor: deps.priceMinor }));

    const result = await deps.pool.query<SubscriptionRow>(
      `SELECT id, status::text AS status, current_period_end, price_minor, canceled_at
       FROM subscription WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [session.accountId],
    );
    const row = result.rows[0];
    if (row === undefined) return reply.code(200).send(ok({ status: 'none', current_period_end: null, price_minor: deps.priceMinor }));
    return reply.code(200).send(ok({
      status: row.status,
      current_period_end: row.current_period_end.toISOString(),
      price_minor: row.price_minor,
      canceled_at: row.canceled_at === null ? null : row.canceled_at.toISOString(),
    }));
  });

  app.post('/api/v1/subscription/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await requireSession(request, deps.pool);
    if (session === null) return reply.code(401).send(fail('unauthenticated', 'сессия отсутствует'));
    if (session.accountId === null) return reply.code(404).send(fail('not_found', 'подписка не найдена'));

    // Отмена прекращает ПРОДЛЕНИЯ, но оплаченный период дорабатывает до конца (FR-SUB-5):
    // немедленное отключение означало бы, что человек заплатил за месяц, а получил неделю.
    const result = await deps.pool.query<SubscriptionRow>(
      `UPDATE subscription SET status = 'canceled', canceled_at = now()
       WHERE account_id = $1 AND status IN ('active', 'past_due')
       RETURNING id, status::text AS status, current_period_end, price_minor, canceled_at`,
      [session.accountId],
    );
    const row = result.rows[0];
    // Чужая и несуществующая подписка дают ОДИН ответ (`security.md`).
    if (row === undefined) return reply.code(404).send(fail('not_found', 'подписка не найдена'));
    return reply.code(200).send(ok({
      status: row.status,
      current_period_end: row.current_period_end.toISOString(),
      canceled_at: row.canceled_at === null ? null : row.canceled_at.toISOString(),
    }));
  });
}
