// Детерминированный фейк платёжного провайдера.
//
// ЗАЧЕМ ОН ЕСТЬ, а не «пока подключим ЮKassa в тестовом режиме»: ключей нет и ИП ещё нет
// (OWN-007), а главное — тесты не ходят в интернет (`testing.md`). Фейк обязан уметь то, что
// у настоящего провайдера случается редко и невоспроизводимо по требованию: повторную
// доставку, доставку не по порядку, возврат, чарджбэк и собственную недоступность.
//
// ЧЕСТНОСТЬ РЕЖИМА: прогон на фейке НИКОГДА не объявляется проверкой приёма денег. Живой
// режим включается явным `N4_PAYMENTS_MODE=live`, и тогда отсутствие ключа валит старт
// (`honest-configuration.md` CFG-S1) — тихой подмены живого провайдера фейком не бывает.

import {
  PaymentProviderUnavailable,
  PaymentVerificationError,
  type CreatePaymentInput,
  type NotificationContext,
  type PaymentProvider,
  type RemotePayment,
  type RemoteRefund,
  type VerifiedNotification,
} from './provider.js';

export interface FakeScript {
  /** Доля удержания провайдера в базисных пунктах: 300 = 3 %. */
  readonly feeBp?: number;
  /** Сделать провайдера недоступным — для проверки отката транзакции. */
  readonly unavailable?: boolean;
  /** Отвечать на перезапрос суммой, отличной от заявленной уведомлением. */
  readonly remoteAmountOverrideMinor?: number;
}

interface FakeState {
  readonly payments: Map<string, RemotePayment>;
  readonly refunds: Map<string, RemoteRefund>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function feeFor(amountMinor: number, feeBp: number): number {
  // Округление ВВЕРХ: удержание провайдера не бывает меньше объявленного, и завышать
  // полученное нам нельзя (ADR-011 считает комиссию именно от него).
  return Math.ceil((amountMinor * feeBp) / 10_000);
}

export interface FakePaymentProvider extends PaymentProvider {
  /** Найти платёж по НАШЕМУ идентификатору намерения — тесту иначе неоткуда взять id платежа. */
  getPaymentByOrder(orderId: string): Promise<RemotePayment>;
  /** Перенять состояние другого фейка: тест подменяет провайдера «сломанным» и обратно,
   * а платежи при этом обязаны остаться теми же — у настоящего провайдера они на его стороне. */
  adoptStateFrom(other: FakePaymentProvider): void;
  /** Внутреннее состояние для `adoptStateFrom`. */
  readonly __state: { readonly payments: Map<string, RemotePayment>; readonly refunds: Map<string, RemoteRefund> };
  /** Сформировать уведомление так, как его прислал бы провайдер. */
  notificationFor(paymentId: string, kind: 'payment_succeeded' | 'refund_succeeded'): Uint8Array;
  /** Пометить платёж возвращённым (возврат инициируется вне продукта — в кабинете провайдера). */
  refund(paymentId: string, amountMinor?: number): RemoteRefund;
  script: FakeScript;
}

export function createFakePaymentProvider(script: FakeScript = {}): FakePaymentProvider {
  const state: FakeState = { payments: new Map(), refunds: new Map() };
  let counter = 0;
  const nextId = (prefix: string): string => {
    counter += 1;
    return `${prefix}${String(counter).padStart(8, '0')}-0000-4000-8000-000000000000`.slice(0, 36);
  };

  function assertAvailable(): void {
    if (script.unavailable === true) throw new PaymentProviderUnavailable('фейк настроен недоступным');
  }

  const provider: FakePaymentProvider = {
    name: 'fake',
    script,
    __state: state,

    async getPaymentByOrder(orderId: string): Promise<RemotePayment> {
      const payment = [...state.payments.values()].find((p) => p.orderId === orderId);
      if (payment === undefined) throw new PaymentVerificationError('платёж по этому намерению не создан');
      return payment;
    },

    adoptStateFrom(other: FakePaymentProvider): void {
      for (const [id, payment] of other.__state.payments) state.payments.set(id, payment);
      for (const [id, refund] of other.__state.refunds) state.refunds.set(id, refund);
    },

    async createPayment(input: CreatePaymentInput): Promise<RemotePayment> {
      assertAvailable();
      if (!UUID.test(input.orderId)) throw new PaymentVerificationError('orderId обязан быть каноническим UUID');
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new PaymentVerificationError('сумма обязана быть положительным целым числом копеек');
      }
      // Идемпотентность настоящего провайдера воспроизводится: тот же orderId — тот же платёж.
      const existing = [...state.payments.values()].find((p) => p.orderId === input.orderId);
      if (existing !== undefined) return existing;

      const fee = feeFor(input.amountMinor, script.feeBp ?? 300);
      const payment: RemotePayment = Object.freeze({
        id: nextId('pay'),
        status: 'succeeded',
        amountMinor: input.amountMinor,
        feeMinor: fee,
        currency: 'RUB',
        orderId: input.orderId,
        paid: true,
        confirmationUrl: `https://fake-provider.invalid/checkout/${input.orderId}`,
        paidAt: new Date().toISOString().replace(/\.\d+Z$/, '.000Z'),
      });
      state.payments.set(payment.id, payment);
      return payment;
    },

    async getPayment(id: string): Promise<RemotePayment> {
      assertAvailable();
      const payment = state.payments.get(id);
      if (payment === undefined) throw new PaymentVerificationError('платёж не найден у провайдера');
      if (script.remoteAmountOverrideMinor !== undefined) {
        return Object.freeze({ ...payment, amountMinor: script.remoteAmountOverrideMinor });
      }
      return payment;
    },

    refund(paymentId: string, amountMinor?: number): RemoteRefund {
      const payment = state.payments.get(paymentId);
      if (payment === undefined) throw new PaymentVerificationError('платёж не найден у провайдера');
      const refund: RemoteRefund = Object.freeze({
        id: nextId('ref'),
        amountMinor: amountMinor ?? payment.amountMinor,
        paymentId,
        refundedAt: new Date().toISOString().replace(/\.\d+Z$/, '.000Z'),
      });
      state.refunds.set(refund.id, refund);
      return refund;
    },

    notificationFor(paymentId: string, kind): Uint8Array {
      if (kind === 'payment_succeeded') {
        return Buffer.from(JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: paymentId } }), 'utf8');
      }
      const refund = [...state.refunds.values()].find((r) => r.paymentId === paymentId);
      if (refund === undefined) throw new PaymentVerificationError('возврат не создан');
      return Buffer.from(JSON.stringify({ type: 'notification', event: 'refund.succeeded', object: { id: refund.id } }), 'utf8');
    },

    async verifyNotification(context: NotificationContext): Promise<VerifiedNotification> {
      assertAvailable();
      if (context.rawBody.byteLength === 0) throw new PaymentVerificationError('тело уведомления пусто');
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(context.rawBody).toString('utf8'));
      } catch {
        throw new PaymentVerificationError('тело уведомления не разбирается как JSON');
      }
      if (parsed === null || typeof parsed !== 'object') throw new PaymentVerificationError('тело уведомления не объект');
      const body = parsed as { event?: unknown; object?: { id?: unknown } };
      const objectId = typeof body.object?.id === 'string' ? body.object.id : '';
      if (objectId === '') throw new PaymentVerificationError('notification.object.id недействителен');

      if (body.event === 'payment.succeeded') {
        // ПЕРЕЗАПРОС — тот же шаг, что у настоящего провайдера: факты берутся у него.
        const payment = await provider.getPayment(objectId);
        return { kind: 'payment_succeeded', payment };
      }
      if (body.event === 'refund.succeeded') {
        const refund = state.refunds.get(objectId);
        if (refund === undefined) throw new PaymentVerificationError('возврат не найден у провайдера');
        const payment = await provider.getPayment(refund.paymentId);
        return { kind: 'refund_succeeded', payment, refund };
      }
      return { kind: 'ignored', event: typeof body.event === 'string' ? body.event : 'unknown' };
    },
  };

  return provider;
}
