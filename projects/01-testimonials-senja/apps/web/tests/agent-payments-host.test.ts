import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { seed, bound, cleanup, pool, withService } from './helpers/n3-fixture';
import {
  createPaymentsEngine,
  PostgresStore,
  migrate,
  type ProviderPort,
  type ProviderRequest,
  type ProviderResult,
} from '@course/agent-payments';
import {
  approvePairing,
  startPairing,
  pairingStatus,
  issueEmail,
  verifyEmail,
} from '../src/lib/agent-payments/identity';
import {
  offer,
  proofwallHost,
  PRODUCT,
  moscowMonth,
  fulfill,
} from '../src/lib/agent-payments/host';
import { reserveHumanCheckout, observeLegacyPayment } from '../src/lib/agent-payments/legacy';
import { applyTariffUpgrade, recordCheckoutSession } from '../src/lib/payment';

beforeAll(async () => {
  const exists = (await pool.query("select to_regclass('public.agent_payment_pairings') as name"))
    .rows[0].name;
  if (!exists)
    await pool.query(
      await readFile(
        new URL('../../../packages/db/migrations/020_agent_payments_host.sql', import.meta.url),
        'utf8',
      ),
    );
  await pool.query(
    'alter table agent_payment_orders add column if not exists last_reconciled_at timestamptz',
  );
  await migrate(pool);
  process.env.AGENT_PAYMENTS_ENABLED = 'true';
});
afterAll(cleanup);
async function buyer() {
  const a = await seed(false);
  await bound(a.accountId, a.email);
  const scope = { merchantId: 'proofwall', buyerId: a.accountId, resourceId: a.projectId };
  const slug = (await pool.query('select slug from projects where id=$1', [a.projectId])).rows[0]
    .slug as string;
  return {
    ...a,
    scope,
    slug,
    human: { ...scope, humanId: a.accountId, consentReference: 'test-explicit' },
  };
}
function engineHarness(failFulfillment = false, pending = false) {
  let calls = 0;
  const results = new Map<string, ProviderResult>();
  const provider: ProviderPort = {
    provider: 'test-fixture',
    accountId: 'test-shop',
    test: true,
    supportsSavedMethods: true,
    async create(req: ProviderRequest) {
      calls++;
      const result: ProviderResult = {
        providerId: `host-${req.attemptId}`,
        accountId: 'test-shop',
        test: true,
        orderId: req.orderId,
        attemptId: req.attemptId,
        amount: req.amount,
        status: pending ? 'pending' : 'succeeded',
      };
      results.set(result.providerId, result);
      return result;
    },
    async query(_req, id) {
      return results.get(id || '') || null;
    },
  };
  const engine = createPaymentsEngine({
    store: new PostgresStore(pool),
    host: {
      ...proofwallHost,
      fulfill: async (c, e, o) => {
        const state = await fulfill(c, e, o);
        if (failFulfillment) throw new Error('injected-after-fulfillment');
        return state;
      },
    },
    provider,
  });
  return { engine, calls: () => calls };
}
describe('Proofwall agent host persisted authority and settlement', () => {
  it('pairing is one use; concurrent confirmation issues one grant; polling never returns it', async () => {
    const a = await buyer(),
      { engine } = engineHarness();
    const pair = await startPairing(
      '<img src=x onerror=alert(1)>',
      'proofwall-agent-api',
      randomUUID(),
    );
    const attempts = await Promise.allSettled(
      [1, 2].map(() => approvePairing(a, a.slug, pair.pairingId, engine)),
    );
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await pairingStatus(pair.pairingId, pair.pollToken, randomUUID())).toEqual({
      status: 'approved',
    });
    expect(
      (
        await pool.query('select count(*)::int as n from agent_payments.grants where buyer=$1', [
          a.accountId,
        ])
      ).rows[0].n,
    ).toBe(1);
    await expect(pairingStatus(pair.pairingId, 'x'.repeat(43), randomUUID())).rejects.toMatchObject(
      { code: 'PAIRING_NOT_FOUND' },
    );
  });
  it('dedicated email proof is session-bound, one-use and permits nonreferred buyers', async () => {
    const a = await seed(false);
    const issued = await issueEmail(a, 'proof-ip');
    expect(issued.alreadyVerified).toBe(false);
    if (issued.alreadyVerified) throw new Error('proof missing');
    await expect(verifyEmail({ ...a, sessionHash: 'wrong' }, issued.token)).rejects.toThrow();
    expect(await verifyEmail(a, issued.token)).toBe(true);
    expect(await verifyEmail(a, issued.token)).toBe(false);
    const proof = (
      await pool.query('select email from agent_payment_email_proofs where account_id=$1', [
        a.accountId,
      ])
    ).rows[0];
    expect(proof.email).toBe(a.email);
  });
  it('price and last-three-days policy are authoritative with Moscow calendar boundary', async () => {
    const a = await buyer();
    const now = new Date('2026-09-30T21:00:00Z');
    await pool.query('update projects set paid_until=$2 where id=$1', [
      a.projectId,
      new Date(now.getTime() + 3 * 86400000),
    ]);
    const quote = await offer(a.scope, PRODUCT, now);
    expect(quote.amount).toEqual({ minor: '99000', currency: 'RUB' });
    expect(quote.autonomousEligible).toBe(true);
    expect(quote.budgetPeriod).toBe('2026-10');
    expect(moscowMonth(new Date('2026-09-30T20:59:59Z'))).toBe('2026-09');
    await expect(offer({ ...a.scope, buyerId: randomUUID() }, PRODUCT, now)).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
  });
  it('real module fulfillment uses one transaction, replays once, and two human purchases remain possible', async () => {
    const a = await buyer(),
      { engine, calls } = engineHarness();
    const grant = await engine.issueGrant(a.human, {
      audience: 'proofwall-agent-api',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const agent = { token: grant.token, audience: 'proofwall-agent-api', merchantId: 'proofwall' };
    for (let i = 0; i < 2; i++) {
      const quote = await engine.getOffer(agent, PRODUCT);
      const order = await engine.createOrder(agent, {
        quoteId: quote.quoteId,
        idempotencyKey: randomUUID(),
      });
      expect((await engine.executePayment(agent, { orderId: order.orderId })).nextAction.kind).toBe(
        'human_approval',
      );
      expect(calls()).toBe(i);
      const paid = await engine.approveOrder(a.human, {
        orderId: order.orderId,
        saveMethod: false,
      });
      expect(paid.paymentStatus).toBe('succeeded');
      expect(paid.fulfillmentStatus).toBe('active');
      await engine.reconcile(a.scope, order.orderId);
    }
    expect(calls()).toBe(2);
    const until = (await pool.query('select paid_until from projects where id=$1', [a.projectId]))
      .rows[0].paid_until;
    expect(new Date(until).getTime() - Date.now()).toBeGreaterThan(59.99 * 86400000);
    expect(
      (
        await pool.query(
          "select count(*)::int as n from checkout_sessions where project_id=$1 and status='completed'",
          [a.projectId],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it('manual checkout shares an accepted agent operation; manual-first reservation blocks autonomous admission', async () => {
    const a = await buyer(),
      { engine } = engineHarness(false, true);
    const grant = await engine.issueGrant(a.human, {
      audience: 'proofwall-agent-api',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const agent = { token: grant.token, audience: 'proofwall-agent-api', merchantId: 'proofwall' };
    const quote = await engine.getOffer(agent, PRODUCT),
      order = await engine.createOrder(agent, {
        quoteId: quote.quoteId,
        idempotencyKey: randomUUID(),
      });
    await engine.approveOrder(a.human, { orderId: order.orderId, saveMethod: false });
    const reserved = await reserveHumanCheckout(a.accountId, a.projectId);
    expect(reserved?.redirectUrl).toContain(order.orderId);
    const b = await buyer();
    await reserveHumanCheckout(b.accountId, b.projectId);
    await expect(offer(b.scope, PRODUCT)).rejects.toMatchObject({ code: 'HUMAN_PAYMENT_PENDING' });
  });
  it('bridge fulfillment queues only external commission and replay preserves entitlement', async () => {
    const a = await seed(true);
    await bound(a.accountId, a.email);
    const scope = { merchantId: 'proofwall', buyerId: a.accountId, resourceId: a.projectId };
    const human = { ...scope, humanId: a.accountId, consentReference: 'explicit' };
    const { engine, calls } = engineHarness();
    const partnerId = randomUUID();
    await pool.query(
      "insert into partner_codes(id,code,partner_name,commission_rate) values($1,$2,'external fixture',0.1)",
      [partnerId, randomUUID()],
    );
    await pool.query(
      "insert into referral_attributions(account_id,partner_code_id,source,status) values($1,$2,'promo_code','pending')",
      [a.accountId, partnerId],
    );
    const externalId = randomUUID();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            data: { orderId: externalId, amountMinor: 99000, currency: 'RUB', testMode: true },
          }),
          { status: 200 },
        ),
    );
    try {
      const grant = await engine.issueGrant(human, {
        audience: 'proofwall-agent-api',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      const agent = {
        token: grant.token,
        audience: 'proofwall-agent-api',
        merchantId: 'proofwall',
      };
      const quote = await engine.getOffer(agent, PRODUCT),
        order = await engine.createOrder(agent, {
          quoteId: quote.quoteId,
          idempotencyKey: randomUUID(),
        });
      const paid = await engine.approveOrder(human, { orderId: order.orderId, saveMethod: false });
      expect(paid.paymentStatus).toBe('succeeded');
      await engine.reconcile(scope, order.orderId);
      expect(calls()).toBe(1);
      expect(
        (
          await pool.query(
            "select count(*)::int as n from n3_bridge_outbox where account_id=$1 and kind='payment.succeeded'",
            [a.accountId],
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await pool.query(
            'select count(*)::int as n from commissions where referral_attribution_id in (select id from referral_attributions where account_id=$1)',
            [a.accountId],
          )
        ).rows[0].n,
      ).toBe(0);
      const before = (
        await pool.query('select paid_until from projects where id=$1', [a.projectId])
      ).rows[0].paid_until;
      const client = await pool.connect();
      try {
        await client.query('begin');
        const mapping = (
          await client.query('select provider_id from agent_payment_orders where order_id=$1', [
            order.orderId,
          ])
        ).rows[0];
        await fulfill(
          client,
          {
            eventId: randomUUID(),
            schemaVersion: 1,
            merchantId: 'proofwall',
            buyerId: a.accountId,
            resourceId: a.projectId,
            orderId: order.orderId,
            attemptId: randomUUID(),
            providerId: mapping.provider_id,
            providerAccountId: 'test-shop',
            aggregateVersion: 3,
            type: 'payment.succeeded',
            amount: { minor: '99000', currency: 'RUB' },
            refundedMinor: '0',
            occurredAt: new Date().toISOString(),
            correlationId: randomUUID(),
          },
          paid,
        );
        await client.query('rollback');
      } finally {
        client.release();
      }
      expect(
        (
          await pool.query('select paid_until from projects where id=$1', [a.projectId])
        ).rows[0].paid_until.toISOString(),
      ).toBe(before.toISOString());
    } finally {
      vi.unstubAllGlobals();
      await pool.query(
        'delete from commissions where referral_attribution_id in (select id from referral_attributions where account_id=$1)',
        [a.accountId],
      );
      await pool.query('delete from referral_attributions where account_id=$1', [a.accountId]);
      await pool.query('delete from partner_codes where id=$1', [partnerId]);
    }
  });
  it('failure after local fulfillment rolls back tariff, checkout and event claim together', async () => {
    const a = await buyer(),
      { engine } = engineHarness(true);
    const grant = await engine.issueGrant(a.human, {
      audience: 'proofwall-agent-api',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    const agent = { token: grant.token, audience: 'proofwall-agent-api', merchantId: 'proofwall' };
    const quote = await engine.getOffer(agent, PRODUCT),
      order = await engine.createOrder(agent, {
        quoteId: quote.quoteId,
        idempotencyKey: randomUUID(),
      });
    expect(
      (await engine.approveOrder(a.human, { orderId: order.orderId, saveMethod: false }))
        .paymentStatus,
    ).toBe('unknown');
    expect(
      (await pool.query('select paid_until from projects where id=$1', [a.projectId])).rows[0]
        .paid_until,
    ).toBeNull();
    expect(
      (await pool.query('select 1 from checkout_sessions where project_id=$1', [a.projectId]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query("select 1 from webhook_events where payload->>'orderId'=$1", [
          order.orderId,
        ])
      ).rowCount,
    ).toBe(0);
  });
  it('legacy manual settlement observes spend without any agent TEST credentials and never applies an agent cap', async () => {
    const a = await buyer();
    delete process.env.AGENT_YOOKASSA_TEST_SHOP_ID;
    delete process.env.AGENT_YOOKASSA_TEST_SECRET_KEY;
    const { withAccount } = await import('@proofwall/db');
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      await reserveHumanCheckout(a.accountId, a.projectId);
      await withAccount(a.accountId, (c) =>
        recordCheckoutSession(
          c,
          a.projectId,
          { providerSessionId: id, redirectUrl: '' },
          randomUUID(),
        ),
      );
      await withService(async (c) => {
        await applyTariffUpgrade(c, id);
        await observeLegacyPayment(c, a.projectId, id, '99000');
      });
    }
    expect(
      (
        await pool.query(
          'select sum(minor)::text as total from agent_payments.human_spend where buyer=$1',
          [a.accountId],
        )
      ).rows[0].total,
    ).toBe('198000');
  });
});
