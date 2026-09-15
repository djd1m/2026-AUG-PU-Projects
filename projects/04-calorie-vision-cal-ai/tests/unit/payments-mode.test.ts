// Честность режима платежей (`honest-configuration.md` CFG-S1/I2/I3) и поведение фейка.
// Слой unit: это решения о конфигурации, база и сеть для них не нужны.

import { describe, expect, it } from 'vitest';
import { selectPaymentProvider } from '../../apps/api/src/payments/select-provider.js';
import { createFakePaymentProvider } from '../../apps/api/src/payments/fake.js';
import { PaymentProviderUnavailable, PaymentVerificationError } from '../../apps/api/src/payments/provider.js';

const ORDER = '9c1f2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
const ctx = (rawBody: Uint8Array) => ({ rawBody, headers: {}, sourceIp: '185.71.76.5' });

describe('выбор провайдера: «не настроено» не превращается в «работает»', () => {
  it('отсутствующий и ПУСТОЙ режим — отказ старта, и сообщение называет последствие', () => {
    for (const mode of [undefined, '', '   ']) {
      expect(() => selectPaymentProvider({ N4_PAYMENTS_MODE: mode })).toThrow(/НАСТОЯЩИЕ деньги/);
    }
  });

  it('неизвестное значение режима — отказ с перечислением допустимых', () => {
    for (const mode of ['LIVE', 'prod', 'true', 'test']) {
      expect(() => selectPaymentProvider({ N4_PAYMENTS_MODE: mode }), mode).toThrow(/fake \| live/);
    }
  });

  it('живой режим без ключей валит старт, а НЕ откатывается к фейку', () => {
    expect(() => selectPaymentProvider({ N4_PAYMENTS_MODE: 'live', N4_PAYMENTS_PROVIDER: 'yookassa' })).toThrow(/обязательны/);
    expect(() => selectPaymentProvider({ N4_PAYMENTS_MODE: 'live', N4_PAYMENTS_PROVIDER: 'yookassa', YOOKASSA_SHOP_ID: '1', YOOKASSA_SECRET_KEY: '  ' })).toThrow(/обязательны/);
  });

  it('живой режим без явного YOOKASSA_TEST_MODE валит старт: режим участвует в подлинности', () => {
    expect(() => selectPaymentProvider({ N4_PAYMENTS_MODE: 'live', N4_PAYMENTS_PROVIDER: 'yookassa', YOOKASSA_SHOP_ID: '1', YOOKASSA_SECRET_KEY: 'sk' })).toThrow(/явным true или false/);
  });

  it('режим fake даёт фейк — единственный путь, которым фейк может оказаться включён', () => {
    expect(selectPaymentProvider({ N4_PAYMENTS_MODE: 'fake' }).name).toBe('fake');
  });

  it('живой режим с полным набором даёт настоящего провайдера', () => {
    const provider = selectPaymentProvider({
      N4_PAYMENTS_MODE: 'live', N4_PAYMENTS_PROVIDER: 'yookassa',
      YOOKASSA_SHOP_ID: '123456', YOOKASSA_SECRET_KEY: 'sk', YOOKASSA_TEST_MODE: 'false',
    });
    expect(provider.name).toBe('yookassa');
  });
});

describe('фейк воспроизводит то, что у настоящего провайдера невоспроизводимо по требованию', () => {
  it('повторная доставка ОДНОГО уведомления даёт тот же платёж (дедупликацию делает вызывающий)', async () => {
    const fake = createFakePaymentProvider();
    const payment = await fake.createPayment({ orderId: ORDER, amountMinor: 100_000, returnUrl: 'https://x.invalid/ok', description: 'Pro' });
    const body = fake.notificationFor(payment.id, 'payment_succeeded');
    const first = await fake.verifyNotification(ctx(body));
    const second = await fake.verifyNotification(ctx(body));
    expect(first).toEqual(second);
  });

  it('тот же orderId не создаёт второй платёж — идемпотентность как у настоящего', async () => {
    const fake = createFakePaymentProvider();
    const a = await fake.createPayment({ orderId: ORDER, amountMinor: 100_000, returnUrl: 'https://x.invalid/ok', description: 'Pro' });
    const b = await fake.createPayment({ orderId: ORDER, amountMinor: 100_000, returnUrl: 'https://x.invalid/ok', description: 'Pro' });
    expect(b.id).toBe(a.id);
  });

  it('удержание считается с округлением ВВЕРХ: занижать полученное нельзя', async () => {
    const fake = createFakePaymentProvider({ feeBp: 300 });
    const payment = await fake.createPayment({ orderId: ORDER, amountMinor: 100_001, returnUrl: 'https://x.invalid/ok', description: 'Pro' });
    expect(payment.feeMinor).toBe(3001); // 100001 * 3 % = 3000,03 → 3001
  });

  it('возврат виден отдельным уведомлением и ссылается на исходный платёж', async () => {
    const fake = createFakePaymentProvider();
    const payment = await fake.createPayment({ orderId: ORDER, amountMinor: 100_000, returnUrl: 'https://x.invalid/ok', description: 'Pro' });
    fake.refund(payment.id);
    const result = await fake.verifyNotification(ctx(fake.notificationFor(payment.id, 'refund_succeeded')));
    expect(result.kind).toBe('refund_succeeded');
    if (result.kind !== 'refund_succeeded') return;
    expect(result.refund.paymentId).toBe(payment.id);
    expect(result.refund.amountMinor).toBe(100_000);
  });

  it('недоступность воспроизводима по требованию — иначе откат транзакции нечем проверить', async () => {
    const fake = createFakePaymentProvider({ unavailable: true });
    await expect(fake.createPayment({ orderId: ORDER, amountMinor: 100_000, returnUrl: 'https://x.invalid/ok', description: 'Pro' }))
      .rejects.toThrow(PaymentProviderUnavailable);
  });

  it('уведомление о неизвестном платеже не превращается в подтверждённый платёж', async () => {
    const fake = createFakePaymentProvider();
    const body = Buffer.from(JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: 'pay00000009-0000-4000-8000-000000000000' } }), 'utf8');
    await expect(fake.verifyNotification(ctx(body))).rejects.toThrow(PaymentVerificationError);
  });
});
