import type { PoolClient } from 'pg';
import type { Scope } from './contracts.js';
import { type StoredOrder, audit, scopeArgs, validScope } from './internal.js';
import { lockBuyer } from './store.js';

/** Internal: caller proves cancellation or no dispatch while holding the buyer/order locks. */
export async function releaseCanceledOrder(client: PoolClient, order: StoredOrder): Promise<void> {
  await client.query(
    "UPDATE agent_payments.reservations SET state='released' WHERE order_id=$1 AND state='held'",
    [order.orderId],
  );
  await client.query(
    'DELETE FROM agent_payments.period_claims WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND billing_period=$4 AND source_id=$5',
    [...scopeArgs(order.scope), order.quote.billingPeriod, order.orderId],
  );
}

/**
 * Trusted host-only supersession. Caller must begin a transaction and acquire its project
 * lock first. This function acquires the shared buyer lock and never commits independently.
 * Fenced attempts and unknown outcomes are retained; only provably unsent orders are canceled.
 */
export async function abandonUndispatched(client: PoolClient, scope: Scope): Promise<string[]> {
  validScope(scope);
  await lockBuyer(client, scope);
  const { rows } = await client.query(
    `SELECT data FROM agent_payments.orders
     WHERE merchant=$1 AND buyer=$2 AND resource=$3
       AND data->>'paymentStatus' IN ('prepared','pending','action_required')
     ORDER BY id FOR UPDATE`,
    scopeArgs(scope),
  );
  const abandoned: string[] = [];
  for (const row of rows) {
    const order: StoredOrder = row.data;
    const attempts = await client.query(
      'SELECT id,data FROM agent_payments.attempts WHERE order_id=$1 FOR UPDATE',
      [order.orderId],
    );
    if (order.attemptId && !attempts.rows.some(a => a.id === order.attemptId)) continue;
    if (attempts.rows.some(a => Object.hasOwn(a.data, 'dispatchedAt'))) continue;
    order.paymentStatus = 'canceled';
    order.nextAction = { kind: 'none' };
    await releaseCanceledOrder(client, order);
    await client.query('UPDATE agent_payments.orders SET data=$2 WHERE id=$1', [order.orderId, order]);
    await audit(client, scope, 'order.abandoned_undispatched', order.orderId);
    abandoned.push(order.orderId);
  }
  return abandoned;
}
