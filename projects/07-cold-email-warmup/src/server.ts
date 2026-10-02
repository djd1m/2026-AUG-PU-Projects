import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { Config } from './config.js';
import { HttpError } from './errors.js';
import { ready } from './db.js';
import { isValidPassword } from './auth/password.js';
import { AuthService } from './auth/service.js';
import { readToken, sessionCookie } from './auth/session.js';
import { PgAuthStore } from './auth/store.js';
import { authPage, authScript } from './web/page.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new HttpError(400, 'invalid_input');
  const declared = Number(req.headers['content-length'] ?? '0');
  if (!Number.isFinite(declared) || declared > 65536) throw new HttpError(413, 'request_too_large');
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += Buffer.byteLength(chunk);
    if (length > 65536) throw new HttpError(413, 'request_too_large');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new HttpError(400, 'invalid_input'); }
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data));
}
export async function application(config: Config, pool: Pool) {
  const store = new PgAuthStore(pool); const auth = new AuthService(store, config.sessionKey);
  await auth.initialize();
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    void (async () => {
      const path = (req.url ?? '').split('?')[0]!; const unsafe = !['GET','HEAD','OPTIONS'].includes(req.method ?? '');
      if (unsafe && req.headers.origin !== config.origin) throw new HttpError(403, 'origin_denied');
      if (req.method === 'GET' && (path === '/healthz' || path === '/readyz')) {
        const isReady = await ready(pool); return json(res, isReady ? 200 : 503, {data:{ready:isReady},meta:{}});
      }
      if (req.method === 'GET' && (path === '/' || path === '/auth.js')) {
        res.writeHead(200, {'Content-Type':path === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'});
        res.end(path === '/' ? authPage : authScript); return;
      }
      if (req.method === 'POST' && ['/api/auth/register','/api/auth/login'].includes(path)) {
        const input = await body(req);
        if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || !isValidPassword(input.password)) throw new HttpError(400, 'invalid_input');
        const email = input.email.trim().toLowerCase();
        const kind = path.endsWith('/register') ? 'register' : 'login';
        // Direct socket is the only trusted IP; forwarded headers never authorize a key.
        await store.charge(kind, email, req.socket.remoteAddress ?? 'unknown');
        const token = await auth[kind](email, input.password);
        res.setHeader('Set-Cookie', sessionCookie(token, config.secureCookie));
        return json(res, kind === 'register' ? 201 : 200, {data:{authenticated:true},meta:{}});
      }
      if (path.startsWith('/api/')) {
        const token = readToken(req.headers.cookie);
        const identity = token ? await auth.authenticate(token) : null;
        if (!identity) throw new HttpError(401, 'unauthorized');
        if (path === '/api/auth/me' && req.method === 'GET') return json(res, 200, {data:identity,meta:{}});
        if (path === '/api/auth/logout' && req.method === 'POST') {
          await body(req); await auth.logout(token!);
          res.setHeader('Set-Cookie', sessionCookie('', config.secureCookie, true));
          return json(res, 200, {data:{loggedOut:true},meta:{}});
        }
        if (path.startsWith('/api/mailboxes/')) {
          const id = path.slice('/api/mailboxes/'.length);
          if (!UUID.test(id)) throw new HttpError(400, 'invalid_input');
          const mailbox = await store.mailbox(identity.tenant_id, id);
          if (!mailbox) throw new HttpError(404, 'not_found');
          if (req.method !== 'GET') throw new HttpError(405, 'method_not_allowed');
          return json(res, 200, {data:mailbox,meta:{}});
        }
      }
      throw new HttpError(404, 'not_found');
    })().catch((error: unknown) => {
      // Never echo native/provider/SQL messages or supplied request data.
      const safe = error instanceof HttpError ? error : new HttpError(503, 'service_unavailable');
      if (safe.retryAfter !== undefined) res.setHeader('Retry-After', String(safe.retryAfter));
      json(res, safe.status, {error:{code:safe.code,message:safe.code}});
    });
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.timeout = 10000; server.maxHeadersCount = 64;
  return { server, auth, store };
}
