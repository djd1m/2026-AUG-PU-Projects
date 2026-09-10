import type { PoolClient } from 'pg';
import type {
  DomainEvent,
  HostPort,
  OrderView,
  Scope,
  ProviderRequest,
} from '@course/agent-payments';
import { withService } from '@proofwall/db';
import { baseUrl } from '../urls';
import { applyTariffUpgrade, claimWebhookEvent, recordCheckoutSession } from '../payment';
import { saveNativeSession, type N3Intent } from '../n3-checkout';
import { convertAttributionOnPayment } from '../referral';
import { enqueueN3 } from '../../../../../services/worker/src/n3-outbox';
import { n3Config, n3Client, externalOrderResult } from '../n3-runtime';
import { AgentHostError, merchantId } from './security';
import { verified } from './identity';
import { importLegacySpend } from './history';

export const PRODUCT = 'proofwall-paid-30-days';
export const TERMS = 'proofwall-paid-30-days-v1';
export const AMOUNT = { minor: '99000', currency: 'RUB' };
export function moscowMonth(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}
export async function lockProject(client: PoolClient, scope: Scope) {
  await client.query('set local role app_service');
  const row = await client.query(
    'select id from projects where id=$1 and account_id=$2 for update',
    [scope.resourceId, scope.buyerId],
  );
  if (scope.merchantId !== merchantId() || !row.rowCount)
    throw new AgentHostError('PROJECT_NOT_FOUND', 404);
}
export async function offer(scope: Scope, productId: string, now = new Date()) {
  if (productId !== PRODUCT) throw new AgentHostError('PRODUCT_NOT_FOUND', 404);
  await importLegacySpend(scope, now, moscowMonth(now));
  return withService(async (client) => {
    const row = (
      await client.query(
        `select p.paid_until,a.email from projects p join accounts a on a.id=p.account_id
      where p.id=$1 and p.account_id=$2`,
        [scope.resourceId, scope.buyerId],
      )
    ).rows[0];
    if (scope.merchantId !== merchantId() || !row)
      throw new AgentHostError('PROJECT_NOT_FOUND', 404);
    if (!(await verified(client, scope.buyerId, row.email)))
      throw new AgentHostError('EMAIL_PROOF_REQUIRED', 409);
    if (
      (
        await client.query('select 1 from agent_payment_human_checkouts where project_id=$1', [
          scope.resourceId,
        ])
      ).rowCount
    )
      throw new AgentHostError('HUMAN_PAYMENT_PENDING', 409);
    const oldPending = await client.query(
      `select 1 from checkout_sessions cs where cs.project_id=$1 and cs.status='pending'
      and not exists(select 1 from agent_payment_orders a where a.provider_id=cs.provider_session_id)
      union all select 1 from n3_checkout_intents ni where ni.project_id=$1 and ni.state in ('reserved','pending')
      and not exists(select 1 from agent_payment_orders a where a.invoice_id=ni.id)`,
      [scope.resourceId],
    );
    if (oldPending.rowCount) throw new AgentHostError('LEGACY_PAYMENT_PENDING', 409);
    const until = row.paid_until ? new Date(row.paid_until) : null;
    const referred = Boolean(
      (await client.query('select 1 from n3_signup_contexts where account_id=$1', [scope.buyerId]))
        .rowCount,
    );
    return {
      productId: PRODUCT,
      amount: AMOUNT,
      termsVersion: TERMS,
      billingPeriod: until ? until.toISOString() : 'initial',
      budgetPeriod: moscowMonth(now),
      expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      autonomousEligible: Boolean(
        until && until.getTime() > now.getTime() && until.getTime() - now.getTime() <= 3 * 86400000,
      ),
      attributionRequired: referred,
      description: 'Proofwall: платный тариф на 30 дней',
    };
  });
}
export async function prepareAttribution(scope: Scope, orderId: string, required: boolean) {
  const mapping = await withService(async (client) => {
    await lockProject(client, scope);
    const previous = (
      await client.query('select * from agent_payment_orders where order_id=$1', [orderId])
    ).rows[0];
    if (previous) {
      if (previous.account_id !== scope.buyerId || previous.project_id !== scope.resourceId)
        throw new AgentHostError('ORDER_CONFLICT', 409);
      return previous;
    }
    const human = await client.query(
      'select 1 from agent_payment_human_checkouts where project_id=$1',
      [scope.resourceId],
    );
    if (human.rowCount) throw new AgentHostError('HUMAN_PAYMENT_PENDING', 409);
    await client.query('reset role');
    const coreOrder = await client.query(
      "select 1 from agent_payments.orders where id=$1 and merchant=$2 and buyer=$3 and resource=$4 and data->>'paymentStatus'='prepared'",
      [orderId, scope.merchantId, scope.buyerId, scope.resourceId],
    );
    await client.query('set local role app_service');
    if (!coreOrder.rowCount) throw new AgentHostError('ORDER_CANCELED', 409);
    let invoiceId: string | null = null;
    if (required) {
      const proof = await client.query(
        `select 1 from n3_email_proofs p join accounts a on a.id=p.account_id
        where p.account_id=$1 and p.email=a.email and p.bound_at is not null`,
        [scope.buyerId],
      );
      if (!proof.rowCount) throw new AgentHostError('ATTRIBUTION_PENDING', 503);
      const pending = await client.query(
        "select 1 from n3_checkout_intents where project_id=$1 and state in ('reserved','pending')",
        [scope.resourceId],
      );
      if (pending.rowCount) throw new AgentHostError('PAYMENT_PENDING', 409);
      invoiceId = (
        await client.query(
          `insert into n3_checkout_intents(account_id,project_id,request_key)
        values($1,$2,$3) returning id`,
          [scope.buyerId, scope.resourceId, orderId],
        )
      ).rows[0].id;
    }
    return (
      await client.query(
        `insert into agent_payment_orders(order_id,account_id,project_id,invoice_id)
      values($1,$2,$3,$4) returning *`,
        [orderId, scope.buyerId, scope.resourceId, invoiceId],
      )
    ).rows[0];
  });
  if (!required) return undefined;
  if (mapping.external_order_id) return mapping.external_order_id as string;
  const config = n3Config();
  if (!config) throw new AgentHostError('ATTRIBUTION_UNAVAILABLE', 503);
  const context = await withService((c) =>
    c.query('select tenant_id from n3_signup_contexts where account_id=$1', [scope.buyerId]),
  );
  if (context.rows[0]?.tenant_id !== config.tenantId)
    throw new AgentHostError('ATTRIBUTION_SCOPE', 409);
  const externalId = externalOrderResult(
    await n3Client(config)('external-orders', {
      customerId: scope.buyerId,
      amountMinor: 99000,
      idempotencyKey: mapping.invoice_id,
    }),
  );
  await withService(async (client) => {
    await lockProject(client, scope);
    const locked = (
      await client.query('select * from agent_payment_orders where order_id=$1 for update', [
        orderId,
      ])
    ).rows[0];
    if (locked.external_order_id && locked.external_order_id !== externalId)
      throw new AgentHostError('ATTRIBUTION_CONFLICT', 409);
    await client.query('update n3_checkout_intents set order_id=$2 where id=$1', [
      mapping.invoice_id,
      externalId,
    ]);
    await client.query('update agent_payment_orders set external_order_id=$2 where order_id=$1', [
      orderId,
      externalId,
    ]);
  });
  return externalId;
}
export async function providerMetadata(request: ProviderRequest) {
  const row = (
    await withService((client) =>
      client.query('select * from agent_payment_orders where order_id=$1', [request.orderId]),
    )
  ).rows[0];
  if (
    !row ||
    row.account_id !== request.scope.buyerId ||
    row.project_id !== request.scope.resourceId
  )
    throw new AgentHostError('ORDER_MAPPING', 409);
  return {
    project_id: row.project_id,
    ...(row.invoice_id
      ? { proofwall_invoice_id: row.invoice_id, order_id: row.external_order_id }
      : {}),
  } as Record<string, string>;
}
async function owned(client: PoolClient, event: DomainEvent) {
  await lockProject(client, {
    merchantId: event.merchantId,
    buyerId: event.buyerId,
    resourceId: event.resourceId,
  });
  const row = (
    await client.query('select * from agent_payment_orders where order_id=$1 for update', [
      event.orderId,
    ])
  ).rows[0];
  if (
    !row ||
    row.account_id !== event.buyerId ||
    row.project_id !== event.resourceId ||
    (row.provider_id && row.provider_id !== event.providerId)
  )
    throw new AgentHostError('ORDER_MAPPING', 409);
  // One physical provider payment has one owner, even if malicious metadata points at it.
  const old = await client.query('select id from checkout_sessions where provider_session_id=$1', [
    event.providerId,
  ]);
  if (old.rowCount && !row.provider_id) throw new AgentHostError('LEGACY_PAYMENT_OWNED', 409);
  await client.query('update agent_payment_orders set provider_id=$2 where order_id=$1', [
    event.orderId,
    event.providerId,
  ]);
  return row;
}
export async function fulfill(
  client: PoolClient,
  event: DomainEvent,
  _order: OrderView,
): Promise<'active'> {
  const row = await owned(client, event);
  if (row.invoice_id) {
    const intent = (
      await client.query<N3Intent>('select * from n3_checkout_intents where id=$1 for update', [
        row.invoice_id,
      ])
    ).rows[0]!;
    await enqueueN3(client, row.account_id, 'payment.succeeded', event.providerId, {
      orderId: row.external_order_id,
      event: 'payment.succeeded',
      objectId: event.providerId,
    });
    await saveNativeSession(client, intent, {
      providerSessionId: event.providerId,
      redirectUrl: '',
    });
  } else {
    await client.query('set local role app_authenticated');
    await client.query("select set_config('app.current_account_id',$1,true)", [row.account_id]);
    await recordCheckoutSession(
      client,
      row.project_id,
      { providerSessionId: event.providerId, redirectUrl: '' },
      row.order_id,
    );
    await client.query('set local role app_service');
  }
  if (
    await claimWebhookEvent(client, `payment.succeeded:${event.providerId}`, {
      source: 'agent_payments',
      orderId: event.orderId,
    })
  ) {
    await applyTariffUpgrade(client, event.providerId);
    if (!row.invoice_id)
      await convertAttributionOnPayment(
        client,
        row.account_id,
        `payment.succeeded:${event.providerId}`,
        990,
      );
  }
  if (row.invoice_id)
    await client.query(
      "update n3_checkout_intents set state='completed',completed_at=now() where id=$1",
      [row.invoice_id],
    );
  await client.query("update agent_payment_orders set state='completed' where order_id=$1", [
    event.orderId,
  ]);
  await client.query('reset role');
  return 'active';
}
export async function refund(
  client: PoolClient,
  event: DomainEvent,
  order: OrderView,
): Promise<'review_required'> {
  const row = await owned(client, event);
  // Preserve other periods and explicitly request review; never blindly remove the tariff.
  await client.query(
    `insert into agent_payment_refund_reviews(order_id,refunded_minor) values($1,$2)
    on conflict(order_id) do update set refunded_minor=greatest(agent_payment_refund_reviews.refunded_minor,excluded.refunded_minor),updated_at=now()`,
    [order.orderId, event.refundedMinor],
  );
  if (row.invoice_id) {
    if (!event.refundId) throw new AgentHostError('REFUND_ID_REQUIRED', 409);
    await enqueueN3(client, row.account_id, 'refund.succeeded', event.refundId, {
      orderId: row.external_order_id,
      event: 'refund.succeeded',
      objectId: event.refundId,
    });
  }
  await client.query('reset role');
  return 'review_required';
}
export const proofwallHost: HostPort = {
  getOffer: offer,
  prepareAttribution: (scope, id, quote) =>
    prepareAttribution(scope, id, quote.attributionRequired),
  approvalUrl: (id) => `${baseUrl()}/agent-payments?orderId=${id}`,
  returnUrl: (id) => `${baseUrl()}/agent-payments?orderId=${id}`,
  lockResource: async (client, scope) => {
    await lockProject(client, scope);
    await client.query('reset role');
  },
  fulfill,
  refund,
};
