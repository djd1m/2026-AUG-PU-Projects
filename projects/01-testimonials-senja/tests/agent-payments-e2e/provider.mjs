import { createServer } from 'node:https';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { ORIGIN, PROVIDER, MAIL, PAY, socket, tlsConfig, listen, body, json } from './network.mjs';
export async function startProvider({ notify, shop, key, mailKey }) {
  const payments = new Map(), intents = new Map(), messages = new Map(), creates = [];
  const auth = `Basic ${Buffer.from(`${shop}:${key}`).toString('base64')}`;
  const server = await listen(createServer(await tlsConfig(), async (req, res) => {
    try {
      const url = new URL(req.url, `https://${req.headers.host}`);
      if (url.origin === MAIL && req.method === 'POST' && url.pathname === '/emails') {
        assert.equal(req.headers.authorization, `Bearer ${mailKey}`); const input = await body(req);
        assert.ok(input.to[0].endsWith('@example.test')); messages.set(input.to[0], input);
        return json(res, { id: randomUUID() });
      }
      if (url.origin === PROVIDER) {
        assert.equal(req.headers.authorization, auth);
        if (req.method === 'POST' && url.pathname === '/v3/payments') {
          const input = await body(req), key = req.headers['idempotence-key'];
          assert.match(key, /^[0-9a-f-]{36}$/); assert.deepEqual(input.amount, { value: '990.00', currency: 'RUB' });
          for (const field of ['module_order_id', 'module_attempt_id', 'module_buyer_id', 'module_resource_id', 'project_id']) assert.match(input.metadata[field], /^[0-9a-f-]{36}$/);
          assert.equal(input.metadata.module_merchant_id, 'proofwall');
          creates.push({ saved: Boolean(input.payment_method_id), orderId: input.metadata.module_order_id });
          if (intents.has(key)) return json(res, payments.get(intents.get(key)));
          const id = randomUUID(), autonomous = Boolean(input.payment_method_id);
          if (autonomous) assert.equal(input.payment_method_id, 'fixture-saved-method');
          const result = { id, status: autonomous ? 'succeeded' : 'pending', paid: autonomous, test: true,
            recipient: { account_id: shop }, amount: input.amount, metadata: input.metadata,
            payment_method: { id: 'fixture-saved-method', saved: autonomous },
            ...(autonomous ? {} : { confirmation: { type: 'redirect', confirmation_url: `${PAY}/agent-pay/${id}` } }),
            created_at: new Date().toISOString(), returnUrl: input.confirmation?.return_url, saveRequested: input.save_payment_method === true };
          if (!autonomous) assert.equal(new URL(result.returnUrl).origin, ORIGIN);
          payments.set(id, result); intents.set(key, id); return json(res, result);
        }
        if (req.method === 'GET' && /^\/v3\/payments\/[0-9a-f-]+$/.test(url.pathname)) {
          const result = payments.get(url.pathname.split('/').at(-1)); return json(res, result || {}, result ? 200 : 404);
        }
      }
      if (url.origin === PAY && /^\/agent-pay\/[0-9a-f-]+$/.test(url.pathname)) {
        const payment = payments.get(url.pathname.split('/').at(-1)); assert.ok(payment);
        if (req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width"><title>TEST hosted payment</title><main><h1>Тестовая оплата 990 ₽</h1><p>Изолированный HTTP-эмулятор. Реального списания нет.</p><form method="post"><button id="provider-pay">Подтвердить тестовый платёж</button></form></main></html>`);
        }
        assert.equal(req.method, 'POST'); assert.equal(req.headers.origin, PAY);
        payment.status = 'succeeded'; payment.paid = true; payment.payment_method.saved = payment.saveRequested;
        await notify(payment); res.writeHead(303, { location: payment.returnUrl }); return res.end();
      }
      json(res, { error: 'Fixture route refused' }, 404);
    } catch (error) { console.error('Fixture rejected request; provider/account/shape assertion failed'); json(res, { error: 'Fixture request refused' }, 400); }
  }), socket('provider'));
  return { server, creates, payments,
    mailLink(email) { const value = messages.get(email)?.text?.match(/https:\/\/agent-proofwall\.test\/agent-payments#[A-Za-z0-9_-]+/)?.[0]; assert.ok(value, 'Actual email fixture delivery contains proof fragment'); messages.delete(email); return value; },
    replay: id => notify(payments.get(id)),
  };
}
