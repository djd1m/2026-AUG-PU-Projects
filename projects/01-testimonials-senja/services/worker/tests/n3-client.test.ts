import { describe, expect, it, vi } from 'vitest';
import { n3Client, n3Config } from '../src/n3-client.js';

const config = { baseUrl: 'https://n3.example.test', tenantId: '10000000-0000-4000-8000-000000000001', key: 'k'.repeat(43) };
describe('N3 bounded HTTPS transport', () => {
  it('requires exact HTTP 200 data envelope and disables redirects', async () => {
    let status = 200, wrapped = true;
    const call = n3Client(config, async (url, init) => {
      expect(url).toBe('https://n3.example.test/api/integration/customers');
      expect(init?.redirect).toBe('error');
      return new Response(JSON.stringify(wrapped ? { data: { accepted: true } } : { accepted: true }), { status });
    });
    expect(await call('customers', {})).toEqual({ accepted: true });
    for (const other of [201, 202, 302, 400, 503]) {
      status = other;
      await expect(call('customers', {})).rejects.toMatchObject({ code: `N3_HTTP_${other}`, status: 503 });
    }
    status = 200; wrapped = false;
    await expect(call('customers', {})).rejects.toMatchObject({ code: 'N3_RESPONSE' });
  });
  it('rejects response larger than 1 MiB', async () => {
    const call = n3Client(config, async () => new Response(JSON.stringify({ data: { value: 'x'.repeat(1024 * 1024) } })));
    await expect(call('customers', {})).rejects.toMatchObject({ code: 'N3_RESPONSE_LIMIT' });
  });
  it('total deadline rejects and aborts a provider that never responds', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    try {
      const call = n3Client(config, async (_url, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}); });
      const pending = expect(call('customers', {})).rejects.toMatchObject({ code: 'N3_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(8000); await pending;
      expect(signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('requires configured HTTPS origin and rejects credentials or paths', () => {
    const env = { N3_BRIDGE_ENABLED: 'true', N3_BASE_URL: config.baseUrl, N3_TENANT_ID: config.tenantId, N3_CONNECTOR_KEY: config.key };
    expect(n3Config(env)).toEqual(config);
    for (const url of ['http://n3.example.test', 'https://user:pass@n3.example.test', 'https://n3.example.test/path']) {
      expect(() => n3Config({ ...env, N3_BASE_URL: url })).toThrow();
    }
  });
});
