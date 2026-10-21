import { z } from 'zod';
import { DomainError, uuid } from '../common';
export interface PaymentSku { sku: string; priceMinor: number; currency: 'RUB'; credits: number; unwatermarkedExport: boolean }
export interface PaymentConfig { shopId: string; testMode: boolean; skus: PaymentSku[]; publicOrigin: string }
export interface Payment { id: string; status: 'pending'|'waiting_for_capture'|'succeeded'|'canceled'; amountMinor: number; currency: 'RUB'; merchantId: string; test: boolean; paid: boolean; orderId: string; confirmationUrl: string|null }
export interface Refund { id: string; paymentId: string; status: 'succeeded'; amountMinor: number; currency: 'RUB' }
export interface PaymentProvider {
  createPayment(input: { orderId: string; amountMinor: number; returnUrl: string }): Promise<Payment>;
  getPayment(id: string): Promise<Payment>;
  getRefund(id: string): Promise<Refund>;
}
export type OrderState = 'created'|'pending'|'succeeded'|'canceled'|'refund_hold';
export interface Order extends PaymentSku { id: string; accountId: string; remoteId: string|null; state: OrderState; confirmationUrl: string|null; createdAt: string; paidAt: string|null }
export type OrderDto = Omit<Order, 'accountId'|'remoteId'>;
export function orderDto(order: Order): OrderDto { const { accountId: _accountId, remoteId: _remoteId, ...dto } = order; return dto; }
export interface VerifiedEvent { kind: 'succeeded'|'refund_hold'; payment: Payment; refund?: Refund }
export interface BillingStore {
  prepare(accountId: string, key: string, offer: PaymentSku, config: PaymentConfig): Promise<Order>;
  bind(accountId: string, orderId: string, payment: Payment, config: PaymentConfig): Promise<Order>;
  apply(event: VerifiedEvent, config: PaymentConfig): Promise<{ outcome: 'applied'|'duplicate'|'ignored' }>;
  get(accountId: string, orderId: string): Promise<Order>;
  list(accountId: string, cursor?: string): Promise<{ items: Order[]; nextCursor: string|null }>;
}
export function invalidProof(): never { throw new DomainError(400, 'PAYMENT_PROOF_INVALID', 'Платёж не подтверждён'); }
export function verifyPayment(payment: Payment, order: Order, config: PaymentConfig, succeeded = false): void {
  if (payment.merchantId !== config.shopId || payment.test !== config.testMode || payment.currency !== 'RUB'
    || payment.amountMinor !== order.priceMinor || payment.orderId !== order.id || !providerId.safeParse(payment.id).success
    || (order.remoteId !== null && order.remoteId !== payment.id) || (succeeded && (payment.status !== 'succeeded' || payment.paid !== true))) invalidProof();
}
export const providerId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const checkoutInput = z.object({ sku: z.string().regex(/^[A-Za-z0-9_-]{1,60}$/) }).strict();
const notification = z.object({ type: z.literal('notification'), event: z.enum(['payment.succeeded','refund.succeeded']), object: z.object({ id: providerId }) });
export function parseNotification(value: unknown): z.infer<typeof notification> {
  const result = notification.safeParse(value); if (!result.success) invalidProof(); return result.data;
}
export class BillingService {
  constructor(private readonly store: BillingStore, private readonly provider: PaymentProvider, private readonly config: PaymentConfig) {}
  async checkout(accountId: string, key: string, input: unknown): Promise<OrderDto> {
    if (!uuid.safeParse(key).success) throw new DomainError(400, 'IDEMPOTENCY_REQUIRED', 'Нужен UUID ключ повторного запроса');
    const parsed = checkoutInput.safeParse(input); if (!parsed.success) throw new DomainError(422, 'INVALID_INPUT', 'Некорректный пакет');
    const offer = this.config.skus.find(x => x.sku === parsed.data.sku); if (!offer) throw new DomainError(422, 'UNKNOWN_SKU', 'Пакет недоступен');
    const order = await this.store.prepare(accountId, key, offer, this.config);
    if (order.state === 'succeeded' || order.state === 'canceled' || order.state === 'refund_hold' || (order.remoteId && order.confirmationUrl)) return orderDto(order);
    // Provider dedupe lasts 24h. A stale unknown outcome must never become a second charge.
    if (!order.remoteId && Date.now() - Date.parse(order.createdAt) >= 23 * 60 * 60 * 1000) throw new DomainError(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Нужна сверка платежа');
    const payment = order.remoteId ? await this.provider.getPayment(order.remoteId) : await this.provider.createPayment({
      orderId: order.id, amountMinor: order.priceMinor, returnUrl: `${this.config.publicOrigin}/billing?order=${order.id}` });
    verifyPayment(payment, order, this.config);
    return orderDto(await this.store.bind(accountId, order.id, payment, this.config));
  }
  async notification(value: unknown): Promise<{ outcome: 'applied'|'duplicate'|'ignored' }> {
    const signal = parseNotification(value);
    if (signal.event === 'payment.succeeded') {
      const payment = await this.provider.getPayment(signal.object.id);
      if (payment.id !== signal.object.id) invalidProof();
      return this.store.apply({ kind: 'succeeded', payment }, this.config);
    }
    const refund = await this.provider.getRefund(signal.object.id);
    if (refund.id !== signal.object.id || refund.status !== 'succeeded' || refund.currency !== 'RUB' || !Number.isSafeInteger(refund.amountMinor) || refund.amountMinor <= 0) invalidProof();
    const payment = await this.provider.getPayment(refund.paymentId);
    if (payment.id !== refund.paymentId || refund.amountMinor > payment.amountMinor) invalidProof();
    return this.store.apply({ kind: 'refund_hold', payment, refund }, this.config);
  }
}
