import { hmacSign, safeEqual } from '@grelka/secrets';

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id?: string; status?: string; customer?: string; metadata?: Record<string, string> } };
}

export function parseStripeHeader(header: string): { t: number; v1: string } | null {
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) return null;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === 't') t = Number(v);
    else if (k === 'v1') v1 = v;
  }
  if (t === null || v1 === null) return null;
  return { t, v1 };
}

export function verifyStripeSignature(
  rawBody: string,
  header: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): boolean {
  const parsed = parseStripeHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSec - parsed.t) > toleranceSec) return false;
  const signedPayload = `${parsed.t}.${rawBody}`;
  const expected = hmacSign(Buffer.from(secret), signedPayload).toString('hex');
  return safeEqual(expected, parsed.v1);
}

export type StripeCreateOutcome =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; reason: string };

export interface StripeCreateInput {
  amountUsd: number;
  plan: string;
  userExternalRef: string;
  successUrl: string;
  cancelUrl: string;
  mode?: 'subscription' | 'payment';
}

export async function stripeCreateCheckout(
  input: StripeCreateInput,
  creds: { secretKey: string },
  apiBase = 'https://api.stripe.com/v1',
  fetchImpl: typeof fetch = fetch,
): Promise<StripeCreateOutcome> {
  const form = new URLSearchParams({
    mode: input.mode ?? 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(input.amountUsd * 100)),
    'line_items[0][price_data][product_data][name]': `Grelka ${input.plan}`,
    'line_items[0][quantity]': '1',
    client_reference_id: input.userExternalRef,
    'metadata[user_ref]': input.userExternalRef,
    'metadata[plan]': input.plan,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  });
  try {
    const res = await fetchImpl(`${apiBase}/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.ok) return { ok: false, reason: `status_${res.status}` };
    const j = (await res.json()) as { id?: string; url?: string };
    if (!j.id || !j.url) return { ok: false, reason: 'malformed_body' };
    return { ok: true, url: j.url, sessionId: j.id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
