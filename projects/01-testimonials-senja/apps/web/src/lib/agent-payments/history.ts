import { pool, withService } from '@proofwall/db';
import { lockBuyer, observeHumanSpend, type Scope } from '@course/agent-payments';
import { fetchRemotePayment } from '../payment';
import { AgentHostError } from './security';
/** Backfill only missing verified legacy facts; never infer old gross from today's price. */
export async function importLegacySpend(scope: Scope, now: Date, budgetPeriod: string) {
  const rows = (
    await pool.query(
      `select cs.provider_session_id,p.id as project_id from checkout_sessions cs
    join projects p on p.id=cs.project_id
    join webhook_events w on w.provider='yookassa' and w.event_id='payment.succeeded:'||cs.provider_session_id
    where p.account_id=$1 and cs.status='completed'
      and w.processed_at >= date_trunc('month',$2::timestamptz at time zone 'Europe/Moscow') at time zone 'Europe/Moscow'
      and w.processed_at < (date_trunc('month',$2::timestamptz at time zone 'Europe/Moscow')+interval '1 month') at time zone 'Europe/Moscow'
      and not exists(select 1 from agent_payment_orders a where a.provider_id=cs.provider_session_id)
      and not exists(select 1 from agent_payments.human_spend h where h.merchant=$3 and h.buyer=p.account_id::text and h.source_id='legacy:'||cs.provider_session_id)
    order by w.processed_at limit 101`,
      [scope.buyerId, now, scope.merchantId],
    )
  ).rows;
  // Admission is bounded; unusually large histories need operator import, never a partial budget.
  if (rows.length > 100) throw new AgentHostError('HISTORY_RECONCILIATION_REQUIRED', 409);
  for (const row of rows) {
    const payment = await fetchRemotePayment(row.provider_session_id);
    if (
      !payment ||
      payment.id !== row.provider_session_id ||
      !payment.paid ||
      payment.status !== 'succeeded' ||
      payment.currency !== 'RUB' ||
      payment.shopId !== process.env.YOOKASSA_SHOP_ID ||
      !Number.isFinite(payment.amount) ||
      payment.amount <= 0 ||
      !Number.isSafeInteger(Math.round(payment.amount * 100))
    )
      throw new AgentHostError('HISTORY_UNVERIFIED', 503);
    await withService(async (client) => {
      await client.query('select id from projects where id=$1 and account_id=$2 for update', [
        row.project_id,
        scope.buyerId,
      ]);
      await client.query('reset role');
      const historicalScope = { ...scope, resourceId: row.project_id };
      await lockBuyer(client, historicalScope);
      await observeHumanSpend(client, historicalScope, {
        sourceId: `legacy:${payment.id}`,
        amount: { minor: String(Math.round(payment.amount * 100)), currency: 'RUB' },
        budgetPeriod,
        billingPeriod: `legacy:${payment.id}`,
      });
    });
  }
}
