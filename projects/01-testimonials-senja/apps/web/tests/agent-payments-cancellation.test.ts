import { randomUUID } from 'node:crypto';
import { afterAll, describe, it, expect, vi } from 'vitest';
import { seed, bound, cleanup, pool, withService, withAccount } from './helpers/n3-fixture';
import { reserveHumanCheckout, attachHumanPayment } from '../src/lib/agent-payments/legacy';
import { recordCheckoutSession } from '../src/lib/payment';
import { beginN3Checkout } from '../src/lib/n3-checkout';
import { applyBridgePayment } from '../src/lib/n3-payment';
import { POST as webhook } from '../src/app/api/webhooks/payment/route';
afterAll(cleanup);
describe('verified cancellation remains releasable across rollout and early callbacks', () => {
  it('disabled checkout canceled without a host hold permits a manual purchase after enable', async () => {
    const a = await seed(false),
      id = randomUUID();
    process.env.AGENT_PAYMENTS_ENABLED = 'false';
    expect(await reserveHumanCheckout(a.accountId, a.projectId)).toBeNull();
    await withAccount(a.accountId, (c) =>
      recordCheckoutSession(
        c,
        a.projectId,
        { providerSessionId: id, redirectUrl: '' },
        randomUUID(),
      ),
    );
    process.env.YOOKASSA_SECRET_KEY = 'isolated-test-only';
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
            metadata: { project_id: a.projectId },
          }),
        ),
    );
    try {
      const response = await webhook(
        new Request('https://proofwall.test/api/webhooks/payment', {
          method: 'POST',
          headers: { 'x-forwarded-for': '185.71.76.1', 'content-type': 'application/json' },
          body: JSON.stringify({ event: 'payment.canceled', object: { id } }),
        }),
      );
      expect(await response.json()).toEqual({ status: 'canceled' });
      expect(
        (
          await pool.query('select status from checkout_sessions where provider_session_id=$1', [
            id,
          ])
        ).rows[0].status,
      ).toBe('expired');
      process.env.AGENT_PAYMENTS_ENABLED = 'true';
      expect((await reserveHumanCheckout(a.accountId, a.projectId))?.requestKey).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('early native cancellation remains retryable until its checkout session exists', async () => {
    const a = await seed(false),
      id = randomUUID();
    process.env.AGENT_PAYMENTS_ENABLED = 'true';
    const admission = await reserveHumanCheckout(a.accountId, a.projectId);
    process.env.YOOKASSA_SECRET_KEY = 'isolated-test-only';
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
            metadata: { project_id: a.projectId },
          }),
        ),
    );
    const request = () =>
      new Request('https://proofwall.test/api/webhooks/payment', {
        method: 'POST',
        headers: { 'x-forwarded-for': '185.71.76.1', 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'payment.canceled', object: { id } }),
      });
    try {
      expect((await webhook(request())).status).toBe(500);
      expect(
        (
          await pool.query('select 1 from webhook_events where event_id=$1', [
            `payment.canceled:${id}`,
          ])
        ).rowCount,
      ).toBe(0);
      await withAccount(a.accountId, (c) =>
        recordCheckoutSession(
          c,
          a.projectId,
          { providerSessionId: id, redirectUrl: '' },
          admission!.requestKey,
        ),
      );
      expect((await webhook(request())).status).toBe(200);
      expect(
        (
          await pool.query('select 1 from agent_payment_human_checkouts where project_id=$1', [
            a.projectId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('early N3 cancellation releases its unbound hold and late provider response cannot hijack a new hold', async () => {
    const a = await seed(true);
    await bound(a.accountId, a.email);
    process.env.AGENT_PAYMENTS_ENABLED = 'true';
    const admission = await reserveHumanCheckout(a.accountId, a.projectId);
    let nextKey = '';
    const externalId = randomUUID();
    const session = await beginN3Checkout(
      a.accountId,
      a.projectId,
      'https://proofwall.test/',
      randomUUID(),
      {
        call: async () => ({
          orderId: externalId,
          amountMinor: 99000,
          currency: 'RUB',
          testMode: true,
        }),
        create: async (_project, _amount, _url, invoiceId) => {
          const id = `pay-${invoiceId}`;
          expect(
            (
              await pool.query(
                'select request_key,provider_id from agent_payment_human_checkouts where project_id=$1',
                [a.projectId],
              )
            ).rows[0],
          ).toEqual({ request_key: invoiceId, provider_id: null });
          await withService((c) =>
            applyBridgePayment(
              c,
              {
                id,
                status: 'canceled',
                paid: false,
                amount: 990,
                currency: 'RUB',
                test: true,
                shopId: 'fixture-shop',
                metadata: {
                  project_id: a.projectId,
                  proofwall_invoice_id: invoiceId,
                  order_id: externalId,
                },
              },
              'payment.canceled',
            ),
          );
          expect(
            (
              await pool.query('select 1 from agent_payment_human_checkouts where project_id=$1', [
                a.projectId,
              ])
            ).rowCount,
          ).toBe(0);
          nextKey = (await reserveHumanCheckout(a.accountId, a.projectId))!.requestKey;
          return { providerSessionId: id, redirectUrl: 'https://yookassa.test/canceled' };
        },
      },
      admission!.requestKey,
    );
    await attachHumanPayment(a.projectId, session!.providerSessionId, admission!.requestKey);
    expect(
      (
        await pool.query(
          'select request_key,provider_id from agent_payment_human_checkouts where project_id=$1',
          [a.projectId],
        )
      ).rows[0],
    ).toEqual({ request_key: nextKey, provider_id: null });
    expect(
      (
        await pool.query('select status from checkout_sessions where provider_session_id=$1', [
          session!.providerSessionId,
        ])
      ).rows[0].status,
    ).toBe('expired');
  });
});
