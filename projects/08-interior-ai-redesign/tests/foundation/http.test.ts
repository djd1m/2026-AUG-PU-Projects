import { describe, expect, it, vi } from 'vitest';
import { IncomingMessage, createServer, request as nodeRequest } from 'node:http';
import { Socket } from 'node:net';
import { guardRequest, readJson, MAX_JSON_BYTES, route, sessionCookie, readSessionCookie, type GuardDeps } from '../../apps/web/src/server/http';
import { normalizePeer, sanitizeIngress } from '../../apps/web/src/server/peer';
const origin = 'https://n8.test';
function request(body = '{}', headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-n8-peer': '192.0.2.1', origin, cookie: 'n8_session=' + 'a'.repeat(43), ...headers }, body });
}
function dependencies() {
  return { auth: { authenticate: vi.fn(async () => ({ accountId: 'actor' })) }, config: { publicOrigin: origin },
    projects: { get: vi.fn(async () => ({ state: 'active' })) }, hashSubject: vi.fn(x => x), rate: { hit: vi.fn(async () => ({ allowed: true, retryAfter: 30 })) } } as unknown as GuardDeps;
}
describe('SC-US-016/020 bounded pre-body HTTP', () => {
  it('SC-US-016-1 exact Origin required after atomic rate and before body; foreign owner returns404 without parsing', async () => {
    for (const supplied of ['', 'https://n8.test.evil', origin + '/', 'null', origin + ', ' + origin]) {
      const req = request('{', { origin: supplied }); const reader = vi.spyOn(req.body!, 'getReader'); const deps = dependencies();
      await expect(guardRequest(req, { access: 'mutation' }, deps)).rejects.toMatchObject({ status: 403 });
      expect(deps.rate.hit).toHaveBeenCalledOnce(); expect(reader).not.toHaveBeenCalled();
    }
    const deps = dependencies(); vi.mocked(deps.projects.get).mockRejectedValue({ status: 404 });
    const req = request(); await expect(guardRequest(req, { access: 'mutation', projectId: 'foreign' }, deps)).rejects.toMatchObject({ status: 404 }); expect(req.bodyUsed).toBe(false);
  });
  it('SC-US-016-3 correct Origin/owner/If-Match passes with actor; missing/invalid version denied', async () => {
    const deps = dependencies(); expect(await guardRequest(request('{}', { 'if-match': '2' }), { access: 'mutation', projectId: 'owned', expectedVersion: true }, deps)).toMatchObject({ accountId: 'actor', expectedVersion: 2 });
    await expect(guardRequest(request(), { access: 'mutation', expectedVersion: true }, deps)).rejects.toMatchObject({ status: 428 });
    await expect(guardRequest(request('{}', { 'if-match': '2, 2' }), { access: 'mutation', expectedVersion: true }, deps)).rejects.toMatchObject({ status: 400 });
  });
  it('SC-US-020-1 malformed/oversized/slow body is counted and bounded before parse', async () => {
    const deps = dependencies(); const malformed = request('{'); await guardRequest(malformed, { access: 'mutation' }, deps);
    await expect(readJson(malformed)).rejects.toMatchObject({ status: 400 }); expect(deps.rate.hit).toHaveBeenCalledOnce();
    await expect(readJson(request('a'.repeat(MAX_JSON_BYTES + 1)))).rejects.toMatchObject({ status: 413 });
    const slow = new Request(origin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: new ReadableStream(), duplex: 'half' } as RequestInit);
    await expect(readJson(slow, 20)).rejects.toMatchObject({ status: 408 });
    vi.mocked(deps.rate.hit).mockResolvedValue({ allowed: false, retryAfter: 30 }); const req = request('{'); const reader = vi.spyOn(req.body!, 'getReader');
    await expect(guardRequest(req, { access: 'mutation' }, deps)).rejects.toMatchObject({ status: 429, retryAfter: 30 }); expect(reader).not.toHaveBeenCalled();
  });
  it('SC-US-021-1 error envelope/log only allowlisted code/requestId/latency, never secret exception payload', async () => {
    const log = vi.fn(); const handler = route(async () => { throw new Error('password=secret token=private plan=private'); }, log);
    const response = await handler(request()); expect(response.status).toBe(503); const serialized = JSON.stringify(await response.json()) + JSON.stringify(log.mock.calls);
    expect(serialized).not.toMatch(/password|secret|token|private|plan/); expect(log.mock.calls[0][0]).toEqual({ code: 'UNAVAILABLE', requestId: expect.any(String), latencyMs: expect.any(Number) });
  });
  it('cookies have HttpOnly/SameSite/Secure HTTPS/TTL; duplicate session fails closed', () => {
    expect(sessionCookie('a'.repeat(43), origin)).toContain('HttpOnly; SameSite=Lax; Max-Age=604800; Secure');
    expect(sessionCookie('a'.repeat(43), 'http://127.0.0.1')).not.toContain('Secure');
    expect(readSessionCookie(request('{}', { cookie: 'n8_session=' + 'a'.repeat(43) + '; n8_session=' + 'b'.repeat(43) }))).toBeNull();
  });
});
describe('custom Node peer boundary', () => {
  function incoming(peer?: string) {
    const socket = new Socket(); Object.defineProperty(socket, 'remoteAddress', { value: peer }); return new IncomingMessage(socket);
  }
  it('strips duplicated forwarded/reserved attacker headers and replaces peer from socket, normalizes mapped IPv4', () => {
    const req = incoming('::ffff:192.0.2.44'); req.rawHeaders = ['X-N8-Peer', 'evil', 'x-n8-peer', 'evil2', 'X-Forwarded-For', '127.0.0.1', 'Forwarded', 'for=evil', 'X-Middleware-Subrequest', 'middleware'];
    req.headers = { 'x-n8-peer': 'evil, evil2', 'x-forwarded-for': '127.0.0.1', forwarded: 'for=evil', 'x-middleware-subrequest': 'middleware' };
    sanitizeIngress(req); expect(req.headers).toEqual({ 'x-n8-peer': '192.0.2.44' }); expect(req.rawHeaders).toEqual(['x-n8-peer', '192.0.2.44']);
    expect(normalizePeer('::ffff:c000:22c')).toBe('192.0.2.44'); expect(normalizePeer('2001:0db8:0:0:0:0:0:1')).toBe('2001:db8::1');
  });
  it('missing peer cannot fall back to XFF; duplicate security header rejected', () => {
    const req = incoming(); req.headers['x-forwarded-for'] = '192.0.2.1'; expect(() => sanitizeIngress(req)).toThrow();
    const duplicate = incoming('127.0.0.1'); duplicate.rawHeaders = ['Origin', origin, 'origin', origin]; expect(() => sanitizeIngress(duplicate)).toThrow('Повтор заголовка');
    expect(() => normalizePeer('192.0.2.1,192.0.2.2')).toThrow();
  });
});


it('actual loopback socket overwrites raw spoofed duplicate forwarding before application reads', async () => {
  const server = createServer((req, res) => {
    try { sanitizeIngress(req); res.end(JSON.stringify({ peer: req.headers['x-n8-peer'], forwarded: req.headers['x-forwarded-for'] ?? null })); }
    catch { res.writeHead(400); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('listen failed');
    const response = await new Promise<string>((resolve, reject) => {
      const req = nodeRequest({ host: '127.0.0.1', port: address.port, path: '/', headers: { 'x-n8-peer': ['evil', 'evil2'], 'x-forwarded-for': ['192.0.2.1', '192.0.2.2'] } }, res => {
        let body = ''; res.on('data', chunk => { body += String(chunk); }); res.on('end', () => resolve(body));
      }); req.on('error', reject); req.end();
    });
    expect(JSON.parse(response)).toEqual({ peer: '127.0.0.1', forwarded: null });
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

it('runtime bundle copies preserve branded typed errors; structural secret lookalike stays redacted',async()=>{
 const {DomainError,isDomainError}=await import('@n8/domain/common');
 const original=new DomainError(422,'INVALID_ASSET','Некорректный файл');
 const copy=Object.assign(new Error(original.message),{status:422,code:'INVALID_ASSET',[Symbol.for('n8.domain-error')]:true});
 expect(isDomainError(copy)).toBe(true);
 const {failure}=await import('../../apps/web/src/server/http');
 expect(failure(copy,'request').status).toBe(422);
 const spoof={status:422,code:'INVALID_ASSET',message:'secret raw payload',name:'DomainError'};
 expect(isDomainError(spoof)).toBe(false);const response=failure(spoof,'request');expect(response.status).toBe(503);expect(await response.text()).not.toContain('secret raw payload');
});
