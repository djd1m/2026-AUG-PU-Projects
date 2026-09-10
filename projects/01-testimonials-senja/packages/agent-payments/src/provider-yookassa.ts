import type { ProviderPort, ProviderRequest, ProviderResult } from './contracts.js';
import { money, requireValue, text } from './internal.js';
export type YooKassaTestOptions = {
  shopId: string;
  secretKey: string;
  fetch?: typeof fetch;
  metadataFor?: (request: ProviderRequest) => Promise<Record<string, string>>;
};
function decimal(minor: string) {
  const n = BigInt(minor);
  return `${n / 100n}.${(n % 100n).toString().padStart(2, '0')}`;
}
function minor(value: unknown): string {
  requireValue(typeof value === 'string' && /^\d+\.\d{2}$/.test(value), 'invalid_provider_amount');
  const [major, cents] = value.split('.');
  return (BigInt(major) * 100n + BigInt(cents)).toString();
}
function hostedUrl(value: unknown): string {
  requireValue(typeof value === 'string', 'invalid_confirmation_url');
  const url = new URL(value);
  requireValue(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.hostname === 'yoomoney.ru' ||
        url.hostname.endsWith('.yoomoney.ru') ||
        url.hostname === 'yookassa.ru' ||
        url.hostname.endsWith('.yookassa.ru')),
    'invalid_confirmation_url',
  );
  return url.href;
}
export class YooKassaTestProvider implements ProviderPort {
  readonly provider = 'yookassa';
  readonly test = true as const;
  readonly supportsSavedMethods = true;
  readonly accountId: string;
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: YooKassaTestOptions) {
    text(options.shopId);
    text(options.secretKey);
    // YooKassa test keys use test_. Reject a live key before any network request.
    requireValue(options.secretKey.startsWith('test_'), 'test_credentials_required', 400);
    this.accountId = options.shopId;
    this.fetcher = options.fetch ?? fetch;
  }
  private async request(path: string, init: RequestInit = {}) {
    const response = await this.fetcher(`https://api.yookassa.ru/v3/${path}`, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.options.shopId}:${this.options.secretKey}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    requireValue(response.ok, 'provider_unavailable', 502);
    return (await response.json()) as Record<string, any>;
  }
  private metadata(request: ProviderRequest) {
    return {
      module_order_id: request.orderId,
      module_attempt_id: request.attemptId,
      module_merchant_id: request.scope.merchantId,
      module_buyer_id: request.scope.buyerId,
      module_resource_id: request.scope.resourceId,
    };
  }
  private verify(raw: Record<string, any>, request: ProviderRequest): ProviderResult {
    requireValue(
      raw.test === true && raw.recipient?.account_id === this.accountId,
      'provider_account_or_mode_mismatch',
    );
    text(raw.id);
    requireValue(
      ['pending', 'waiting_for_capture', 'succeeded', 'canceled'].includes(raw.status),
      'provider_status_invalid',
    );
    const amount = { minor: minor(raw.amount?.value), currency: raw.amount?.currency };
    money(amount);
    requireValue(
      amount.currency === request.amount.currency && amount.minor === request.amount.minor,
      'provider_amount_mismatch',
    );
    for (const [key, value] of Object.entries(this.metadata(request)))
      requireValue(raw.metadata?.[key] === value, 'provider_metadata_mismatch');
    requireValue(raw.status !== 'succeeded' || raw.paid === true, 'provider_paid_mismatch');
    const result: ProviderResult = {
      providerId: raw.id,
      accountId: this.accountId,
      test: true,
      orderId: request.orderId,
      attemptId: request.attemptId,
      amount,
      status: raw.status === 'waiting_for_capture' ? 'pending' : raw.status,
    };
    if (raw.confirmation?.confirmation_url)
      result.confirmationUrl = hostedUrl(raw.confirmation.confirmation_url);
    if (raw.payment_method?.saved === true) {
      text(raw.payment_method.id);
      result.savedMethod = { reference: raw.payment_method.id, saved: true };
    }
    return result;
  }
  async create(request: ProviderRequest): Promise<ProviderResult> {
    money(request.amount);
    requireValue(request.amount.currency === 'RUB', 'unsupported_currency');
    const returnUrl = new URL(request.returnUrl);
    requireValue(returnUrl.protocol === 'https:', 'invalid_return_url');
    const extra = (await this.options.metadataFor?.(request)) ?? {};
    for (const [key, value] of Object.entries(extra)) {
      text(key);
      text(value);
      requireValue(!key.startsWith('module_'), 'reserved_metadata');
    }
    const body: Record<string, unknown> = {
      amount: { value: decimal(request.amount.minor), currency: request.amount.currency },
      capture: true,
      description: request.description,
      metadata: { ...extra, ...this.metadata(request) },
    };
    if (request.methodReference) body.payment_method_id = request.methodReference;
    else {
      body.confirmation = { type: 'redirect', return_url: request.returnUrl };
      if (request.saveMethod) body.save_payment_method = true;
    }
    const raw = await this.request('payments', {
      method: 'POST',
      headers: { 'Idempotence-Key': request.idempotencyKey },
      body: JSON.stringify(body),
    });
    return this.verify(raw, request);
  }
  async query(request: ProviderRequest, providerId?: string): Promise<ProviderResult | null> {
    if (!providerId) return null;
    text(providerId);
    const raw = await this.request(`payments/${encodeURIComponent(providerId)}`);
    requireValue(raw.id === providerId, 'provider_id_mismatch');
    return this.verify(raw, request);
  }
  async queryRefund(refundId: string) {
    text(refundId);
    const refund = await this.request(`refunds/${encodeURIComponent(refundId)}`);
    requireValue(
      refund.id === refundId && ['succeeded', 'pending', 'canceled'].includes(refund.status),
      'refund_mismatch',
    );
    text(refund.payment_id);
    const payment = await this.request(`payments/${encodeURIComponent(refund.payment_id)}`);
    requireValue(
      payment.id === refund.payment_id &&
        payment.test === true &&
        payment.recipient?.account_id === this.accountId,
      'provider_account_or_mode_mismatch',
    );
    const amount = { minor: minor(refund.amount?.value), currency: refund.amount?.currency };
    money(amount);
    requireValue(amount.currency === 'RUB', 'unsupported_currency');
    return {
      refundId,
      providerId: refund.payment_id,
      accountId: this.accountId,
      test: true as const,
      amount,
      status: refund.status as 'succeeded' | 'pending' | 'canceled',
    };
  }
}
