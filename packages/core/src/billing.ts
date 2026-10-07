import { PLANS, Plan } from '@grelka/shared';
import { yookassaCreatePayment, handleYooWebhook, YooWebhookBody } from './billing_yookassa.ts';
import { stripeCreateCheckout, verifyStripeSignature, StripeEvent } from './billing_stripe.ts';
import { safeEqual } from '@grelka/secrets';

export interface BillingRecord {
  userRef: string
  plan: Plan;
  currency: 'RUB' | 'USD';
  checkoutId: string;
  idempotencyKey: string;
  createdAt: number;
}

export interface Subscription {
  userRef: string;
  plan: Plan;
  status: 'active' | 'past_due' | 'canceled';
  currentUntil: number | null;
}

export interface BillingStore {
  checkouts: BillingRecord[];
  subscriptions: Map<string, Subscription>;
  processedWebhooks: Set<string>;
  audit: string[];
  commission: { paymentExternalId: string; userRef: string; payerEmail: string }[];
}

export interface CheckoutOutcome {
  ok: boolean;
  url?: string;
  reason?: string;
  code?: number;
}

export async function createCheckout(
  store: BillingStore,
  input: { userRef: string; payerEmail: string; plan: Plan; currency: 'RUB' | 'USD'; returnUrl: string },
  creds: { yookassa?: { shopId: string; apiKey: string }; stripe?: { secretKey: string } },
  nowMs: number,
  idemKey = `chk-${nowMs}-${store.checkouts.length}`,
): Promise<CheckoutOutcome> {
  const existing = store.checkouts.find((c) => c.userRef === input.userRef && c.plan === input.plan && c.currency === input.currency);
  if (existing) return { ok: true, url: undefined, reason: 'already_exists', code: 409 };
  const prices: Record<Plan, [number, number]> = { free: [0, 0], base: [1490, 19], pro: [4900, 59] };
  if (input.plan === 'free') return { ok: false, reason: 'free_plan_no_checkout', code: 400 };
  const [rub, usd] = prices[input.plan]!;
  if (input.currency === 'RUB') {
    if (!creds.yookassa) return { ok: false, reason: 'no_creds', code: 400 };
    const res = await yookassaCreatePayment(
      {
        amountRub: rub,
        description: `Grelka ${input.plan} (месяц) — ${input.payerEmail}`,
        metadata: { user_ref: input.userRef, plan: input.plan },
        idempotencyKey: idemKey,
        returnUrl: input.returnUrl,
      },
      creds.yookassa,
    );
    if (!res.ok) return { ok: false, reason: res.reason, code: 502 };
    store.checkouts.push({ userRef: input.userRef, plan: input.plan, currency: 'RUB', checkoutId: res.id, idempotencyKey: idemKey, createdAt: nowMs });
    store.audit.push(`checkout_created notion=yookassa user=${input.userRef} id=${res.id}`);
    return { ok: true, url: res.confirmationUrl };
  }
  if (!creds.stripe) return { ok: false, reason: 'no_creds', code: 400 };
  const res = await stripeCreateCheckout(
    {
      amountUsd: usd,
      plan: input.plan,
      userExternalRef: `${input.userRef}:${input.payerEmail}`,
      successUrl: input.returnUrl,
      cancelUrl: input.returnUrl,
      mode: 'payment',
    },
    creds.stripe,
  );
  if (!res.ok) return { ok: false, reason: res.reason, code: 502 };
  store.checkouts.push({ userRef: input.userRef, plan: input.plan, currency: 'USD', checkoutId: res.sessionId, idempotencyKey: idemKey, createdAt: nowMs });
  store.audit.push(`checkout_created notion=stripe user=${input.userRef} id=${res.sessionId}`);
  return { ok: true, url: res.url };
}

export async function handleStripeWebhook(
  store: BillingStore,
  rawBody: string,
  signatureHeader: string,
  secret: string,
  onPaid: (meta: Record<string, string>) => Promise<void>,
  onFail: (meta: Record<string, string>) => Promise<void>,
): Promise<{ ok: boolean; code: number; reason?: string }> {
  if (!verifyStripeSignature(rawBody, signatureHeader, secret)) return { ok: false, code: 400, reason: 'подпись вебхука не совпала' };
  let ev: StripeEvent;
  try {
    ev = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return { ok: false, code: 400, reason: 'malformed_body' };
  }
  if (typeof ev.id !== 'string' || ev.id.length < 4) return { ok: false, code: 400, reason: 'нет event.id' };
  if (store.processedWebhooks.has(ev.id)) return { ok: true, code: 200 };
  const meta = ev.data?.object?.metadata ?? {};
  const userRef = String(meta.user_ref ?? '');
  const planRaw = String(meta.plan ?? '');

  switch (ev.type) {
    case 'checkout.session.completed':
    case 'invoice.paid': {
      if (!userRef || !(PLANS as readonly string[]).includes(planRaw)) return { ok: false, code: 400, reason: 'нет metadata user_ref/plan' };
      store.processedWebhooks.add(ev.id);
      store.subscriptions.set(userRef, { userRef, plan: planRaw as Plan, status: 'active', currentUntil: nowMsPlus(30) });
      store.audit.push(`subscription_active user=${userRef} plan=${planRaw}`);
      await onPaid(meta);
      return { ok: true, code: 200 };
    }
    case 'invoice.payment_failed': {
      if (!userRef) return { ok: false, code: 400, reason: 'нет metadata user_ref' };
      store.processedWebhooks.add(ev.id);
      const sub = store.subscriptions.get(userRef);
      if (sub) sub.status = 'past_due';
      await onFail(meta);
      return { ok: true, code: 200 };
    }
    default:
      return { ok: true, code: 200 };
  }
}

function nowMsPlus(days: number): number {
  return Date.now() + days * 86400_000;
}

export async function handleYooWebhookOrchestrated(
  store: BillingStore,
  body: YooWebhookBody,
  sourceIp: string,
  creds: { shopId: string; apiKey: string },
  fetchImpl?: typeof fetch,
): Promise<{ ok: boolean; code: number; reason?: string }> {
  return handleYooWebhook(body, sourceIp, creds, {
    onPaid: async (meta) => {
      const userRef = String(meta.user_ref ?? '');
      const planRaw = String(meta.plan ?? '');
      if (!userRef || !(PLANS as readonly string[]).includes(planRaw)) return;
      store.processedWebhooks.add(methodId(body));
      store.subscriptions.set(userRef, { userRef, plan: planRaw as Plan, status: 'active', currentUntil: nowMsPlus(30) });
      store.audit.push(`subscription_active user=${userRef} plan=${planRaw} provider=yookassa`);
      store.commission.push({ paymentExternalId: methodId(body), userRef, payerEmail: userRef });
    },
    fetchImpl,
  });
}

function methodId(body: YooWebhookBody): string {
  return String(body.object?.id ?? 'unknown');
}

export function dedupGuard(store: BillingStore, eventId: string): boolean {
  if (store.processedWebhooks.has(eventId)) return false;
  store.processedWebhooks.add(eventId);
  return true;
}

void safeEqual;
