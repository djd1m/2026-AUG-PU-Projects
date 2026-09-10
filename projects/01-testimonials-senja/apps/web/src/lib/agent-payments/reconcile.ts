import type { PaymentsEngine } from '@course/agent-payments';
import { pool, withService } from '@proofwall/db';
import { reconciliationEngine } from './runtime';
import { recordCancellation } from './notification';
/** Service-only, no client scope. Five concurrent query-only operations per call. */
export async function reconcileBatch(engine: () => PaymentsEngine = reconciliationEngine) {
  const rows = (
    await pool.query(`select h.order_id,o.merchant,o.buyer,o.resource from agent_payment_orders h
    join agent_payments.orders o on o.id=h.order_id::text join agent_payments.attempts a on a.order_id=o.id
    where a.data->>'dispatchedAt' is not null
      and (o.data->>'paymentStatus' in ('pending','unknown','action_required')
        or (o.data->>'paymentStatus'='succeeded' and o.data->>'fulfillmentStatus'='pending'))
    order by h.last_reconciled_at asc nulls first,h.order_id limit 5`)
  ).rows;
  const result = { scanned: rows.length, completed: 0, pending: 0, failed: 0 };
  const payments = rows.length ? engine() : undefined;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await withService((c) =>
          c.query(
            'update agent_payment_orders set last_reconciled_at=clock_timestamp() where order_id=$1',
            [row.order_id],
          ),
        );
        const scope = { merchantId: row.merchant, buyerId: row.buyer, resourceId: row.resource };
        const order = await payments!.reconcile(scope, row.order_id);
        if (order.paymentStatus === 'canceled') await recordCancellation(row.order_id, scope);
        if (
          ['succeeded', 'canceled', 'failed'].includes(order.paymentStatus) &&
          order.fulfillmentStatus !== 'pending'
        )
          result.completed++;
        else result.pending++;
      } catch {
        result.failed++;
      }
    }),
  );
  return result;
}
