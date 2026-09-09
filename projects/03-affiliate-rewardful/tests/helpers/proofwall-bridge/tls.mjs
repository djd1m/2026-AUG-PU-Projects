// Isolated harness transport only. Product URLs and TLS verification remain real.
import { request } from 'node:https';
import { Readable } from 'node:stream';
import { readFile, mkdir, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const P1 = 'https://proofwall.aicoding.space';
export const N3 = 'https://n3-a.212.192.0.33.sslip.io';
export const PROVIDER = 'https://api.yookassa.ru';
export const MAIL = 'https://api.resend.com';
export const PAY = 'https://yoomoney.ru';
export function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing harness configuration: ${name}`);
  return value;
}
export function socket(group, name = 'https.sock') {
  const path = join(required('BRIDGE_SOCKET_ROOT'), group, name);
  if (Buffer.byteLength(path) > 103) throw new Error('Use a shorter BRIDGE_SOCKET_ROOT Unix socket path');
  return path;
}
export async function tlsConfig() {
  return { key: await readFile(required('BRIDGE_TLS_KEY')), cert: await readFile(required('BRIDGE_TLS_CERT')) };
}
export async function listenSocket(server, path) {
  await mkdir(dirname(path), { recursive: true });
  // Never remove a pre-existing socket: it may belong to another running test.
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  await chmod(path, 0o660);
  return server;
}
export async function readJson(req, limit = 65536) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('Harness body limit'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function json(res, body, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
export function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(resolve));
}

// This adapter is intentionally limited to the product's JSON fetch contract.
// Bodies remain streamed so application deadlines/body limits still do the work.
export function socketFetch({ ca, routes, role }) {
  return async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url), target = routes.get(url.origin);
    if (url.protocol !== 'https:' || url.username || url.password || !target || !target.allow(url.pathname)) {
      throw new TypeError('Test transport refused an unlisted endpoint');
    }
    req.signal.throwIfAborted();
    const headers = Object.fromEntries(req.headers);
    headers.host = url.host;
    if ([PROVIDER, MAIL].includes(url.origin) && role) headers['x-bridge-test-client'] = role;
    return new Promise((resolve, reject) => {
      const outbound = request({ socketPath: target.socket, hostname: url.hostname, servername: url.hostname,
        path: url.pathname + url.search, method: req.method, headers, ca, rejectUnauthorized: true, signal: req.signal }, incoming => {
        const status = incoming.statusCode;
        if (status >= 300 && status < 400 && req.redirect !== 'manual') {
          incoming.destroy(); outbound.destroy(); reject(new TypeError('Test transport refused redirect')); return;
        }
        const responseHeaders = new Headers();
        for (let n = 0; n < incoming.rawHeaders.length; n += 2) responseHeaders.append(incoming.rawHeaders[n], incoming.rawHeaders[n + 1]);
        const empty = req.method === 'HEAD' || [204, 205, 304].includes(status);
        if (empty) incoming.resume();
        const response = new Response(empty ? null : Readable.toWeb(incoming), { status, headers: responseHeaders });
        Object.defineProperty(response, 'url', { value: req.url });
        resolve(response);
      });
      outbound.on('error', reject);
      if (req.body) {
        const body = Readable.fromWeb(req.body);
        body.on('error', error => outbound.destroy(error));
        outbound.on('close', () => body.destroy());
        body.pipe(outbound);
      } else outbound.end();
    });
  };
}
