export interface SendAttempt {
  idempotencyKey: string;
  mailboxId: string;
  to: string;
  bodyHtml: string;
  bodyText: string;
  subject: string;
  isWarmup: boolean;
}

export interface SendResult {
  status: 'sent' | 'bounced' | 'failed';
  errorCode?: string;
}

export interface MailTransport {
  send(attempt: SendAttempt): Promise<SendResult>;
}

export interface LockStore {
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

export interface SendLogRow {
  idempotencyKey: string;
  campaignId: string | null;
  mailboxId: string;
  status: 'sent' | 'bounced' | 'failed';
  slotAt: string;
  errorCode: string | null;
}

export interface SendLogStore {
  hasKey(key: string): Promise<boolean>;
  insert(row: Omit<SendLogRow, 'id'>): Promise<void>;
}

export interface QuotaStore {
  remaining(mailboxId: string, isWarmup: boolean): Promise<number>;
  decrement(mailboxId: string, isWarmup: boolean): Promise<void>;
}

export function warmupBody(pairText: string, markerVersion = 'v1'): { subject: string; bodyHtml: string; bodyText: string } {
  const prefix = `[прогрев ${markerVersion}]`;
  return {
    subject: `${prefix} ${pairText.slice(0, 60)}`,
    bodyText: `${prefix}\n\n${pairText}\n\nЭто прогрев-письмо из общей сети сервиса: участники сети согласились на такую переписку.`,
    bodyHtml: `<p><small>${prefix}</small></p><p>${pairText}</p><p><small>Прогрев-письмо из общей сети. Сеть-участники согласились на переписку.</small></p>`,
  };
}

export const UNSUB_LINK_TEXT = 'Отписаться от всех писем';

export function unsubscribeHeaders(baseUrl: string, token: string): { 'List-Unsubscribe': string; 'List-Unsubscribe-Post': string } {
  const oneClick = `${baseUrl}/u/unsubscribe`;
  return {
    'List-Unsubscribe': `<${oneClick}?t=${token}>`,
    'List-Unsubscribe-Post': `List-Unsubscribe=One-Click`,
  };
}

export async function dispatchSend(
  attempt: SendAttempt,
  opts: {
    transport: MailTransport;
    logs: SendLogStore;
    locks: LockStore;
    quota: QuotaStore;
    campaignId: string | null;
    slotAt: string;
  },
): Promise<{ status: 'sent' | 'bounced' | 'failed' | 'suppressed'; errorCode?: string }> {
  if (await opts.logs.hasKey(attempt.idempotencyKey)) return { status: 'suppressed' };
  const got = await opts.locks.acquire(`lock:${attempt.idempotencyKey}`);
  if (!got) return { status: 'suppressed' };
  try {
    if (await opts.logs.hasKey(attempt.idempotencyKey)) return { status: 'suppressed' };
    const remaining = await opts.quota.remaining(attempt.mailboxId, attempt.isWarmup);
    if (remaining <= 0) return { status: 'failed', errorCode: 'QUOTA_EXHAUSTED' };
    const res = await opts.transport.send(attempt);
    await opts.logs.insert({
      idempotencyKey: attempt.idempotencyKey,
      campaignId: opts.campaignId,
      mailboxId: attempt.mailboxId,
      status: res.status,
      slotAt: opts.slotAt,
      errorCode: res.errorCode ?? null,
    });
    if (res.status === 'sent') await opts.quota.decrement(attempt.mailboxId, attempt.isWarmup);
    await opts.locks.release(`lock:${attempt.idempotencyKey}`);
    return res;
  } catch (e) {
    await opts.locks.release(`lock:${attempt.idempotencyKey}`);
    return { status: 'failed', errorCode: `RESET:${(e as Error).message.slice(0, 80)}` };
  }
}
