/** Server-only transport shared with web. No browser imports or provider secrets. */
export const N3_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const N3_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export interface N3Config { baseUrl: string; tenantId: string; key: string }
export class N3Error extends Error {
  constructor(public readonly code: string, public readonly status = 503) { super(code); }
}
export function n3Config(env: NodeJS.ProcessEnv = process.env): N3Config | null {
  if (env.N3_BRIDGE_ENABLED !== 'true') return null;
  let url: URL;
  try { url = new URL(env.N3_BASE_URL ?? ''); } catch { throw new N3Error('N3_CONFIGURATION'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !N3_UUID.test(env.N3_TENANT_ID ?? '') || !N3_TOKEN.test(env.N3_CONNECTOR_KEY ?? '')) {
    throw new N3Error('N3_CONFIGURATION');
  }
  return { baseUrl: url.origin, tenantId: env.N3_TENANT_ID!, key: env.N3_CONNECTOR_KEY! };
}
export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new N3Error('N3_RESPONSE');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024 * 1024) { void reader.cancel(); throw new N3Error('N3_RESPONSE_LIMIT'); }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof N3Error) throw error;
    throw new N3Error('N3_RESPONSE');
  } finally { reader.releaseLock(); }
}
export type N3Call = (route: 'customers' | 'external-orders' | 'external-events' | 'order', input: unknown) => Promise<Record<string, unknown>>;
export function n3Client(config: N3Config, fetchImpl: typeof fetch = fetch): N3Call {
  return async (route, input) => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new N3Error('N3_TIMEOUT')); }, 8000);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetchImpl(`${config.baseUrl}/api/integration/${route}`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
          body: JSON.stringify(input),
        });
        const body = await boundedJson(response);
        if (!response.ok) throw new N3Error(`N3_HTTP_${response.status}`, response.status);
        if (!record(body) || !record(body.data)) throw new N3Error('N3_RESPONSE');
        return body.data;
      })()]);
    } catch (error) {
      if (error instanceof N3Error) throw error;
      throw new N3Error('N3_NETWORK');
    } finally { clearTimeout(timer); }
  };
}
export function externalOrderResult(value: Record<string, unknown>): string {
  if (typeof value.orderId !== 'string' || !N3_UUID.test(value.orderId)
    || value.amountMinor !== 99000 || value.currency !== 'RUB' || value.testMode !== true) {
    throw new N3Error('N3_ORDER_MISMATCH');
  }
  return value.orderId;
}
