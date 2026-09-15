// Граница с платёжным провайдером (`03_architecture.md`). Тот же приём, что у `ModelProvider`:
// домен не знает ни ЮKassa, ни CloudPayments, а адаптер переводит чужое в наши типы.
//
// Деньги — целое число копеек ВЕЗДЕ. `net` приходит ИЗ СОБЫТИЯ провайдера и нами не
// вычисляется: вычислить значило бы угадать удержание (ADR-011).

/** Недоступность провайдера — ИСКЛЮЧЕНИЕ, а не возвращаемое значение.
 *
 * Заслужено дефектом N1 (потерянный платёж, коммит `0501766`): штатный возврат из колбэка
 * транзакции КОММИТИТ её вместе с уже занятой заявкой на идентификатор события. Мы отдаём 500,
 * провайдер повторяет уведомление, повтор упирается в занятый ключ и коротит в «дубль».
 * Оплата не применяется НИКОГДА. Брошенное исключение откатывает транзакцию и освобождает
 * заявку — только тогда повтор действительно повторяет. */
export class PaymentProviderUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`платёжный провайдер недоступен: ${reason}`);
    this.name = 'PaymentProviderUnavailable';
  }
}

/** Уведомление не прошло проверку подлинности. Не ретраибельно: повтор не сделает его настоящим. */
export class PaymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentVerificationError';
  }
}

export type RemotePaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';

export interface RemotePayment {
  readonly id: string;
  readonly status: RemotePaymentStatus;
  readonly amountMinor: number;
  /** Удержание провайдера. `null` — провайдер его в этом ответе не назвал. */
  readonly feeMinor: number | null;
  readonly currency: 'RUB';
  readonly orderId: string | null;
  readonly paid: boolean;
  readonly confirmationUrl: string | null;
  /** Момент ПРОВАЙДЕРА, не момент доставки уведомления. */
  readonly paidAt: string | null;
}

export interface RemoteRefund {
  readonly id: string;
  readonly amountMinor: number;
  readonly paymentId: string;
  readonly refundedAt: string;
}

export type VerifiedNotification =
  | { readonly kind: 'payment_succeeded'; readonly payment: RemotePayment }
  | { readonly kind: 'refund_succeeded'; readonly payment: RemotePayment; readonly refund: RemoteRefund }
  /** Событие распознано, но нас не касается: отвечаем 200 и НИЧЕГО не меняем. */
  | { readonly kind: 'ignored'; readonly event: string };

export interface CreatePaymentInput {
  /** Наш идентификатор намерения. Он же идемпотентный ключ у провайдера. */
  readonly orderId: string;
  readonly amountMinor: number;
  readonly returnUrl: string;
  readonly description: string;
}

export interface NotificationContext {
  /** Сырые байты тела. Разбор идёт ИЗ НИХ, а не из уже разобранного объекта. */
  readonly rawBody: Uint8Array;
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Адрес непосредственного клиента, как его увидел наш прокси. */
  readonly sourceIp: string;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<RemotePayment>;
  getPayment(id: string): Promise<RemotePayment>;
  /** Полная проверка подлинности. Бросает `PaymentVerificationError` или
   * `PaymentProviderUnavailable`; НИКОГДА не возвращает «наверное, настоящее». */
  verifyNotification(context: NotificationContext): Promise<VerifiedNotification>;
}
