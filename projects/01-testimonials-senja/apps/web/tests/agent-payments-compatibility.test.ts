import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import {
  createPaymentsEngine,
  PostgresStore,
  migrate,
  type ProviderRequest,
  type ProviderResult,
} from '@course/agent-payments';
import { seed, bound, cleanup, pool, withService, withAccount } from './helpers/n3-fixture';
import {
  proofwallHost,
  PRODUCT,
  TERMS,
  AMOUNT,
  offer,
  moscowMonth,
} from '../src/lib/agent-payments/host';
import {
  reserveHumanCheckout,
  attachHumanPayment,
  observeLegacyPayment,
} from '../src/lib/agent-payments/legacy';
import { recordCheckoutSession, applyTariffUpgrade, claimWebhookEvent } from '../src/lib/payment';
import { reconcileBatch } from '../src/lib/agent-payments/reconcile';
import { POST as webhook } from '../src/app/api/webhooks/payment/route';

beforeAll(async () => {
  await migrate(pool);
  await pool.query(
    'alter table agent_payment_orders add column if not exists last_reconciled_at timestamptz',
  );
});
afterAll(cleanup);
async function fixture(failInitially = false) {
  process.env.AGENT_PAYMENTS_ENABLED = 'true';
  const a = await seed(false);
  await bound(a.accountId, a.email);
  const scope = { merchantId: 'proofwall', buyerId: a.accountId, resourceId: a.projectId },
    human = { ...scope, humanId: a.accountId, consentReference: 'explicit-human' };
  let creates = 0,
    fail = failInitially;
  const results = new Map<string, ProviderResult>();
  const engine = createPaymentsEngine({
    store: new PostgresStore(pool),
    host: {
      ...proofwallHost,
      fulfill: async (c, e, o) => {
        const value = await proofwallHost.fulfill(c, e, o);
        if (fail) throw new Error('temporary-local-failure');
        return value;
      },
    },
    provider: {
      provider: 'test-fixture',
      accountId: 'test-shop',
      test: true,
      supportsSavedMethods: true,
      async create(req: ProviderRequest) {
        creates++;
        const result: ProviderResult = {
          providerId: `compat-${req.attemptId}`,
          accountId: 'test-shop',
          test: true,
          orderId: req.orderId,
          attemptId: req.attemptId,
          amount: req.amount,
          status: 'succeeded',
        };
        results.set(result.providerId, result);
        return result;
      },
      async query(_req, id) {
        return results.get(id || '') || null;
      },
    },
  });
  const grant = await engine.issueGrant(human, {
    audience: 'proofwall-agent-api',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const agent = { token: grant.token, audience: 'proofwall-agent-api', merchantId: 'proofwall' };
  return {
    a,
    scope,
    human,
    engine,
    agent,
    grant,
    creates: () => creates,
    resume: () => {
      fail = false;
    },
  };
}
describe('agent host preserves manual journeys and recovers accepted orders', () => {
  it('expired or revoked-grant preparations cannot hold manual checkout hostage', async () => {
    for (const expire of [false, true]) {
      const f = await fixture();
      const quote = await f.engine.getOffer(f.agent, PRODUCT);
      const order = await f.engine.createOrder(f.agent, {
        quoteId: quote.quoteId,
        idempotencyKey: randomUUID(),
      });
      if (expire)
        await pool.query(
          "update agent_payments.orders set data=jsonb_set(data,'{quote,expiresAt}',to_jsonb('2000-01-01T00:00:00Z'::text)) where id=$1",
          [order.orderId],
        );
      await f.engine.revokeGrant(f.human, f.grant.grantId);
      const manual = await reserveHumanCheckout(f.a.accountId, f.a.projectId);
      expect(manual?.redirectUrl).toBeUndefined();
      expect(manual?.requestKey).toBeTruthy();
      expect(f.creates()).toBe(0);
      expect(
        (
          await pool.query(
            "select data->>'paymentStatus' as state from agent_payments.orders where id=$1",
            [order.orderId],
          )
        ).rows[0].state,
      ).toBe('canceled');
    }
  });
  it('verified canceled native payment releases only its hold and permits retry', async () => {
    const f = await fixture();
    const manual = await reserveHumanCheckout(f.a.accountId, f.a.projectId),
      id = randomUUID();
    await withAccount(f.a.accountId, (c) =>
      recordCheckoutSession(
        c,
        f.a.projectId,
        { providerSessionId: id, redirectUrl: '' },
        manual!.requestKey,
      ),
    );
    await attachHumanPayment(f.a.projectId, id, manual!.requestKey);
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            id,
            status: 'canceled',
            paid: false,
            test: true,
            recipient: { account_id: 'fixture-shop' },
            amount: { value: '990.00', currency: 'RUB' },
            metadata: { project_id: f.a.projectId },
          }),
        ),
    );
    process.env.YOOKASSA_SECRET_KEY = 'isolated-test-only';
    try {
      const result = await webhook(
        new Request('https://proofwall.test/api/webhooks/payment', {
          method: 'POST',
          headers: { 'x-forwarded-for': '185.71.76.1', 'content-type': 'application/json' },
          body: JSON.stringify({ event: 'payment.canceled', object: { id } }),
        }),
      );
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual({ status: 'canceled' });
      expect(
        (
          await pool.query('select status from checkout_sessions where provider_session_id=$1', [
            id,
          ])
        ).rows[0].status,
      ).toBe('expired');
      expect((await reserveHumanCheckout(f.a.accountId, f.a.projectId))?.requestKey).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('disabled manual settlement remains observed and previously missing current-month gross is imported once', async () => {
    const f = await fixture(),
      id = randomUUID();
    await withAccount(f.a.accountId, (c) =>
      recordCheckoutSession(
        c,
        f.a.projectId,
        { providerSessionId: id, redirectUrl: '' },
        randomUUID(),
      ),
    );
    process.env.AGENT_PAYMENTS_ENABLED = 'false';
    await withService(async (c) => {
      await claimWebhookEvent(c, `payment.succeeded:${id}`, { source: 'verified-test' });
      await applyTariffUpgrade(c, id);
      await observeLegacyPayment(c, f.a.projectId, id, '99000');
    });
    expect(
      (
        await pool.query(
          'select count(*)::int as n from agent_payments.human_spend where buyer=$1',
          [f.a.accountId],
        )
      ).rows[0].n,
    ).toBe(1);
    // Simulate a verified checkout before the module was first installed.
    await pool.query('delete from agent_payments.human_spend where buyer=$1', [f.a.accountId]);
    let queries = 0;
    vi.stubGlobal('fetch', async () => {
      queries++;
      return new Response(
        JSON.stringify({
          id,
          status: 'succeeded',
          paid: true,
          test: true,
          recipient: { account_id: 'fixture-shop' },
          amount: { value: '990.00', currency: 'RUB' },
        }),
      );
    });
    process.env.YOOKASSA_SECRET_KEY = 'isolated-test-only';
    process.env.AGENT_PAYMENTS_ENABLED = 'true';
    try {
      await offer(f.scope, PRODUCT);
      await offer(f.scope, PRODUCT);
      expect(queries).toBe(1);
      const spend = (
        await pool.query(
          'select minor::text,budget_period from agent_payments.human_spend where buyer=$1',
          [f.a.accountId],
        )
      ).rows[0];
      expect(spend).toEqual({ minor: '99000', budget_period: moscowMonth(new Date()) });
      await pool.query("update projects set paid_until=now()+interval '2 days' where id=$1", [
        f.a.projectId,
      ]);
      await pool.query('insert into agent_payments.methods values($1,$2,$3,$4,$5,$6)', [
        f.scope.merchantId,
        f.scope.buyerId,
        f.scope.resourceId,
        'test-fixture',
        'test-shop',
        { reference: 'saved-fixture', test: true, consentOrderId: 'human-fixture' },
      ]);
      await f.engine.createMandate(f.human, {
        productId: PRODUCT,
        amount: AMOUNT,
        termsVersion: TERMS,
        validUntil: new Date(Date.now() + 86400000).toISOString(),
        perPaymentMinor: '99000',
        perBudgetPeriodMinor: '99000',
        sharedBudgetMinor: '99000',
        calendar: 'Europe/Moscow',
      });
      const renewalQuote = await f.engine.getOffer(f.agent, PRODUCT);
      const renewal = await f.engine.createOrder(f.agent, {
        quoteId: renewalQuote.quoteId,
        idempotencyKey: randomUUID(),
      });
      await expect(
        f.engine.executePayment(f.agent, { orderId: renewal.orderId }),
      ).rejects.toMatchObject({ code: 'budget_exceeded' });
      expect(f.creates()).toBe(0);
      expect((await reserveHumanCheckout(f.a.accountId, f.a.projectId))?.requestKey).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('legacy simulated checkout does not become a real zero-value budget entry', async () => {
    const f = await fixture();
    process.env.PAYMENTS_STUB = 'true';
    process.env.AGENT_PAYMENTS_ENABLED = 'false';
    try {
      await withService((c) => observeLegacyPayment(c, f.a.projectId, randomUUID(), '0'));
      expect(
        (
          await pool.query('select 1 from agent_payments.human_spend where buyer=$1', [
            f.a.accountId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      process.env.PAYMENTS_STUB = 'false';
    }
  });
  it('bounded query-only reconciliation retries failed local fulfillment after issuance is disabled', async () => {
    const f = await fixture(true),
      quote = await f.engine.getOffer(f.agent, PRODUCT);
    const order = await f.engine.createOrder(f.agent, {
      quoteId: quote.quoteId,
      idempotencyKey: randomUUID(),
    });
    expect(
      (await f.engine.approveOrder(f.human, { orderId: order.orderId, saveMethod: false }))
        .paymentStatus,
    ).toBe('unknown');
    f.resume();
    process.env.AGENT_PAYMENTS_ENABLED = 'false';
    const counts = await reconcileBatch(() => f.engine);
    expect(counts.scanned).toBeLessThanOrEqual(5);
    expect(counts.completed).toBeGreaterThanOrEqual(1);
    expect(f.creates()).toBe(1);
    expect(
      (await pool.query('select paid_until from projects where id=$1', [f.a.projectId])).rows[0]
        .paid_until,
    ).not.toBeNull();
    expect((await f.engine.getOrder(f.agent, order.orderId)).paymentStatus).toBe('succeeded');
  });
});
