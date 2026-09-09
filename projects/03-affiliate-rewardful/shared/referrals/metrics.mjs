const week = value => {
  const date = new Date(value); date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); return date.getTime();
};
export async function metrics(client, tenantId, state, beneficiaryId, now) {
  const visits = (await client.query(`SELECT count(*)::int AS n FROM referral_visits
    WHERE tenant_id=$1 AND ($2::uuid IS NULL OR beneficiary_id=$2)`, [tenantId, beneficiaryId])).rows[0].n;
  const registrations = (await client.query(`SELECT count(*)::int AS n FROM referral_customers
    WHERE tenant_id=$1 AND ($2::uuid IS NULL OR beneficiary_id=$2)`, [tenantId, beneficiaryId])).rows[0].n;
  const orders = (await client.query(`SELECT provider_id,shop_id,test_mode,input,attribution FROM checkout_orders
    WHERE tenant_id=$1 AND source='connector' AND status='succeeded'
    AND ($2::text IS NULL OR attribution->>'beneficiaryId'=$2)`, [tenantId, beneficiaryId])).rows;
  const payments = new Map(state.payments.filter(p => p.source === 'connector' && p.provider === 'yookassa')
    .map(p => [`${p.accountId}/${p.objectId}`, p]));
  const liveCustomers = new Set(), testCustomers = new Set(), commissions = [], liveCommissions = [];
  for (const order of orders) {
    const payment = payments.get(`${order.shop_id}/${order.provider_id}`);
    if (!payment || payment.testMode !== order.test_mode || payment.bindingId !== order.attribution?.id) continue;
    (order.test_mode ? testCustomers : liveCustomers).add(order.input.customerId);
    if (payment.rewardMinor > 0) {
      commissions.push(payment.paidAt);
      if (!order.test_mode) liveCommissions.push(payment.paidAt);
    }
  }
  const first = list => list.length ? new Date(Math.min(...list.map(Date.parse))).toISOString() : null;
  const firstCommissionAt = first(commissions), firstLiveCommissionAt = first(liveCommissions);
  return { visits, registrations, payingCustomers: liveCustomers.size, testPayingCustomers: testCustomers.size,
    firstCommissionAt, firstLiveCommissionAt,
    activatedThisWeek: firstLiveCommissionAt && week(firstLiveCommissionAt) === week(now) ? 1 : 0, mrr: null };
}
