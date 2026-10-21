// N6/N4 YooKassa contracts adapted; feature-local provenance: docs/features/billing/reuse.md.
import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import { DomainError } from '@n8/domain/common';
import { invalidProof, providerId, type Payment, type Refund, type PaymentProvider } from '@n8/domain/billing';
const API = 'https://api.yookassa.ru/v3';
const BODY_LIMIT = 64 * 1024;
const networks = new BlockList();
for (const [ip, mask] of [['185.71.76.0',27],['185.71.77.0',27],['77.75.153.0',25],['77.75.154.128',25]] as const) networks.addSubnet(ip,mask,'ipv4');
networks.addAddress('77.75.156.11','ipv4'); networks.addAddress('77.75.156.35','ipv4'); networks.addSubnet('2a02:5180::',32,'ipv6');
export function isYooKassaPeer(peer: string): boolean {
  // Caller uses trusted ingress normalization; IPv4 mapped canonicalization is also safe here.
  if (peer.toLowerCase().startsWith('::ffff:') && isIP(peer.slice(7)) === 4) peer = peer.slice(7);
  const family = isIP(peer); return family !== 0 && networks.check(peer, family === 4 ? 'ipv4' : 'ipv6');
}
export function httpsUrl(value: string): string {
  try { const u = new URL(value); if (value.length > 2048 || u.protocol !== 'https:' || u.username || u.password) invalidProof(); return u.toString(); }
  catch { return invalidProof(); }
}
const amount = z.object({ value: z.string().regex(/^(0|[1-9][0-9]{0,12})\.[0-9]{2}$/), currency: z.literal('RUB') });
function minor(value: string): number { const [a,b] = value.split('.'); const n = Number(a) * 100 + Number(b); if (!Number.isSafeInteger(n) || n <= 0) invalidProof(); return n; }
const paymentSchema = z.object({ id: providerId, status: z.enum(['pending','waiting_for_capture','succeeded','canceled']), amount,
  recipient: z.object({ account_id: z.string() }), test: z.boolean(), paid: z.boolean(), metadata: z.object({ order_id: z.string().uuid() }),
  confirmation: z.object({ confirmation_url: z.string().optional() }).optional() });
const refundSchema = z.object({ id: providerId, payment_id: providerId, status: z.literal('succeeded'), amount });
export interface YooKassaOptions { shopId: string; secret: string; testMode: boolean; testTransport?: { fetch: typeof fetch; timeoutMs?: number } }
function unavailable(): never { throw new DomainError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Платёжный сервис временно недоступен'); }
export function createYooKassaProvider(options: YooKassaOptions): PaymentProvider {
  if (!/^[0-9]{1,64}$/.test(options.shopId) || !options.secret || options.secret.length > 512) throw new Error('PAYMENT_CONFIG_INVALID');
  if (options.testTransport && process.env.NODE_ENV !== 'test') throw new Error('PAYMENT_TEST_INJECTION_FORBIDDEN');
  const fetcher = options.testTransport?.fetch ?? globalThis.fetch;
  const deadline = options.testTransport?.timeoutMs ?? 5000;
  const authorization = `Basic ${Buffer.from(`${options.shopId}:${options.secret}`).toString('base64')}`;
  async function request(path: string, body?: unknown, key?: string): Promise<unknown> {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const timeout = new Promise<never>((_resolve,reject) => { timer = setTimeout(() => { controller.abort(); void reader?.cancel().catch(()=>{}); reject(new DomainError(503,'PAYMENT_PROVIDER_UNAVAILABLE','Платёжный сервис временно недоступен')); }, deadline); });
    try {
      const response = await Promise.race([fetcher(`${API}${path}`, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: controller.signal,
        headers: { authorization, accept: 'application/json', ...(body === undefined ? {} : {'content-type':'application/json'}), ...(key ? {'idempotence-key':key} : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) }), timeout]);
      if (!response.ok || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')) unavailable();
      const declared = response.headers.get('content-length'); if (declared !== null && (!/^[0-9]+$/.test(declared) || Number(declared) > BODY_LIMIT)) unavailable();
      reader = response.body?.getReader(); if (!reader) unavailable(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const {done,value} = await Promise.race([reader.read(),timeout]); if (done) break; size += value.byteLength; if (size > BODY_LIMIT) unavailable(); chunks.push(value); }
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    } catch { return unavailable(); }
    finally { if (timer) clearTimeout(timer); void reader?.cancel().catch(()=>{}); controller.abort(); }
  }
  function payment(raw: unknown, expectedId?: string): Payment {
    const result = paymentSchema.safeParse(raw); if (!result.success) invalidProof(); const p = result.data;
    if ((expectedId !== undefined && p.id !== expectedId) || p.recipient.account_id !== options.shopId || p.test !== options.testMode) invalidProof();
    return { id:p.id,status:p.status,amountMinor:minor(p.amount.value),currency:'RUB',merchantId:p.recipient.account_id,test:p.test,paid:p.paid,orderId:p.metadata.order_id,
      confirmationUrl:p.confirmation?.confirmation_url ? httpsUrl(p.confirmation.confirmation_url) : null };
  }
  return {
    async createPayment(input) {
      if (!z.string().uuid().safeParse(input.orderId).success || !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) invalidProof();
      const result = payment(await request('/payments',{ amount:{value:`${Math.floor(input.amountMinor/100)}.${String(input.amountMinor%100).padStart(2,'0')}`,currency:'RUB'}, capture:true,
        confirmation:{type:'redirect',return_url:httpsUrl(input.returnUrl)},description:'Пакет N8',metadata:{order_id:input.orderId} },input.orderId));
      if (result.orderId !== input.orderId || result.amountMinor !== input.amountMinor || (result.status === 'pending' && !result.confirmationUrl)) invalidProof(); return result;
    },
    async getPayment(id) { if (!providerId.safeParse(id).success) invalidProof(); return payment(await request(`/payments/${encodeURIComponent(id)}`),id); },
    async getRefund(id): Promise<Refund> {
      if (!providerId.safeParse(id).success) invalidProof(); const parsed = refundSchema.safeParse(await request(`/refunds/${encodeURIComponent(id)}`)); if (!parsed.success || parsed.data.id !== id) invalidProof();
      return {id:parsed.data.id,paymentId:parsed.data.payment_id,status:'succeeded',amountMinor:minor(parsed.data.amount.value),currency:'RUB'};
    }
  };
}
