const YOOKASSA_NOTIFICATION_NETWORKS = [
  '185.71.76.0/27',
  '185.71.77.0/27',
  '77.75.153.0/25',
  '77.75.156.11/32',
  '77.75.156.35/32',
  '77.75.154.128/25',
];

function ipToInt(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) throw new Error(`некорректный IPv4: ${ip}`);
  return parts.reduce((acc, p) => (acc << 8) + (Number(p) & 255), 0) >>> 0;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.split('/');
  if (!network || bitsRaw === undefined) throw new Error(`некорректная CIDR: ${cidr}`);
  const bits = Number(bitsRaw);
  if (bits < 0 || bits > 32) throw new Error(`некорректная маска: ${cidr}`);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

export function yookassaNotificationSource(ip: string, networks: string[] = YOOKASSA_NOTIFICATION_NETWORKS): boolean {
  return networks.some((n) => {
    try {
      return ipInCidr(ip, n);
    } catch {
      return false;
    }
  });
}

export type YooStatus =
  | { ok: true; id: string; paid: boolean; status: string; metadata: Record<string, string> | null }
  | { ok: false; reason: string };

export async function yookassaFetchPayment(
  paymentId: string,
  shopId: string,
  apiKey: string,
  apiBase = 'https://api.yookassa.ru/v3',
  fetchImpl: typeof fetch = fetch,
): Promise<YooStatus> {
  const url = `${apiBase}/payments/${paymentId}`;
  const auth = Buffer.from(`${shopId}:${apiKey}`).toString('base64');
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return { ok: false, reason: `status_${res.status}` };
    const j = (await res.json()) as { id?: string; paid?: boolean; status?: string; metadata?: Record<string, string> };
    if (typeof j.id !== 'string' || typeof j.status !== 'string') return { ok: false, reason: 'malformed_body' };
    return { ok: true, id: j.id, paid: j.paid === true, status: j.status, metadata: j.metadata ?? null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export interface YooWebhookBody {
  event?: string;
  object?: { id?: string; paid?: boolean; status?: string; metadata?: Record<string, string> };
}

export async function handleYooWebhook(
  body: YooWebhookBody,
  sourceIp: string,
  creds: { shopId: string; apiKey: string },
  deps: { onPaid: (meta: Record<string, string>) => Promise<void>; fetchImpl?: typeof fetch },
): Promise<{ ok: boolean; code: number; reason?: string }> {
  if (!yookassaNotificationSource(sourceIp)) return { ok: false, code: 403, reason: 'source ip вне сетей уведомлений' };
  const id = body.object?.id;
  if (typeof id !== 'string' || id.length < 8) return { ok: false, code: 400, reason: 'нет object.id' };
  const confirmed = await yookassaFetchPayment(id, creds.shopId, creds.apiKey, undefined, deps.fetchImpl);
  if (!confirmed.ok) return { ok: false, code: 502, reason: `re-poll failed: ${confirmed.reason}` };
  if (!confirmed.paid) return { ok: true, code: 200 };
  const meta = confirmed.metadata ?? {};
  await deps.onPaid(meta);
  return { ok: true, code: 200 };
}

export interface YooCreateInput {
  amountRub: number;
  description: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
  returnUrl: string;
}

export async function yookassaCreatePayment(
  input: YooCreateInput,
  creds: { shopId: string; apiKey: string },
  apiBase = 'https://api.yookassa.ru/v3',
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; confirmationUrl: string; id: string } | { ok: false; reason: string }> {
  const auth = Buffer.from(`${creds.shopId}:${creds.apiKey}`).toString('base64');
  try {
    const res = await fetchImpl(`${apiBase}/payments`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Idempotence-Key': input.idempotencyKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: { value: input.amountRub.toFixed(2), currency: 'RUB' },
        capture: true,
        description: input.description,
        metadata: input.metadata,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
      }),
    });
    if (!res.ok) return { ok: false, reason: `status_${res.status}` };
    const j = (await res.json()) as { id?: string; confirmation?: { confirmation_url?: string } };
    const u = j.confirmation?.confirmation_url;
    if (!j.id || !u) return { ok: false, reason: 'malformed_body' };
    return { ok: true, confirmationUrl: u, id: j.id };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
