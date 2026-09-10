import type { PoolClient } from 'pg';
import type { DomainEvent, Scope } from './contracts.js';
import { Context, type StoredOrder, requireValue, scopeArgs } from './internal.js';

/** Retry the original durable paid event, retaining its identity and financial version. */
export async function fulfillPending(client: PoolClient, ctx: Context, order: StoredOrder) {
  if (order.paymentStatus !== 'succeeded' || order.fulfillmentStatus !== 'pending') return;
  // A refund must never be undone by replaying an earlier entitlement grant.
  if (order.refundedMinor !== '0') {
    order.fulfillmentStatus = 'review_required';
    await ctx.save(client, order);
    return;
  }
  const { rows } = await client.query(
    `SELECT data FROM agent_payments.events
     WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND order_id=$4
       AND data->>'type'='payment.succeeded'`,
    [...scopeArgs(order.scope), order.orderId],
  );
  requireValue(rows.length === 1, 'paid_event_missing_or_ambiguous');
  const event: DomainEvent = rows[0].data;
  const status = await ctx.options.host.fulfill(client, event, ctx.view(order));
  requireValue(status === 'active' || status === 'pending', 'fulfillment_status_invalid');
  order.fulfillmentStatus = status;
  await ctx.save(client, order);
}

export async function retryFulfillment(ctx: Context, scope: Scope, orderId: string) {
  return ctx.tx(scope, async client => {
    const order = await ctx.order(client, scope, orderId);
    await fulfillPending(client, ctx, order);
    return ctx.view(order);
  });
}
