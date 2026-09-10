import type { PoolClient } from 'pg';
import type { MandateView, Money, Scope } from './contracts.js';
import { lockBuyer } from './store.js';
import { type StoredOrder, money, requireValue, scopeArgs, text, validScope } from './internal.js';
export async function reserve(client: PoolClient, order: StoredOrder, mandate?: MandateView) {
  const { scope, quote } = order;
  const claim = await client.query(
    'SELECT source_id FROM agent_payments.period_claims WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND billing_period=$4',
    [...scopeArgs(scope), quote.billingPeriod],
  );
  requireValue(
    !claim.rows[0] || claim.rows[0].source_id === order.orderId,
    'period_already_claimed',
  );
  if (mandate) {
    const budget = await client.query(
      'SELECT limit_minor::text FROM agent_payments.budgets WHERE merchant=$1 AND buyer=$2 AND currency=$3',
      [scope.merchantId, scope.buyerId, quote.amount.currency],
    );
    requireValue(budget.rows[0], 'budget_missing');
    const spent = await client.query(
      `SELECT COALESCE(sum(minor),0)::text AS minor FROM (
      SELECT minor FROM agent_payments.reservations WHERE merchant=$1 AND buyer=$2 AND currency=$3 AND budget_period=$4 AND state IN ('held','consumed')
      UNION ALL SELECT minor FROM agent_payments.human_spend WHERE merchant=$1 AND buyer=$2 AND currency=$3 AND budget_period=$4) amounts`,
      [scope.merchantId, scope.buyerId, quote.amount.currency, quote.budgetPeriod],
    );
    const mandateSpent = await client.query(
      "SELECT COALESCE(sum(minor),0)::text AS minor FROM agent_payments.reservations WHERE mandate_id=$1 AND budget_period=$2 AND state IN ('held','consumed')",
      [mandate.mandateId, quote.budgetPeriod],
    );
    requireValue(
      BigInt(spent.rows[0].minor) + BigInt(quote.amount.minor) <=
        BigInt(budget.rows[0].limit_minor),
      'budget_exceeded',
    );
    requireValue(
      BigInt(mandateSpent.rows[0].minor) + BigInt(quote.amount.minor) <=
        BigInt(mandate.policy.perBudgetPeriodMinor),
      'mandate_budget_exceeded',
    );
  }
  await client.query('INSERT INTO agent_payments.period_claims VALUES($1,$2,$3,$4,$5)', [
    ...scopeArgs(scope),
    quote.billingPeriod,
    order.orderId,
  ]);
  await client.query(
    "INSERT INTO agent_payments.reservations VALUES($1,$2,$3,$4,$5,$6,$7,'held')",
    [
      order.orderId,
      scope.merchantId,
      scope.buyerId,
      mandate?.mandateId ?? null,
      quote.amount.currency,
      quote.budgetPeriod,
      quote.amount.minor,
    ],
  );
}
export async function observeHumanSpend(
  client: PoolClient,
  scope: Scope,
  input: { sourceId: string; amount: Money; budgetPeriod: string; billingPeriod: string },
) {
  validScope(scope);
  money(input.amount);
  [input.sourceId, input.budgetPeriod, input.billingPeriod].forEach(text);
  await lockBuyer(client, scope);
  const prior = await client.query(
    'SELECT currency,budget_period,billing_period,minor::text,resource FROM agent_payments.human_spend WHERE merchant=$1 AND buyer=$2 AND source_id=$3',
    [scope.merchantId, scope.buyerId, input.sourceId],
  );
  if (prior.rows[0]) {
    const p = prior.rows[0];
    requireValue(
      p.currency === input.amount.currency &&
        p.minor === input.amount.minor &&
        p.budget_period === input.budgetPeriod &&
        p.billing_period === input.billingPeriod &&
        p.resource === scope.resourceId,
      'human_spend_conflict',
    );
    return;
  }
  const claim = await client.query(
    'SELECT source_id FROM agent_payments.period_claims WHERE merchant=$1 AND buyer=$2 AND resource=$3 AND billing_period=$4',
    [...scopeArgs(scope), input.billingPeriod],
  );
  requireValue(
    !claim.rows[0] || claim.rows[0].source_id === input.sourceId,
    'period_already_claimed',
  );
  await client.query(
    'INSERT INTO agent_payments.period_claims VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [...scopeArgs(scope), input.billingPeriod, input.sourceId],
  );
  await client.query('INSERT INTO agent_payments.human_spend VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [
    ...scopeArgs(scope),
    input.sourceId,
    input.amount.currency,
    input.budgetPeriod,
    input.billingPeriod,
    input.amount.minor,
  ]);
}
