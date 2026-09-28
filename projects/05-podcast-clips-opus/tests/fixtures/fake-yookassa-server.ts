// из N6: projects/06-rag-sales-chatbase/tests/fixtures/fake-yookassa-server.ts — перенесено без изменений логики (фича 30 payments).
// Подменный HTTP-сервер ЮKassa (tariffs-and-interest): НАСТОЯЩИЙ адаптер N4 (apps/web/src/server/payments/yookassa.ts) ходит
// сюда по сети через apiBase — проверяется разбор денег строкой, сверка магазина и режима test, перезапрос и сверка
// заявленного с перезапрошенным, недоступность (5xx) как исключение. Формы объектов — API v3 ЮKassa, как у донора N4.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

export const SHOP_ID = '123456';
export const SECRET = 'test_secret_key';
type Payment = { id: string; status: 'pending' | 'succeeded' | 'canceled'; amount: { value: string; currency: 'RUB' }; paid: boolean; test: boolean;
  recipient: { account_id: string }; metadata: { order_id: string }; confirmation: { type: 'redirect'; confirmation_url: string }; captured_at?: string;
  income_amount?: { value: string; currency: 'RUB' } };

export interface FakeYooKassa {
  apiBase: string;
  payments: Map<string, Payment>;
  created: number;
  // Управление: 5xx на чтение платежа; подмена суммы в ответе перезапроса; платёж создаётся уже оплаченным.
  failReads: boolean;
  readAmountOverride: string | null;
  refunds: Map<string, { id: string; payment_id: string; status: 'succeeded'; amount: { value: string; currency: 'RUB' }; created_at: string }>;
  // ЮKassa держит ключ идемпотентности 24 часа: «забыть» ключи = повтор после суток.
  forgetIdempotence(): void;
  pay(paymentId: string): void;
  cancel(paymentId: string): void;
  refund(paymentId: string): string;
  notification(paymentId: string): string;
  refundNotification(refundId: string): string;
  byOrder(orderId: string): Payment | undefined;
  close(): Promise<void>;
}

const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, '.000Z');
const send = (res: ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
}

export async function startFakeYooKassa(options: { test?: boolean } = {}): Promise<FakeYooKassa> {
  const test = options.test ?? true;
  const byKey = new Map<string, string>();
  const state: Omit<FakeYooKassa, 'apiBase' | 'close'> = {
    payments: new Map(), refunds: new Map(), created: 0, failReads: false, readAmountOverride: null,
    forgetIdempotence() { byKey.clear(); },
    pay(id) { const p = state.payments.get(id)!; p.status = 'succeeded'; p.paid = true; p.captured_at = stamp(); p.income_amount = { value: p.amount.value, currency: 'RUB' }; },
    cancel(id) { const p = state.payments.get(id)!; p.status = 'canceled'; },
    refund(paymentId) {
      const p = state.payments.get(paymentId)!;
      const id = randomUUID();
      state.refunds.set(id, { id, payment_id: paymentId, status: 'succeeded', amount: p.amount, created_at: stamp() });
      return id;
    },
    notification(id) { return JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: state.payments.get(id) }); },
    refundNotification(id) { return JSON.stringify({ type: 'notification', event: 'refund.succeeded', object: state.refunds.get(id) }); },
    byOrder(orderId) { return [...state.payments.values()].find((p) => p.metadata.order_id === orderId); },
  };
  const server: Server = createServer((req, res) => {
    void (async () => {
      const auth = req.headers.authorization ?? '';
      if (auth !== `Basic ${Buffer.from(`${SHOP_ID}:${SECRET}`).toString('base64')}`) return send(res, 401, { type: 'error', code: 'invalid_credentials' });
      const url = new URL(req.url ?? '/', 'http://fake');
      if (req.method === 'POST' && url.pathname === '/payments') {
        const key = String(req.headers['idempotence-key'] ?? '');
        const existing = byKey.get(key);
        if (existing) return send(res, 200, state.payments.get(existing));
        const body = await readBody(req) as { amount: { value: string }; metadata: { order_id: string } };
        const id = randomUUID();
        const payment: Payment = { id, status: 'pending', amount: { value: body.amount.value, currency: 'RUB' }, paid: false, test,
          recipient: { account_id: SHOP_ID }, metadata: { order_id: body.metadata.order_id },
          confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.example/checkout/payments/v2/contract?orderId=${id}` } };
        state.payments.set(id, payment); byKey.set(key, id); state.created++;
        return send(res, 200, payment);
      }
      const pay = /^\/payments\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (req.method === 'GET' && pay) {
        if (state.failReads) return send(res, 500, { type: 'error', code: 'internal_server_error' });
        const p = state.payments.get(pay[1]!);
        if (!p) return send(res, 404, { type: 'error', code: 'not_found' });
        return send(res, 200, state.readAmountOverride ? { ...p, amount: { value: state.readAmountOverride, currency: 'RUB' } } : p);
      }
      const ref = /^\/refunds\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (req.method === 'GET' && ref) {
        if (state.failReads) return send(res, 500, { type: 'error', code: 'internal_server_error' });
        const r = state.refunds.get(ref[1]!);
        return r ? send(res, 200, r) : send(res, 404, { type: 'error', code: 'not_found' });
      }
      send(res, 404, { type: 'error', code: 'not_found' });
    })().catch(() => send(res, 500, { type: 'error' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return Object.assign(state, {
    apiBase: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }) as FakeYooKassa;
}
