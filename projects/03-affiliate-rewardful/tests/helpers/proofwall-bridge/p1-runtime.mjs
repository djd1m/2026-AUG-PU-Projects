import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:https';
import { P1, tlsConfig, socket, listenSocket, closeServer, json } from './tls.mjs';

const source = process.env.BRIDGE_P1_SOURCE || '/app';
const child = spawn(process.execPath, [`${source}/node_modules/next/dist/bin/next`, 'start', '--hostname', '127.0.0.1', '-p', '3000'],
  { cwd: `${source}/apps/web`, env: process.env, stdio: 'inherit' });
const tls = await tlsConfig();
function proxy(req, res, provider) {
  if (req.headers.host !== new URL(P1).host || (provider && (req.method !== 'POST' || req.url !== '/api/webhooks/payment' || req.headers.origin))) {
    return json(res, { error: 'Harness ingress refused' }, 403);
  }
  const headers = { ...req.headers, host: new URL(P1).host, 'x-forwarded-proto': 'https',
    'x-forwarded-for': provider ? '185.71.76.1' : '192.0.2.10', 'x-real-ip': provider ? '185.71.76.1' : '192.0.2.10' };
  const upstream = request({ hostname: '127.0.0.1', port: 3000, path: req.url, method: req.method, headers, timeout: 20000 }, remote => {
    res.writeHead(remote.statusCode, remote.headers); remote.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy());
  upstream.on('error', () => { if (!res.headersSent) json(res, { error: 'Next unavailable' }, 503); else res.destroy(); });
  req.on('aborted', () => upstream.destroy()); req.pipe(upstream);
}
const publicServer = await listenSocket(createServer(tls, (req, res) => proxy(req, res, false)), socket('p1'));
const webhookServer = await listenSocket(createServer(tls, (req, res) => proxy(req, res, true)), socket('p1-webhook'));
let stopping = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  child.kill('SIGTERM'); await Promise.all([closeServer(publicServer), closeServer(webhookServer)]); process.exit(code);
}
child.on('error', () => void stop(1));
child.on('exit', code => void stop(code || 1));
process.on('SIGTERM', () => void stop()); process.on('SIGINT', () => void stop());
process.stdout.write('BRIDGE_P1_GATEWAY_READY\n');
