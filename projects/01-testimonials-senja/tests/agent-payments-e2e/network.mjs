import { request } from 'node:https';
import { Readable } from 'node:stream';
import { readFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
export const ORIGIN = 'https://agent-proofwall.test';
export const PROVIDER = 'https://api.yookassa.ru';
export const MAIL = 'https://api.resend.com';
export const PAY = 'https://yoomoney.ru';
export const root = () => process.env.AGENT_E2E_RUNTIME;
export const socket = name => join(root(), `${name}.sock`);
export async function tlsConfig() {
  return { key: await readFile(join(root(), 'fixture.key')), cert: await readFile(join(root(), 'fixture.crt')) };
}
export async function listen(server, path) {
  await mkdir(root(), { recursive: true });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  await chmod(path, 0o666); return server;
}
export function json(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value));
}
export async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 65536) throw Error('Fixture body limit'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** TEST transport only: preserve URL/TLS/account/HTTP semantics; no unlisted endpoint fallback. */
export function localFetch(routes, ca) {
  return async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url), target = routes.get(url.origin);
    if (!target || url.protocol !== 'https:' || url.username || url.password || !target.allow(url.pathname)) throw Error('Unlisted fixture endpoint refused');
    return new Promise((resolve, reject) => {
      const outgoing = request({ socketPath: target.socket, hostname: url.hostname, servername: url.hostname,
        path: url.pathname + url.search, method: req.method, headers: { ...Object.fromEntries(req.headers), host: url.host },
        ca, rejectUnauthorized: true, signal: req.signal }, incoming => {
        const headers = new Headers();
        for (let i = 0; i < incoming.rawHeaders.length; i += 2) headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        resolve(new Response([204, 205, 304].includes(incoming.statusCode) ? null : Readable.toWeb(incoming), { status: incoming.statusCode, headers }));
      });
      outgoing.on('error', reject);
      if (req.body) Readable.fromWeb(req.body).pipe(outgoing); else outgoing.end();
    });
  };
}
