import type { PoolClient } from 'pg';
import { withService } from '@proofwall/db';
import { fetchRemotePayment, applyTariffUpgrade, claimWebhookEvent, isStub, type RemotePayment } from './payment';
import { saveNativeSession, type N3Intent } from './n3-checkout';
import { enqueueN3 } from '../../../../services/worker/src/n3-outbox';
import { N3Error, N3_UUID, record } from './n3-runtime';
import { observeLegacyPayment } from './agent-payments/legacy';
import { agentPaymentNotification } from './agent-payments/notification';

export interface VerifiedRefund { id: string; paymentId: string; amountMinor: number }
async function remoteRefund(id: string): Promise<VerifiedRefund> {
  const shop = process.env.YOOKASSA_SHOP_ID, key = process.env.YOOKASSA_SECRET_KEY;
  if (!shop || !key || isStub()) throw new N3Error('N3_PROVIDER_CONFIGURATION');
  const response = await fetch(`${process.env.YOOKASSA_API_URL ?? 'https://api.yookassa.ru/v3'}/refunds/${encodeURIComponent(id)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${shop}:${key}`).toString('base64')}` },
    redirect: 'error', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new N3Error('N3_REFUND_UNAVAILABLE');
  const body: unknown = await response.json();
  if (!record(body) || body.id !== id || body.status !== 'succeeded' || typeof body.payment_id !== 'string'
    || !record(body.amount) || body.amount.currency !== 'RUB' || typeof body.amount.value !== 'string'
    || !/^\d{1,8}\.\d{2}$/.test(body.amount.value)) throw new N3Error('N3_REFUND_UNVERIFIED');
  const amountMinor = Math.round(Number(body.amount.value) * 100);
  if (amountMinor < 1 || amountMinor > 99000) throw new N3Error('N3_REFUND_UNVERIFIED');
  return { id, paymentId: body.payment_id, amountMinor };
}
export function validateBridgePayment(payment: RemotePayment, expectedId: string): void {
  if (isStub() || payment.id !== expectedId || payment.amount !== 990 || payment.currency !== 'RUB'
    || payment.test !== true || !process.env.YOOKASSA_SHOP_ID || payment.shopId !== process.env.YOOKASSA_SHOP_ID
    || !record(payment.metadata) || !N3_UUID.test(String(payment.metadata.order_id ?? ''))
    || !N3_UUID.test(String(payment.metadata.proofwall_invoice_id ?? ''))
    || !N3_UUID.test(String(payment.metadata.project_id ?? ''))) throw new N3Error('N3_PAYMENT_UNVERIFIED', 409);
}
export async function applyBridgePayment(client: PoolClient, payment: RemotePayment, event: string, refund?: VerifiedRefund): Promise<string> {
  validateBridgePayment(payment, payment.id);
  const metadata = payment.metadata!;
  // Project first, then intent, then checkout: the same order as initiation and
  // renewal. Metadata is only a lookup hint and must match the persisted invoice.
  const found = (await client.query<N3Intent>('select * from n3_checkout_intents where id=$1', [metadata.proofwall_invoice_id])).rows[0];
  if (!found) throw new N3Error('N3_INTENT_UNAVAILABLE');
  await client.query('select id from projects where id=$1 for update', [found.project_id]);
  const intent = (await client.query<N3Intent>('select * from n3_checkout_intents where id=$1 for update', [found.id])).rows[0]!;
  if (intent.order_id !== metadata.order_id || intent.project_id !== metadata.project_id
    || (intent.provider_id && intent.provider_id !== payment.id)) throw new N3Error('N3_PAYMENT_BINDING', 409);
  if (event === 'payment.canceled') {
    if (payment.status !== 'canceled') throw new N3Error('N3_PROVIDER_PENDING');
    if (intent.state !== 'completed') await client.query("update n3_checkout_intents set state='canceled',provider_id=$2 where id=$1", [intent.id, payment.id]);
    return 'canceled';
  }
  if (!payment.paid || payment.status !== 'succeeded') throw new N3Error('N3_PROVIDER_PENDING');
  if (refund && refund.paymentId !== payment.id) throw new N3Error('N3_REFUND_UNVERIFIED', 409);
  // Reserve queue capacity before tariff/refund mutations; transaction rollback
  // also undoes the event claim on any failure, so provider delivery stays retryable.
  await enqueueN3(client, intent.account_id, 'payment.succeeded', payment.id,
    { orderId: intent.order_id, event: 'payment.succeeded', objectId: payment.id });
  if (refund) await enqueueN3(client, intent.account_id, 'refund.succeeded', refund.id,
    { orderId: intent.order_id, event: 'refund.succeeded', objectId: refund.id });
  if (await claimWebhookEvent(client, `payment.succeeded:${payment.id}`, { source: 'verified_bridge', paymentId: payment.id })) {
    await saveNativeSession(client, intent, { providerSessionId: payment.id, redirectUrl: '' });
    await applyTariffUpgrade(client, payment.id);
    await observeLegacyPayment(client,intent.project_id,payment.id,'99000');
    await client.query("update n3_checkout_intents set state='completed',completed_at=now() where id=$1", [intent.id]);
  }
  if (refund) {
    const existing = (await client.query('select amount_minor,intent_id from n3_refund_reviews where refund_id=$1', [refund.id])).rows[0];
    if (existing && (existing.amount_minor !== refund.amountMinor || existing.intent_id !== intent.id)) throw new N3Error('N3_REFUND_CONFLICT', 409);
    if (!existing) {
      const total = (await client.query('select coalesce(sum(amount_minor),0)::int as n from n3_refund_reviews where intent_id=$1', [intent.id])).rows[0].n;
      if (total + refund.amountMinor > 99000) throw new N3Error('N3_REFUND_EXCESS', 409);
      await client.query('insert into n3_refund_reviews(refund_id,intent_id,project_id,amount_minor) values($1,$2,$3,$4)',
        [refund.id, intent.id, intent.project_id, refund.amountMinor]);
    }
    await claimWebhookEvent(client, `refund.succeeded:${refund.id}`, { source: 'verified_bridge', refundId: refund.id });
  }
  return refund ? 'refund_manual_review' : 'upgraded';
}
export async function bridgeNotification(event: string, objectId: string): Promise<string | null> {
  // An existing invoice keeps bridge ownership if rollout is later disabled or
  // the connector key rotates. Native entitlement must not depend on N3 uptime.
  if (!['payment.succeeded', 'payment.canceled', 'refund.succeeded'].includes(event)) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(objectId)) throw new N3Error('N3_OBJECT_ID', 400);
  const refund = event === 'refund.succeeded' ? await remoteRefund(objectId) : undefined;
  const paymentId = refund?.paymentId ?? objectId;
  const payment = await fetchRemotePayment(paymentId);
  if (!payment) throw new N3Error('N3_PROVIDER_PENDING');
  const agent = await agentPaymentNotification(event,objectId,payment.metadata);
  if (agent !== null) return agent;
  if (!payment.metadata?.proofwall_invoice_id && !payment.metadata?.order_id) return null;
  validateBridgePayment(payment, paymentId);
  return withService(client => applyBridgePayment(client, payment, event, refund));
}
