import { AppError } from '../domain/common.mjs';
import { assert, safeTree, writeJson, rpcError, safeError } from './common.mjs';
import { agentCard, a2a } from './a2a.mjs';
import { mcp } from './mcp.mjs';

const paths = new Set(['/mcp', '/a2a', '/.well-known/agent-card.json']);
const maxBody = 65536;
async function readBody(req) {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new AppError('ENCODING', 415);
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new AppError('CONTENT_TYPE', 415);
  if (Number(req.headers['content-length']) > maxBody) throw new AppError('BODY_TOO_LARGE', 413);
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0;
    const finish = (error, value) => {
      clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', failure); req.off('aborted', failure);
      if (error) { req.resume(); reject(error); } else resolve(value);
    };
    const failure = () => finish(new AppError('BODY_UNAVAILABLE', 400));
    const data = chunk => { bytes += chunk.length; if (bytes > maxBody) finish(new AppError('BODY_TOO_LARGE', 413)); else chunks.push(chunk); };
    const end = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new AppError('PARSE_ERROR', 400)); }
    };
    const timer = setTimeout(() => finish(new AppError('BODY_TIMEOUT', 408)), 10000);
    req.on('data', data); req.once('end', end); req.once('error', failure); req.once('aborted', failure);
  });
}
export function createAgentHandler({ authenticateAgent, executeAgent, origin }) {
  const url = new URL(origin);
  assert(url.origin === origin && (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))));
  assert(typeof authenticateAgent === 'function' && typeof executeAgent === 'function');
  let active = 0;
  return async function handle(req, res, path) {
    if (!paths.has(path)) return false;
    res.setHeader('cache-control', 'no-store'); res.setHeader('x-content-type-options', 'nosniff');
    let body;
    if (active >= 32) { writeJson(res, 429, rpcError(null, -32000, 'Request limit exceeded')); return true; }
    active++;
    try {
      if (req.headers.origin && req.headers.origin !== origin) { writeJson(res, 403, rpcError(null, -32000, 'Origin rejected')); return true; }
      if (path === '/.well-known/agent-card.json') {
        if (req.method !== 'GET') { res.setHeader('allow', 'GET'); writeJson(res, 405, rpcError(null, -32600, 'Method not allowed')); }
        else writeJson(res, 200, agentCard(origin));
        return true;
      }
      const match = /^Bearer ([A-Za-z0-9._~-]{16,512})$/i.exec(req.headers.authorization ?? '');
      if (!match) throw new AppError('UNAUTHENTICATED', 401);
      const token = match[1];
      const reauthenticate = async () => {
        const authority = await authenticateAgent(token);
        assert(authority?.actorId && authority.grantId && Array.isArray(authority.actions), 'UNAUTHENTICATED', 401);
        assert(Date.parse(authority.expiresAt) > Date.now(), 'CREDENTIAL_EXPIRED', 403);
        return authority;
      };
      const authority = await reauthenticate();
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); writeJson(res, 405, rpcError(null, -32600, 'Method not allowed')); return true; }
      if (path === '/mcp' && req.headers['mcp-protocol-version'] && req.headers['mcp-protocol-version'] !== '2025-11-25') {
        writeJson(res, 400, rpcError(null, -32600, 'Unsupported protocol version')); return true;
      }
      if (path === '/a2a' && req.headers['a2a-version'] && req.headers['a2a-version'] !== '0.3.0') {
        writeJson(res, 400, rpcError(null, -32600, 'Unsupported protocol version')); return true;
      }
      body = await readBody(req); safeTree(body);
      const context = { authority, reauthenticate, execute: (action, input, key) => executeAgent(token, action, input, key) };
      if (path === '/mcp') await mcp(req, res, body, context);
      else { const [status, result] = await a2a(body, context); writeJson(res, status, result); }
    } catch (error) {
      if (res.headersSent) { res.end(); return true; }
      let [status, code, message] = safeError(error);
      if ([408, 413, 415].includes(error.status)) { status = error.status; code = -32600; message = 'Request body rejected'; }
      if (error.code === 'PARSE_ERROR') { status = 400; code = -32700; message = 'Parse error'; }
      if (status === 401) res.setHeader('www-authenticate', 'Bearer realm="n3-agent"');
      writeJson(res, status, rpcError(body?.id, code, message));
    } finally { active--; }
    return true;
  };
}
