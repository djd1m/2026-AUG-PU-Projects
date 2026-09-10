import { spawn } from 'node:child_process';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { ORIGIN, tlsConfig, listen, socket, json } from './network.mjs';
const source = process.env.AGENT_E2E_SOURCE;
if (!source || !process.env.TEST_DATABASE_URL) throw Error('Source and dedicated TEST_DATABASE_URL required');
const db = new URL(process.env.TEST_DATABASE_URL);
if (db.hostname !== 'postgres') throw Error('Only internal dedicated postgres alias permitted');
const child = spawn(process.execPath, [source + '/node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', '3000'], {
  cwd: source + '/apps/web', stdio: 'inherit', env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
});
function proxy(req, res, provider) {
  if (req.headers.host !== new URL(ORIGIN).host || (provider && (req.method !== 'POST' || req.url !== '/api/agent-payments/webhook'))) return json(res, { error: 'Fixture ingress refused' }, 403);
  const headers = { ...req.headers, host: new URL(ORIGIN).host, 'x-forwarded-proto': 'https',
    'x-forwarded-for': provider ? '185.71.76.1' : '192.0.2.70', 'x-real-ip': provider ? '185.71.76.1' : '192.0.2.70' };
  const upstream = request({ hostname: '127.0.0.1', port: 3000, path: req.url, method: req.method, headers, timeout: 30000 }, incoming => {
    res.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) json(res, { error: 'Next unavailable' }, 503); else res.destroy(); });
  req.pipe(upstream);
}
const tls = await tlsConfig();
await listen(createServer(tls, (req, res) => proxy(req, res, false)), socket('web'));
await listen(createServer(tls, (req, res) => proxy(req, res, true)), socket('webhook'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
child.on('exit', code => process.exit(code || 0));
console.log('AGENT_E2E_RUNTIME_READY');
