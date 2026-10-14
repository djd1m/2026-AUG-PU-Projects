import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import next from 'next';
import { getBase } from './server/composition';
import { checkReady } from './server/health';
import { sanitizeIngress } from './server/peer';
import { isDomainError } from '@n8/domain/common';
export async function startServer() {
  const base = getBase();
  if (!await checkReady(base)) throw new Error('STARTUP_NOT_READY');
  const rawPort = process.env.N8_HTTP_PORT ?? '3088';
  if (!/^[0-9]+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) throw new Error('PORT_CONFIG_INVALID');
  const port = Number(rawPort), dev = process.env.NODE_ENV !== 'production';
  const app = next({ dev, dir: path.dirname(fileURLToPath(new URL('../package.json', import.meta.url))), hostname: '127.0.0.1', port });
  await app.prepare(); const handler = app.getRequestHandler();
  const server = createServer({ maxHeaderSize: 16 * 1024, headersTimeout: 10_000, requestTimeout: 15_000 }, async (req, res) => {
    try {
      sanitizeIngress(req, base.config.trustedProxyIP);
      const nonce = randomBytes(16).toString('base64');
      const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'${dev ? ' ws:' : ''}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
      req.headers['content-security-policy'] = csp; req.headers['x-nonce'] = nonce;
      res.setHeader('Content-Security-Policy', csp); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      await handler(req, res);
    } catch (error) {
      const requestId = randomUUID(); const code = isDomainError(error) ? error.code : 'UNAVAILABLE';
      console.error(JSON.stringify({ requestId, code, latencyMs: 0 }));
      if (!res.headersSent) { res.writeHead(isDomainError(error) ? error.status : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: { code, message: 'Запрос не выполнен' }, meta: { requestId } })); }
      else res.destroy();
    }
  });
  // Container listen may be all interfaces only inside its private network; host publication stays loopback.
  const host = process.env.N8_BIND_HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '0.0.0.0', '::1'].includes(host)) throw new Error('HOST_CONFIG_INVALID');
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, close: async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await app.close(); await base.pool.end(); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(instance => {
    const stop = () => { void instance.close().then(() => { process.exitCode = 0; }).catch(() => { process.exitCode = 1; }); };
    process.once('SIGTERM', stop); process.once('SIGINT', stop);
  }).catch(() => { console.error(JSON.stringify({ code: 'STARTUP_FAILED' })); process.exitCode = 1; });
}
