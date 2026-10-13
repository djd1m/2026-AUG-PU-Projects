import type { TcpSocketConnectOpts } from 'node:net';
import { Agent, buildConnector, request } from 'undici';
import { type SiteResolver, validateSite } from './site-safety.js';

export interface SiteResponse { status: number; headers: Record<string, string | string[] | undefined>; body: string }
export type SiteFetch = (url: string, signal: AbortSignal, maxBytes: number) => Promise<SiteResponse>;
export type ConnectorFactory = (options: { lookup: NonNullable<TcpSocketConnectOpts['lookup']> }) => ReturnType<typeof buildConnector>;
export interface SafeHttpOptions {
  resolver?: SiteResolver;
  /** Только внедрение зависимости тестом; производственный вызов использует штатный connector. */
  connectorFactory?: ConnectorFactory;
  timeoutMs?: number;
}

/** Один запрос без автоматических редиректов. Весь DNS/connect/body ограничен одним дедлайном. */
export function createSafeHttp(options: SafeHttpOptions = {}): SiteFetch {
  return async (raw, parentSignal, maxBytes) => {
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(options.timeoutMs ?? 15_000)]);
    signal.throwIfAborted();
    let abort: (() => void) | undefined;
    const safe = await Promise.race([validateSite(raw, options.resolver), new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
    })]).finally(() => { if (abort) signal.removeEventListener('abort', abort); });
    signal.throwIfAborted();
    const connector = (options.connectorFactory ?? buildConnector)({ lookup: (_host, opts, callback) => {
      if (opts.all) callback(null, [{ address: safe.address, family: safe.family }]);
      else callback(null, safe.address, safe.family);
    } });
    const agent = new Agent({ connect: connector });
    try {
      const response = await request(safe.url, { dispatcher: agent, signal,
        headers: { 'user-agent': 'N6bBot', accept: 'text/html,application/xml,text/plain' } });
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response.body) {
        signal.throwIfAborted();
        const data = Buffer.from(chunk);
        bytes += data.length;
        if (bytes > maxBytes) { response.body.destroy(); throw new Error('Превышен предел тела страницы'); }
        chunks.push(data);
      }
      return { status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') };
    } finally { await agent.destroy(); }
  };
}
