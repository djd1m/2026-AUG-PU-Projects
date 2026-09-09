import { createServer } from 'node:https';
import { randomUUID } from 'node:crypto';
import { P1, PAY, MAIL, PROVIDER, socket, required, tlsConfig, listenSocket, readJson, json } from './tls.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
function check(condition, message) { if (!condition) throw Object.assign(new Error(message), { harnessReason: message }); }
export async function startProvider({ webhookFetch }) {
  const payments = new Map(), refunds = new Map(), intents = new Map(), messages = new Map(), calls = [], failures = [];
  const auth = `Basic ${Buffer.from(`${required('YOOKASSA_SHOP_ID')}:${required('YOOKASSA_SECRET_KEY')}`).toString('base64')}`;
  const mailAuth = `Bearer ${required('RESEND_API_KEY')}`;
  const notify = async (event, object) => {
    const response = await webhookFetch(`${P1}/api/webhooks/payment`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'notification', event, object }),
      redirect: 'error', signal: AbortSignal.timeout(20000) });
    check(response.ok, 'P1 provider notification rejected');
    return { status: response.status, result: await response.json() };
  };
  const publicPayment = payment => ({ id: payment.id, status: payment.status, amount: payment.amount, metadata: payment.metadata,
    confirmationUrl: payment.confirmation.confirmation_url, returnUrl: payment.returnUrl });
  const server = await listenSocket(createServer(await tlsConfig(), async (req, res) => {
    try {
      const host = req.headers.host, url = new URL(req.url, `https://${host}`);
      if (url.origin === MAIL && req.method === 'POST' && url.pathname === '/emails') {
        check(req.headers.authorization === mailAuth && req.headers['x-bridge-test-client'] === 'p1', 'Mail authentication');
        const message = await readJson(req); check(Array.isArray(message.to) && message.to.length === 1, 'Mail recipient');
        check(message.to[0].endsWith('@example.test'), 'Synthetic mail only');
        messages.set(message.to[0], message); return json(res, { id: randomUUID() });
      }
      if (url.origin === PROVIDER) {
        check(req.headers.authorization === auth, 'Provider authentication');
        const client = req.headers['x-bridge-test-client']; check(['p1', 'n3'].includes(client), 'Provider caller');
        calls.push({ client, method: req.method, path: url.pathname });
        if (req.method === 'POST' && url.pathname === '/v3/payments') {
          check(client === 'p1', 'Only native P1 checkout may create payment');
          const input = await readJson(req), key = req.headers['idempotence-key'];
          check(UUID.test(key || ''), 'Stable invoice UUID required');
          check(input.amount?.value === '990.00' && input.amount.currency === 'RUB', 'Server price');
          for (const field of ['project_id', 'proofwall_invoice_id', 'order_id']) check(UUID.test(input.metadata?.[field] || ''), `Required ${field}`);
          check(input.metadata.proofwall_invoice_id === key, 'Invoice idempotence key');
          const returnUrl = new URL(input.confirmation?.return_url);
          check(returnUrl.origin === P1 && returnUrl.pathname.startsWith('/dashboard/'), 'Native return URL');
          const fingerprint = JSON.stringify(input), old = intents.get(key);
          if (old) { check(old.fingerprint === fingerprint, 'Idempotence body conflict'); return json(res, payments.get(old.id)); }
          const id = randomUUID();
          const payment = { id, status: 'pending', paid: false, refundable: false, test: true,
            amount: input.amount, recipient: { account_id: required('YOOKASSA_SHOP_ID') }, metadata: input.metadata,
            confirmation: { type: 'redirect', confirmation_url: `${PAY}/bridge-pay/${id}` }, returnUrl: returnUrl.href,
            created_at: new Date().toISOString() };
          payments.set(id, payment); intents.set(key, { id, fingerprint }); return json(res, payment);
        }
        if (req.method === 'GET' && /^\/v3\/(payments|refunds)\/[^/]+$/.test(url.pathname)) {
          const ledger = url.pathname.includes('/refunds/') ? refunds : payments, value = ledger.get(url.pathname.split('/').at(-1));
          return json(res, value || { error: 'not_found' }, value ? 200 : 404);
        }
      }
      if (url.origin === PAY && /^\/bridge-pay\/[0-9a-f-]+$/.test(url.pathname)) {
        const payment = payments.get(url.pathname.split('/').at(-1)); check(payment, 'Unknown payment');
        if (req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          return res.end(`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width"><title>Тестовый провайдер</title><main><h1>Тестовая оплата 990 ₽</h1><p>Эмулятор внешнего платёжного API. Реального списания нет.</p><form method="post" action="/bridge-pay/${payment.id}"><button id="provider-pay" type="submit">Подтвердить тестовый платёж</button></form></main></html>`);
        }
        if (req.method === 'POST') {
          check(req.headers.origin === PAY, 'Provider UI origin');
          if (!payment.paid) Object.assign(payment, { status: 'succeeded', paid: true, refundable: true, captured_at: new Date().toISOString() });
          await notify('payment.succeeded', payment);
          res.writeHead(303, { location: payment.returnUrl }); return res.end();
        }
      }
      json(res, { error: 'Fake provider route refused' }, 404);
    } catch (error) { failures.push(error.harnessReason || 'Malformed fixture request'); json(res, { error: 'Fake provider request rejected' }, 400); }
  }), socket('providers'));
  return { server,
    state: () => ({ payments: [...payments.values()].map(publicPayment), refunds: [...refunds.values()], calls: [...calls], failures: [...failures] }),
    mailLink(email) {
      const message = messages.get(email); if (!message) return null;
      const link = message.text?.match(/https:\/\/proofwall\.aicoding\.space\/n3\/verify#[A-Za-z0-9_-]+/)?.[0];
      check(link, 'Real proof message missing fragment link'); messages.delete(email); return link;
    },
    async replay(id) { const payment = payments.get(id); check(payment?.paid, 'Paid payment required'); return notify('payment.succeeded', payment); },
    async refund(id, amountMinor = 49500) {
      const payment = payments.get(id); check(payment?.paid && Number.isSafeInteger(amountMinor) && amountMinor > 0, 'Refund input');
      const previous = [...refunds.values()].filter(x => x.payment_id === id).reduce((sum, x) => sum + Math.round(Number(x.amount.value) * 100), 0);
      check(previous + amountMinor <= 99000, 'Refund exceeds payment');
      const refund = { id: randomUUID(), payment_id: id, status: 'succeeded', amount: { value: (amountMinor / 100).toFixed(2), currency: 'RUB' }, created_at: new Date().toISOString() };
      refunds.set(refund.id, refund); await notify('refund.succeeded', refund); return { refundId: refund.id };
    },
    async replayRefund(id) { const refund = refunds.get(id); check(refund, 'Refund required'); return notify('refund.succeeded', refund); },
    clear() { messages.clear(); payments.clear(); refunds.clear(); intents.clear(); calls.length = 0; failures.length = 0; },
  };
}
