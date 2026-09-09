import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withService } from '@proofwall/db';
import { createRemotePayment, recordCheckoutSession, isStub, type CheckoutSession } from './payment';
import { n3Config, n3Client, N3Error, N3_UUID, externalOrderResult, type N3Call } from './n3-runtime';

export interface N3Intent {
  id: string; account_id: string; project_id: string; request_key: string; order_id: string | null;
  provider_id: string | null; redirect_url: string | null; state: string; created_at: Date;
}
export async function reserveNativeIntent(client: PoolClient, accountId: string, projectId: string, requestKey: string): Promise<N3Intent> {
  if (!N3_UUID.test(requestKey)) throw new N3Error('N3_REQUEST_KEY', 400);
  // RLS lookup was already done by checkout; explicit ownership remains required
  // at this BYPASSRLS boundary and serializes unresolved invoices for this project.
  const project = await client.query('select id from projects where id=$1 and account_id=$2 for update', [projectId, accountId]);
  if (!project.rowCount) throw new N3Error('N3_PROJECT', 404);
  const prior = (await client.query<N3Intent>('select * from n3_checkout_intents where account_id=$1 and request_key=$2', [accountId, requestKey])).rows[0];
  if (prior) {
    if (prior.project_id !== projectId) throw new N3Error('N3_REQUEST_CONFLICT', 409);
    return prior;
  }
  const pending = (await client.query<N3Intent>("select * from n3_checkout_intents where project_id=$1 and state in ('reserved','pending')", [projectId])).rows[0];
  if (pending) return pending;
  const proof = (await client.query(`select p.bound_at from n3_email_proofs p join accounts a on a.id=p.account_id
    where p.account_id=$1 and p.email=a.email`, [accountId])).rows[0];
  if (!proof) throw new N3Error('N3_PROOF_REQUIRED', 409);
  if (!proof.bound_at) throw new N3Error('N3_BIND_PENDING', 503);
  return (await client.query<N3Intent>('insert into n3_checkout_intents(account_id,project_id,request_key) values($1,$2,$3) returning *',
    [accountId, projectId, requestKey])).rows[0]!;
}
export async function saveNativeSession(client: PoolClient, intent: N3Intent, session: CheckoutSession): Promise<void> {
  if (intent.provider_id && intent.provider_id !== session.providerSessionId) throw new N3Error('N3_PAYMENT_CONFLICT', 409);
  // Preserve checkout_sessions INSERT privilege: trusted persisted owner mapping,
  // temporary owner role and RLS, never a blanket service grant.
  await client.query('set local role app_authenticated');
  await client.query("select set_config('app.current_account_id',$1,true)", [intent.account_id]);
  await recordCheckoutSession(client, intent.project_id, session, intent.id);
  await client.query('set local role app_service');
  await client.query(`update n3_checkout_intents set provider_id=$2,redirect_url=coalesce(redirect_url,$3),
    state=case when state='reserved' then 'pending' else state end where id=$1`,
  [intent.id, session.providerSessionId, session.redirectUrl || null]);
}
export async function beginN3Checkout(accountId: string, projectId: string, returnUrl: string, requestKey?: unknown,
  dependencies?: { call: N3Call; create: typeof createRemotePayment }): Promise<CheckoutSession | null> {
  const config = n3Config(); if (!config) return null;
  const context = await withService(client => client.query('select tenant_id from n3_signup_contexts where account_id=$1', [accountId]));
  if (!context.rows[0]) return null;
  if (context.rows[0].tenant_id !== config.tenantId || isStub()) throw new N3Error('N3_CONFIGURATION');
  if (typeof requestKey !== 'string' || !N3_UUID.test(requestKey)) throw new N3Error('N3_REQUEST_KEY', 400);
  let intent = await withService(client => reserveNativeIntent(client, accountId, projectId, requestKey));
  if (intent.state === 'canceled') throw new N3Error('N3_PAYMENT_CANCELED', 409);
  if (intent.state === 'completed' && intent.provider_id) return { providerSessionId: intent.provider_id, redirectUrl: returnUrl };
  if (intent.provider_id && intent.redirect_url) return { providerSessionId: intent.provider_id, redirectUrl: intent.redirect_url };
  if (Date.now() - new Date(intent.created_at).getTime() >= 23 * 3600_000) throw new N3Error('N3_RECONCILIATION', 409);
  const call = dependencies?.call ?? n3Client(config);
  if (!intent.order_id) {
    const orderId = externalOrderResult(await call('external-orders', { customerId: accountId, amountMinor: 99000, idempotencyKey: intent.id }));
    intent = await withService(async client => {
      const current = (await client.query<N3Intent>('select * from n3_checkout_intents where id=$1 for update', [intent.id])).rows[0]!;
      if (current.order_id && current.order_id !== orderId) throw new N3Error('N3_ORDER_MISMATCH');
      await client.query('update n3_checkout_intents set order_id=$2 where id=$1', [intent.id, orderId]);
      return { ...current, order_id: orderId };
    });
  }
  const session = await (dependencies?.create ?? createRemotePayment)(projectId, 990, returnUrl, intent.id,
    { order_id: intent.order_id!, proofwall_invoice_id: intent.id });
  await withService(async client => {
    await client.query('select id from projects where id=$1 for update', [projectId]);
    const current = (await client.query<N3Intent>('select * from n3_checkout_intents where id=$1 for update', [intent.id])).rows[0]!;
    await saveNativeSession(client, current, session);
  });
  return session;
}
export { randomUUID as newCheckoutRequestKey };
