import type { PoolClient } from 'pg';
import { releaseCanceledOrder } from './cancellation.js';
import { fulfillPending, retryFulfillment } from './fulfillment.js';
import type { DomainEvent, ProviderResult, Scope } from './contracts.js';
import {
  Context,
  type Attempt,
  type StoredOrder,
  audit,
  id,
  money,
  requireValue,
  scopeArgs,
  text,
} from './internal.js';
export function verifyResult(
  ctx: Context,
  order: StoredOrder,
  attempt: Attempt,
  result: ProviderResult,
) {
  money(result.amount);
  text(result.providerId);
  requireValue(
    attempt.provider === ctx.options.provider.provider &&
      attempt.accountId === ctx.options.provider.accountId,
    'attempt_provider_mismatch',
  );
  requireValue(
    result.test === true &&
      result.accountId === ctx.options.provider.accountId &&
      result.orderId === order.orderId &&
      result.attemptId === attempt.id &&
      result.amount.currency === order.quote.amount.currency &&
      result.amount.minor === order.quote.amount.minor,
    'provider_mismatch',
  );
  requireValue(
    ['pending', 'succeeded', 'canceled'].includes(result.status),
    'provider_status_invalid',
  );
  requireValue(
    !attempt.providerId || attempt.providerId === result.providerId,
    'provider_id_conflict',
  );
}
async function emit(c: PoolClient, event: DomainEvent, scope: Scope) {
  await c.query(
    'INSERT INTO agent_payments.events(id,merchant,buyer,resource,order_id,data) VALUES($1,$2,$3,$4,$5,$6)',
    [event.eventId, ...scopeArgs(scope), event.orderId, event],
  );
}
function eventFor(
  ctx: Context,
  order: StoredOrder,
  attempt: Attempt,
  type: DomainEvent['type'],
): DomainEvent {
  return {
    eventId: id(),
    schemaVersion: 1,
    ...order.scope,
    orderId: order.orderId,
    attemptId: attempt.id,
    providerId: attempt.providerId!,
    providerAccountId: ctx.options.provider.accountId,
    aggregateVersion: order.version,
    type,
    amount: order.quote.amount,
    refundedMinor: order.refundedMinor,
    occurredAt: ctx.now().toISOString(),
    correlationId: order.orderId,
    attributionBinding: order.attributionBinding,
  };
}
export async function settle(ctx: Context, scope: Scope, orderId: string, result: ProviderResult) {
  await ctx.tx(scope, async (c) => {
    const order = await ctx.order(c, scope, orderId);
    const r = await c.query('SELECT data FROM agent_payments.attempts WHERE id=$1', [
      order.attemptId,
    ]);
    requireValue(r.rows[0], 'attempt_missing');
    const attempt: Attempt = r.rows[0].data;
    verifyResult(ctx, order, attempt, result);
    requireValue(attempt.dispatchedAt, 'not_dispatched');
    attempt.providerId = result.providerId;
    await c.query('UPDATE agent_payments.attempts SET provider_id=$2,data=$3 WHERE id=$1', [
      attempt.id,
      result.providerId,
      attempt,
    ]);
  });
  return ctx.tx(scope, async (c) => {
    const order = await ctx.order(c, scope, orderId);
    const r = await c.query('SELECT data FROM agent_payments.attempts WHERE id=$1', [
      order.attemptId,
    ]);
    requireValue(r.rows[0], 'attempt_missing');
    const attempt: Attempt = r.rows[0].data;
    verifyResult(ctx, order, attempt, result);
    requireValue(attempt.dispatchedAt, 'not_dispatched');
    attempt.providerId = result.providerId;
    await c.query('UPDATE agent_payments.attempts SET provider_id=$2,data=$3 WHERE id=$1', [
      attempt.id,
      result.providerId,
      attempt,
    ]);
    if (order.paymentStatus === 'succeeded') {
      await fulfillPending(c, ctx, order);
      return ctx.view(order);
    }
    if (order.paymentStatus === 'canceled' || order.paymentStatus === 'failed') {
      requireValue(result.status !== 'succeeded', 'terminal_status_conflict');
      return ctx.view(order);
    }
    if (result.status === 'succeeded') {
      order.paymentStatus = 'succeeded';
      order.fulfillmentStatus = 'pending';
      order.nextAction = { kind: 'none' };
      order.version++;
      await c.query("UPDATE agent_payments.reservations SET state='consumed' WHERE order_id=$1", [
        orderId,
      ]);
      if (order.saveMethod && result.savedMethod?.saved) {
        text(result.savedMethod.reference);
        await c.query(
          'INSERT INTO agent_payments.methods VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(merchant,buyer,resource,provider,account) DO UPDATE SET data=EXCLUDED.data',
          [
            ...scopeArgs(scope),
            ctx.options.provider.provider,
            ctx.options.provider.accountId,
            { reference: result.savedMethod.reference, test: true, consentOrderId: orderId },
          ],
        );
      }
      const event = eventFor(ctx, order, attempt, 'payment.succeeded');
      order.fulfillmentStatus = await ctx.options.host.fulfill(c, event, ctx.view(order));
      await emit(c, event, scope);
      await audit(c, scope, 'payment.succeeded', orderId);
    } else if (result.status === 'canceled') {
      order.paymentStatus = 'canceled';
      order.nextAction = { kind: 'none' };
      await releaseCanceledOrder(c, order);
    } else {
      order.paymentStatus = result.confirmationUrl ? 'action_required' : 'pending';
      order.nextAction = result.confirmationUrl
        ? { kind: 'open_url', url: result.confirmationUrl }
        : { kind: 'wait', retryAfterSeconds: 5 };
    }
    await ctx.save(c, order);
    return ctx.view(order);
  });
}
export function reconciliation(ctx: Context) {
  return {
    async reconcile(scope: Scope, orderId: string, providerIdHint?: string) {
      const loaded = await ctx.tx(scope, async (c) => {
        const order = await ctx.order(c, scope, orderId);
        if (!order.attemptId) return { order };
        const r = await c.query('SELECT data FROM agent_payments.attempts WHERE id=$1', [
          order.attemptId,
        ]);
        return { order, attempt: r.rows[0]?.data as Attempt | undefined };
      });
      if (loaded.order.paymentStatus === 'succeeded')
        return retryFulfillment(ctx, scope, orderId);
      if (!loaded.attempt?.dispatchedAt) return ctx.view(loaded.order);
      requireValue(
        loaded.attempt.provider === ctx.options.provider.provider &&
          loaded.attempt.accountId === ctx.options.provider.accountId,
        'attempt_provider_mismatch',
      );
      if (providerIdHint) text(providerIdHint);
      requireValue(
        !providerIdHint ||
          !loaded.attempt.providerId ||
          providerIdHint === loaded.attempt.providerId,
        'provider_id_conflict',
      );
      const result = await ctx.options.provider.query(
        loaded.attempt.request,
        loaded.attempt.providerId ?? providerIdHint,
      );
      return result ? settle(ctx, scope, orderId, result) : ctx.view(loaded.order);
    },
    async reconcileRefund(scope: Scope, orderId: string, refundId: string) {
      text(refundId);
      requireValue(ctx.options.provider.queryRefund, 'refund_query_unsupported');
      const before = await ctx.tx(scope, async (c) => {
        const order = await ctx.order(c, scope, orderId);
        const { rows } = await c.query('SELECT data FROM agent_payments.attempts WHERE id=$1 AND order_id=$2', [order.attemptId, orderId]);
        requireValue(rows[0], 'attempt_missing');
        const attempt: Attempt = rows[0].data;
        requireValue(attempt.provider === ctx.options.provider.provider && attempt.accountId === ctx.options.provider.accountId, 'attempt_provider_mismatch');
        return order;
      });
      const refund = await ctx.options.provider.queryRefund(refundId);
      money(refund.amount);
      requireValue(
        refund.refundId === refundId &&
          refund.test === true &&
          refund.accountId === ctx.options.provider.accountId,
        'refund_mismatch',
      );
      if (before.paymentStatus !== 'succeeded')
        await this.reconcile(scope, orderId, refund.providerId);
      return ctx.tx(scope, async (c) => {
        const order = await ctx.order(c, scope, orderId);
        requireValue(order.paymentStatus === 'succeeded', 'payment_not_settled');
        const r = await c.query('SELECT data FROM agent_payments.attempts WHERE id=$1', [
          order.attemptId,
        ]);
        const attempt: Attempt = r.rows[0].data;
        requireValue(attempt.provider === ctx.options.provider.provider && attempt.accountId === ctx.options.provider.accountId, 'attempt_provider_mismatch');
        requireValue(
          refund.providerId === attempt.providerId &&
            refund.amount.currency === order.quote.amount.currency,
          'refund_mismatch',
        );
        const prior = await c.query(
          'SELECT order_id,minor::text FROM agent_payments.refunds WHERE provider=$1 AND account=$2 AND refund_id=$3',
          [ctx.options.provider.provider, ctx.options.provider.accountId, refundId],
        );
        if (prior.rows[0]) {
          requireValue(
            prior.rows[0].order_id === orderId && prior.rows[0].minor === refund.amount.minor,
            'refund_conflict',
          );
          return ctx.view(order);
        }
        if (refund.status !== 'succeeded') return ctx.view(order);
        const cumulative = BigInt(order.refundedMinor) + BigInt(refund.amount.minor);
        requireValue(cumulative <= BigInt(order.quote.amount.minor), 'refund_exceeds_payment');
        order.refundedMinor = cumulative.toString();
        order.version++;
        await c.query('INSERT INTO agent_payments.refunds VALUES($1,$2,$3,$4,$5)', [
          ctx.options.provider.provider,
          ctx.options.provider.accountId,
          refundId,
          orderId,
          refund.amount.minor,
        ]);
        const event = { ...eventFor(ctx, order, attempt, 'payment.refunded'), refundId };
        order.fulfillmentStatus = await ctx.options.host.refund(c, event, ctx.view(order));
        await emit(c, event, scope);
        await ctx.save(c, order);
        return ctx.view(order);
      });
    },
    async pendingEvents(scope: Scope, limit = 100): Promise<DomainEvent[]> {
      requireValue(Number.isInteger(limit) && limit > 0 && limit <= 100, 'invalid_limit', 400);
      return ctx.tx(scope, async (c) => {
        const r = await c.query(
          'SELECT data FROM agent_payments.events WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND NOT acknowledged ORDER BY created_at,id LIMIT $4',
          [...scopeArgs(scope), limit],
        );
        return r.rows.map((r) => r.data);
      });
    },
    async acknowledgeEvent(scope: Scope, eventId: string) {
      text(eventId);
      await ctx.tx(scope, async (c) => {
        const r = await c.query(
          'UPDATE agent_payments.events SET acknowledged=true WHERE id=$1 AND merchant=$2 AND buyer=$3 AND resource=$4',
          [eventId, ...scopeArgs(scope)],
        );
        requireValue(r.rowCount, 'not_found', 404);
      });
    },
  };
}
