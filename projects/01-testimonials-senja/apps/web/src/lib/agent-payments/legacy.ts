import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withService } from '@proofwall/db';
import { lockBuyer, observeHumanSpend, abandonUndispatched } from '@course/agent-payments';
import { baseUrl } from '../urls';
import { isStub } from '../payment';
import { AgentHostError, enabled, merchantId } from './security';
import { lockProject, moscowMonth } from './host';

export async function reserveHumanCheckout(
  accountId: string,
  projectId: string,
): Promise<{ requestKey: string; redirectUrl?: string } | null> {
  if (!enabled()) return null;
  return withService(async (client) => {
    const scope = { merchantId: merchantId(), buyerId: accountId, resourceId: projectId };
    await lockProject(client, scope);
    await client.query('reset role');
    await lockBuyer(client, scope);
    const abandoned = await abandonUndispatched(client, scope);
    await client.query('set local role app_service');
    for (const id of abandoned) {
      const mapping = (
        await client.query(
          'select invoice_id from agent_payment_orders where order_id=$1 for update',
          [id],
        )
      ).rows[0];
      if (mapping?.invoice_id)
        await client.query(
          "update n3_checkout_intents set state='canceled' where id=$1 and state<>'completed'",
          [mapping.invoice_id],
        );
      await client.query(
        "update agent_payment_orders set state='canceled' where order_id=$1 and state<>'completed'",
        [id],
      );
    }
    await client.query('reset role');
    const current = await client.query(
      `select id from agent_payments.orders where merchant=$1 and buyer=$2 and resource=$3
      and data->>'paymentStatus' in ('prepared','action_required','pending','unknown') order by id limit 1`,
      [scope.merchantId, accountId, projectId],
    );
    await client.query('set local role app_service');
    if (current.rowCount)
      return {
        requestKey: randomUUID(),
        redirectUrl: `${baseUrl()}/agent-payments?orderId=${current.rows[0].id}`,
      };
    const oldPending = await client.query(
      `select 1 from checkout_sessions where project_id=$1 and status='pending'
      union all select 1 from n3_checkout_intents where project_id=$1 and state in ('reserved','pending')`,
      [projectId],
    );
    if (oldPending.rowCount) throw new AgentHostError('LEGACY_PAYMENT_PENDING', 409);
    const prior = await client.query(
      'select request_key from agent_payment_human_checkouts where project_id=$1',
      [projectId],
    );
    if (prior.rowCount) throw new AgentHostError('HUMAN_PAYMENT_PENDING', 409);
    const requestKey = randomUUID();
    await client.query(
      'insert into agent_payment_human_checkouts(project_id,account_id,request_key) values($1,$2,$3)',
      [projectId, accountId, requestKey],
    );
    return { requestKey };
  });
}
export async function attachHumanPayment(
  projectId: string,
  providerId: string,
  requestKey?: string,
) {
  if (!requestKey) return;
  await withService((c) =>
    c.query(
      `update agent_payment_human_checkouts set provider_id=$2
    where project_id=$1 and provider_id is null and (request_key=$3 or request_key=(
      select idempotence_key from checkout_sessions where project_id=$1 and provider_session_id=$2))`,
      [projectId, providerId, requestKey],
    ),
  );
}
/** Called only after verified legacy settlement and under project→intent→checkout locks. */
export async function observeLegacyPayment(
  client: PoolClient,
  projectId: string,
  providerId: string,
  minor: string,
) {
  if (isStub()) {
    // A simulated checkout is not verified monetary spend. Release only its own host hold.
    await client.query(
      'delete from agent_payment_human_checkouts where project_id=$1 and provider_id=$2',
      [projectId, providerId],
    );
    return;
  }
  if (
    !(
      await client.query(
        "select exists(select 1 from pg_catalog.pg_tables where schemaname='agent_payments' and tablename='human_spend') as ledger",
      )
    ).rows[0].ledger
  )
    return;
  const owner = (await client.query('select account_id from projects where id=$1', [projectId]))
    .rows[0];
  if (!owner) throw new AgentHostError('PROJECT_NOT_FOUND', 404);
  const scope = { merchantId: merchantId(), buyerId: owner.account_id, resourceId: projectId };
  await client.query('reset role');
  await lockBuyer(client, scope);
  await observeHumanSpend(client, scope, {
    sourceId: `legacy:${providerId}`,
    amount: { minor, currency: 'RUB' },
    budgetPeriod: moscowMonth(new Date()),
    billingPeriod: `legacy:${providerId}`,
  });
  await client.query('set local role app_service');
  await client.query('delete from agent_payment_human_checkouts where project_id=$1', [projectId]);
}

export async function releaseUndispatchedHuman(projectId: string, requestKey?: string) {
  if (requestKey)
    await withService((c) =>
      c.query(
        'delete from agent_payment_human_checkouts where project_id=$1 and provider_id is null and request_key=$2',
        [projectId, requestKey],
      ),
    );
}

/** Caller has independently fetched a canceled PSP payment; unknown results never use this. */
export async function releaseCanceledHuman(
  client: PoolClient,
  projectId: string,
  providerId: string,
  verifiedInvoiceId?: string,
) {
  const owner = (
    await client.query('select account_id from projects where id=$1 for update', [projectId])
  ).rows[0];
  if (!owner) return false;
  const checkout = (
    await client.query(
      'select id,idempotence_key from checkout_sessions where project_id=$1 and provider_session_id=$2 for update',
      [projectId, providerId],
    )
  ).rows[0];
  const deleted = await client.query(
    `delete from agent_payment_human_checkouts where project_id=$1
    and (provider_id=$2 or (provider_id is null and request_key=$3)) returning project_id`,
    [projectId, providerId, checkout?.idempotence_key ?? verifiedInvoiceId ?? null],
  );
  if (checkout)
    await client.query(
      "update checkout_sessions set status='expired' where id=$1 and status='pending'",
      [checkout.id],
    );
  return Boolean(deleted.rowCount || checkout);
}
