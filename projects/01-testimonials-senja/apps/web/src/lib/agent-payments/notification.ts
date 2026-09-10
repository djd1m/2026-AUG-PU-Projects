import { withService } from '@proofwall/db';
import { reconciliationEngine } from './runtime';
import { lockProject } from './host';
import { enabled, merchantId, UUID, AgentHostError } from './security';

/** Body metadata is only a lookup hint; the module re-fetches and verifies every PSP field. */
export async function agentPaymentNotification(
  event: string,
  objectId: string,
  metadata?: Record<string, unknown>,
): Promise<string | null> {
  if (!enabled() && !metadata?.module_order_id) return null;
  if (!['payment.succeeded', 'payment.canceled', 'refund.succeeded'].includes(event)) return null;
  const hinted = metadata?.module_order_id;
  const row = (
    await withService((c) =>
      c.query(
        `select order_id,account_id,project_id,provider_id from agent_payment_orders
    where provider_id=$1 or order_id=$2`,
        [objectId, typeof hinted === 'string' && UUID.test(hinted) ? hinted : null],
      ),
    )
  ).rows[0];
  if (!row) {
    if (hinted) throw new AgentHostError('ORDER_MAPPING', 409);
    return null;
  }
  if (row.provider_id && event !== 'refund.succeeded' && row.provider_id !== objectId)
    throw new AgentHostError('ORDER_MAPPING', 409);
  const scope = { merchantId: merchantId(), buyerId: row.account_id, resourceId: row.project_id };
  const engine = reconciliationEngine();
  const order =
    event === 'refund.succeeded'
      ? await engine.reconcileRefund(scope, row.order_id, objectId)
      : await engine.reconcile(scope, row.order_id, objectId);
  if (order.paymentStatus === 'canceled') await recordCancellation(row.order_id, scope);
  return order.paymentStatus;
}

/** Dedicated TEST-shop webhook resolver. No legacy credentials or arbitrary URL. */
export async function agentNotificationReference(
  event: string,
  id: string,
): Promise<Record<string, unknown>> {
  const shop = process.env.AGENT_YOOKASSA_TEST_SHOP_ID,
    key = process.env.AGENT_YOOKASSA_TEST_SECRET_KEY;
  if (!shop || !key?.startsWith('test_'))
    throw new AgentHostError('TEST_PROVIDER_NOT_CONFIGURED', 503);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AgentHostError('INVALID_INPUT');
  const get = async (path: string) => {
    const response = await fetch(`https://api.yookassa.ru/v3/${path}`, {
      headers: { authorization: `Basic ${Buffer.from(`${shop}:${key}`).toString('base64')}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new AgentHostError('PROVIDER_UNAVAILABLE', 503);
    return (await response.json()) as Record<string, unknown>;
  };
  let paymentId = id;
  if (event === 'refund.succeeded') {
    const refund = await get(`refunds/${encodeURIComponent(id)}`);
    if (
      refund.id !== id ||
      typeof refund.payment_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(refund.payment_id)
    )
      throw new AgentHostError('REFUND_UNVERIFIED', 409);
    paymentId = refund.payment_id;
  }
  const payment = await get(`payments/${encodeURIComponent(paymentId)}`);
  const recipient = payment.recipient as Record<string, unknown> | undefined,
    metadata = payment.metadata as Record<string, unknown> | undefined;
  if (
    payment.id !== paymentId ||
    payment.test !== true ||
    recipient?.account_id !== shop ||
    !metadata ||
    typeof metadata.module_order_id !== 'string' ||
    !UUID.test(metadata.module_order_id)
  )
    throw new AgentHostError('PAYMENT_UNVERIFIED', 409);
  return metadata;
}

export async function recordCancellation(
  orderId: string,
  scope: { merchantId: string; buyerId: string; resourceId: string },
) {
  await withService(async (c) => {
    await lockProject(c, scope);
    const mapping = (
      await c.query('select invoice_id from agent_payment_orders where order_id=$1 for update', [
        orderId,
      ])
    ).rows[0];
    if (mapping?.invoice_id)
      await c.query(
        "update n3_checkout_intents set state='canceled' where id=$1 and state<>'completed'",
        [mapping.invoice_id],
      );
    await c.query(
      "update agent_payment_orders set state='canceled' where order_id=$1 and state<>'completed'",
      [orderId],
    );
  });
}
