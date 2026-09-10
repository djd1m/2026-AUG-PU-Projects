import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { backendClient } from './backend.mjs';
import { GatewayError } from './contracts.mjs';
import { mcp, a2a, agentCard } from './protocols.mjs';

export function createGateway(options) {
  const origin = new URL(options.publicOrigin);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('INVALID_PUBLIC_ORIGIN');
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('INVALID_PUBLIC_ORIGIN');
  const allowedOrigins = new Set([origin.origin, ...(options.allowedOrigins ?? [])]);
  const call = backendClient(options);
  const server = createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(value));
    };
    try {
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) throw new GatewayError('ORIGIN_DENIED', 403);
      if (req.url === '/health' && req.method === 'GET') return json(200, { status: 'ok', service: 'agent-payments-gateway' });
      if (req.url === '/.well-known/agent-card.json' && req.method === 'GET') return json(200, agentCard(origin.origin));
      if (!['/mcp', '/a2a'].includes(req.url)) throw new GatewayError('NOT_FOUND', 404);
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST'); throw new GatewayError('METHOD_NOT_ALLOWED', 405);
      }
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new GatewayError('JSON_REQUIRED', 415);
      if (Number(req.headers['content-length']) > 16384) { req.resume(); throw new GatewayError('BODY_LIMIT', 413); }
      const authorization = req.headers.authorization;
      if (authorization && !/^Bearer [A-Za-z0-9._~+-]{32,512}$/.test(authorization)) throw new GatewayError('INVALID_BEARER', 401);
      // No trust of inbound X-Forwarded-For: caller cannot forge another rate-limit identity.
      const clientKey = createHash('sha256').update(req.socket.remoteAddress ?? 'unknown').digest('hex');
      let size = 0, chunks = [];
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > 16384) { req.resume(); throw new GatewayError('BODY_LIMIT', 413); }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new GatewayError('INVALID_JSON'); }
      const execute = (command, input) => call(command, input, authorization, clientKey);
      if (req.url === '/mcp') return await mcp(req, res, body, execute);
      const [status, result] = await a2a(body, execute); return json(status, result);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      json(error instanceof GatewayError ? error.status : 500, { error: { code: error instanceof GatewayError ? error.code : 'GATEWAY_UNAVAILABLE' } });
    }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  return server;
}
