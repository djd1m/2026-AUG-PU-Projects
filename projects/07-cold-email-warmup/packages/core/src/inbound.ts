export interface InboundHeaders {
  from?: string;
  listUnsubscribePost?: string;
  autoSubmitted?: string;
  subject?: string;
  feedbackType?: string;
  abuseReportsTo?: string;
  customMessageId?: string;
}

export type InboundKind = 'reply' | 'unsub' | 'complaint' | 'bounce';

export interface Classified {
  kind: InboundKind;
  senderAddress: string | null;
  occurredAt: number;
}

export function classifyInbound(h: InboundHeaders, nowMs: number): Classified {
  const from = (h.from ?? '').trim().toLowerCase();
  const address = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(from) ? from : null;
  if ((h.listUnsubscribePost ?? '').trim().toLowerCase() === 'list-unsubscribe=one-click') {
    return { kind: 'unsub', senderAddress: address, occurredAt: nowMs };
  }
  const feedback = (h.feedbackType ?? '').trim().toLowerCase();
  if (feedback) return { kind: 'complaint', senderAddress: address, occurredAt: nowMs };
  if ((h.autoSubmitted ?? '').toLowerCase().startsWith('auto-replied')) {
    return { kind: 'bounce', senderAddress: address, occurredAt: nowMs };
  }
  return { kind: 'reply', senderAddress: address, occurredAt: nowMs };
}

export interface InboundEffectRecord {
  address: string | null;
  kind: InboundKind;
  stoplistQueued: boolean;
  recipientFrozen: boolean;
}

export interface InboundStores {
  stoplistEnqueue(address: string, kind: InboundKind, dueAtMs: number): Promise<void>;
  freezeRecipient(address: string): Promise<void>;
  isCampaignRecipient(address: string): Promise<boolean>;
}

export async function applyInboundEffect(
  cls: Classified,
  stores: InboundStores,
  slaDueMs: number,
): Promise<InboundEffectRecord> {
  if (!cls.senderAddress) return { address: null, kind: cls.kind, stoplistQueued: false, recipientFrozen: false };
  switch (cls.kind) {
    case 'unsub': {
      await stores.stoplistEnqueue(cls.senderAddress, 'unsub', slaDueMs);
      if (await stores.isCampaignRecipient(cls.senderAddress)) await stores.freezeRecipient(cls.senderAddress);
      return { address: cls.senderAddress, kind: cls.kind, stoplistQueued: true, recipientFrozen: true };
    }
    case 'complaint': {
      await stores.stoplistEnqueue(cls.senderAddress, 'complaint', slaDueMs);
      if (await stores.isCampaignRecipient(cls.senderAddress)) await stores.freezeRecipient(cls.senderAddress);
      return { address: cls.senderAddress, kind: cls.kind, stoplistQueued: true, recipientFrozen: true };
    }
    case 'reply': {
      return { address: cls.senderAddress, kind: cls.kind, stoplistQueued: false, recipientFrozen: true };
    }
    case 'bounce': {
      return { address: cls.senderAddress, kind: cls.kind, stoplistQueued: false, recipientFrozen: false };
    }
  }
}

export function complaintRate(complained: number, delivered: number): number {
  if (delivered <= 0) return 0;
  return complained / delivered;
}

export function shouldAutoPause(rate: number, limit = 0.003): boolean {
  return rate > limit;
}
