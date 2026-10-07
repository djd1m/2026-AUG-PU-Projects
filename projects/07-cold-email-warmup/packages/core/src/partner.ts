import { ATTRIBUTION_DAYS } from '@grelka/shared';
import { uuid } from '@grelka/secrets';

export interface AttributionRecord {
  id: string;
  newUserEmail: string;
  partnerCode: string;
  capturedVia: 'cookie' | 'manual';
  capturedAt: number;
}

export interface AttributionStore {
  entries: AttributionRecord[];
  audit: string[];
}

export type CaptureOutcome =
  | { saved: true; record: AttributionRecord }
  | { saved: false; reason: 'invalid_manual_code' | 'self_referral' | 'already_attributed' | 'no_code' };

export function captureAttribution(
  store: AttributionStore,
  input: {
    newUserEmail: string;
    manualCode?: string | null;
    cookieCode?: string | null;
    existingCodes: Set<string>;
    selfOwnedCodes?: Set<string>;
  },
  nowMs: number,
): CaptureOutcome {
  if (store.entries.some((e) => e.newUserEmail === input.newUserEmail)) {
    return { saved: false, reason: 'already_attributed' };
  }
  const selfOwned = input.selfOwnedCodes ?? new Set<string>();

  if (input.manualCode != null && input.manualCode.length > 0) {
    if (!input.existingCodes.has(input.manualCode)) {
      store.audit.push(`invalid_manual_code=${input.manualCode} user=${input.newUserEmail} t=${nowMs}`);
      return { saved: false, reason: 'invalid_manual_code' };
    }
    if (selfOwned.has(input.manualCode)) {
      store.audit.push(`self_referral_code=${input.manualCode} user=${input.newUserEmail} t=${nowMs}`);
      return { saved: false, reason: 'self_referral' };
    }
    const rec: AttributionRecord = {
      id: uuid(),
      newUserEmail: input.newUserEmail,
      partnerCode: input.manualCode,
      capturedVia: 'manual',
      capturedAt: nowMs,
    };
    store.entries.push(rec);
    return { saved: true, record: rec };
  }

  if (input.cookieCode && input.cookieCode.length > 0) {
    if (!input.existingCodes.has(input.cookieCode)) {
      store.audit.push(`stale_cookie_ignored=${input.cookieCode} user=${input.newUserEmail} t=${nowMs}`);
      return { saved: false, reason: 'no_code' };
    }
    if (selfOwned.has(input.cookieCode)) {
      store.audit.push(`self_referral_cookie=${input.cookieCode} user=${input.newUserEmail} t=${nowMs}`);
      return { saved: false, reason: 'self_referral' };
    }
    const rec: AttributionRecord = {
      id: uuid(),
      newUserEmail: input.newUserEmail,
      partnerCode: input.cookieCode,
      capturedVia: 'cookie',
      capturedAt: nowMs,
    };
    store.entries.push(rec);
    return { saved: true, record: rec };
  }

  return { saved: false, reason: 'no_code' };
}

export function attributionActiveFor(rec: AttributionRecord, nowMs: number): boolean {
  return nowMs - rec.capturedAt <= ATTRIBUTION_DAYS * 86400_000;
}

export interface CommissionEvent {
  id: string;
  paymentExternalId: string;
  partnerCode: string;
  amount: number;
  currency: 'RUB' | 'USD';
  pct: number;
  createdAt: number;
}

export class CommissionLedger {
  readonly events: CommissionEvent[] = [];

  onPaidPayment(
    store: AttributionStore,
    payment: { externalId: string; amount: number; currency: 'RUB' | 'USD'; payerEmail: string; pct: number },
    nowMs: number,
  ): CommissionEvent | null {
    if (this.events.some((e) => e.paymentExternalId === payment.externalId)) return null;
    const rec = store.entries.find(
      (e) => e.newUserEmail === payment.payerEmail && attributionActiveFor(e, nowMs),
    );
    if (!rec) return null;
    const ev: CommissionEvent = {
      id: uuid(),
      paymentExternalId: payment.externalId,
      partnerCode: rec.partnerCode,
      amount: payment.amount,
      currency: payment.currency,
      pct: payment.pct,
      createdAt: nowMs,
    };
    this.events.push(ev);
    return ev;
  }
}
