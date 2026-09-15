// Адаптер ЮKassa — порт из N3 (`04_reuse-map.md`). Проверяется НЕ «ходит ли он в сеть», а то,
// что он отвергает: чужой магазин, чужой режим, чужой адрес и уведомление, не совпавшее с
// перезапрошенным. Сеть перехвачена целиком, наружу тесты не ходят (`testing.md`).

import { describe, expect, it, vi } from 'vitest';
import { createYooKassaProvider } from '../../apps/api/src/payments/yookassa.js';
import { PaymentProviderUnavailable, PaymentVerificationError } from '../../apps/api/src/payments/provider.js';

const SHOP = '123456';
const PAYMENT_ID = '2f3a1b4c-5d6e-4f70-8901-23456789abcd';
const ORDER_ID = '9c1f2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const YOOKASSA_IP = '185.71.76.5';

function paymentObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PAYMENT_ID,
    status: 'succeeded',
    paid: true,
    test: false,
    amount: { value: '1000.00', currency: 'RUB' },
    income_amount: { value: '970.00', currency: 'RUB' },
    recipient: { account_id: SHOP },
    metadata: { order_id: ORDER_ID },
    captured_at: '2026-09-15T10:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function providerWith(remote: Record<string, unknown>, options: { testMode?: boolean } = {}) {
  const fetchImpl = vi.fn(async () => jsonResponse(remote)) as unknown as typeof globalThis.fetch;
  return {
    provider: createYooKassaProvider({ shopId: SHOP, secretKey: 'sk', testMode: options.testMode ?? false, fetchImpl }),
    fetchImpl,
  };
}

function notification(object: Record<string, unknown>, event = 'payment.succeeded'): Uint8Array {
  return Buffer.from(JSON.stringify({ type: 'notification', event, object }), 'utf8');
}

const context = (rawBody: Uint8Array, sourceIp = YOOKASSA_IP) => ({ rawBody, headers: {}, sourceIp });

describe('ЮKassa: подлинность даётся перезапросом, а не уведомлением', () => {
  it('успешный платёж принимается, удержание считается из income_amount', async () => {
    const { provider } = providerWith(paymentObject());
    const result = await provider.verifyNotification(context(notification(paymentObject())));
    expect(result.kind).toBe('payment_succeeded');
    if (result.kind !== 'payment_succeeded') return;
    expect(result.payment.amountMinor).toBe(100_000);
    expect(result.payment.feeMinor).toBe(3_000); // 1000,00 − 970,00
    expect(result.payment.orderId).toBe(ORDER_ID);
  });

  it('нет income_amount — удержание НЕ вычисляется нами, а объявляется неизвестным', async () => {
    const withoutIncome = paymentObject();
    delete withoutIncome.income_amount;
    const { provider } = providerWith(withoutIncome);
    const result = await provider.verifyNotification(context(notification(withoutIncome)));
    if (result.kind !== 'payment_succeeded') throw new Error('ожидался успешный платёж');
    expect(result.payment.feeMinor).toBeNull();
  });

  it('уведомление, РАСХОДЯЩЕЕСЯ с перезапрошенным платежом, отвергается', async () => {
    // Провайдер говорит 1000 ₽, уведомление заявляет 10 000 ₽.
    const { provider } = providerWith(paymentObject());
    const forged = paymentObject({ amount: { value: '10000.00', currency: 'RUB' } });
    await expect(provider.verifyNotification(context(notification(forged)))).rejects.toThrow(PaymentVerificationError);
  });

  it('платёж ЧУЖОГО магазина отвергается', async () => {
    const { provider } = providerWith(paymentObject({ recipient: { account_id: '999999' } }));
    await expect(provider.verifyNotification(context(notification(paymentObject())))).rejects.toThrow(/магазин/);
  });

  it('боевое уведомление в тестовом режиме отвергается', async () => {
    const { provider } = providerWith(paymentObject({ test: false }), { testMode: true });
    await expect(provider.verifyNotification(context(notification(paymentObject())))).rejects.toThrow(/режим/);
  });

  it('чужой адрес источника отвергается ДО обращения к провайдеру', async () => {
    const { provider, fetchImpl } = providerWith(paymentObject());
    await expect(provider.verifyNotification(context(notification(paymentObject()), '203.0.113.7'))).rejects.toThrow(/адрес источника/);
    expect(fetchImpl).not.toHaveBeenCalled(); // ни одного платного/сетевого вызова на шум
  });

  it('событие не о нас — 200 и НИЧЕГО не менять, а не отказ', async () => {
    const { provider } = providerWith(paymentObject());
    const result = await provider.verifyNotification(context(notification(paymentObject(), 'payment.waiting_for_capture')));
    expect(result).toEqual({ kind: 'ignored', event: 'payment.waiting_for_capture' });
  });

  it('пустое тело и мусор вместо JSON отвергаются', async () => {
    const { provider } = providerWith(paymentObject());
    await expect(provider.verifyNotification(context(Buffer.from('')))).rejects.toThrow(/пусто/);
    await expect(provider.verifyNotification(context(Buffer.from('не json')))).rejects.toThrow(/JSON/);
  });
});

describe('ЮKassa: недоступность — ИСКЛЮЧЕНИЕ, а не значение (урок N1)', () => {
  it('таймаут даёт PaymentProviderUnavailable, а не отказ проверки', async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error('timeout');
      error.name = 'TimeoutError';
      throw error;
    }) as unknown as typeof globalThis.fetch;
    const provider = createYooKassaProvider({ shopId: SHOP, secretKey: 'sk', testMode: false, fetchImpl });
    await expect(provider.verifyNotification(context(notification(paymentObject())))).rejects.toThrow(PaymentProviderUnavailable);
  });

  it('5xx провайдера — тоже недоступность: повтор обязан пройти по полному пути', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof globalThis.fetch;
    const provider = createYooKassaProvider({ shopId: SHOP, secretKey: 'sk', testMode: false, fetchImpl });
    await expect(provider.verifyNotification(context(notification(paymentObject())))).rejects.toThrow(PaymentProviderUnavailable);
  });

  it('ответ не-JSON не превращается в «платёж подтверждён»', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })) as unknown as typeof globalThis.fetch;
    const provider = createYooKassaProvider({ shopId: SHOP, secretKey: 'sk', testMode: false, fetchImpl });
    await expect(provider.verifyNotification(context(notification(paymentObject())))).rejects.toThrow(PaymentProviderUnavailable);
  });
});

describe('ЮKassa: создание платежа', () => {
  it('ключ идемпотентности — наш orderId: повтор не создаёт второй платёж', async () => {
    const { provider, fetchImpl } = providerWith(paymentObject({ confirmation: { confirmation_url: 'https://yoomoney.ru/checkout/x' } }));
    await provider.createPayment({ orderId: ORDER_ID, amountMinor: 100_000, returnUrl: 'https://tarelka.example/ok', description: 'Подписка Pro' });
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1];
    expect((init.headers as Record<string, string>)['idempotence-key']).toBe(ORDER_ID);
    expect(JSON.parse(init.body as string).amount).toEqual({ value: '1000.00', currency: 'RUB' });
  });

  it('адрес возврата обязан быть HTTPS без учётных данных', async () => {
    const { provider } = providerWith(paymentObject());
    await expect(provider.createPayment({ orderId: ORDER_ID, amountMinor: 100_000, returnUrl: 'http://tarelka.example/ok', description: 'x' })).rejects.toThrow(/HTTPS/);
    await expect(provider.createPayment({ orderId: ORDER_ID, amountMinor: 100_000, returnUrl: 'https://user:pass@tarelka.example/ok', description: 'x' })).rejects.toThrow(/HTTPS/);
  });
});
