import { Agent } from 'undici';

// Per-selection ownership keeps Cloud.ru phase bounds isolated from other providers.
// The combined AbortSignal in provider.ts separately bounds total elapsed time.
export function createCloudruTransport(timeoutMs = 600000) {
  const dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs });
  return { dispatcher, async dispose() { await dispatcher.destroy(); } };
}
