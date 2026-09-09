import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createAgentHandler } from '../shared/agents/index.mjs';
import { seed } from '../shared/infrastructure/seed.mjs';
import { authorize, createGrant, readActions } from '../shared/application/access.mjs';
import { dispatch } from '../shared/application/dispatch.mjs';
import { AppError, hash } from '../shared/domain/common.mjs';

// Real HTTP/SDK/domain; this harness deliberately substitutes persistence and credential storage.
// SQL durability, membership and credential lifecycle are covered by commercial integration tests.
async function fixture(t, role = 'merchant') {
  const state = seed(randomUUID()), actor = state.actors.find(value => value.role === role);
  const actions = role === 'merchant' ? ['dashboard', 'program.read', 'registry.prepare', 'registry.read'] : [role === 'partner' ? 'partner.read' : 'credit.read'];
  const grant = createGrant(state, actor, { actions, expiresInSeconds: 3600 }, Date.now());
  const token = randomUUID(), context = { actorId: actor.id, grantId: grant.id };
  let revoked = false, expire = false, leakError = false, onExecute;
  const calls = [], cache = new Map();
  async function authenticateAgent(bearer) {
    if (bearer !== token) throw new AppError('UNAUTHENTICATED', 401);
    if (revoked) throw new AppError('REVOKED', 403, `private-token:${token}`);
    return { actorId: actor.id, role, actions, grantId: grant.id, expiresAt: new Date(Date.now() + (expire ? -1000 : 3600000)).toISOString() };
  }
  async function executeAgent(bearer, action, input, key) {
    await authenticateAgent(bearer);
    if (leakError) throw new Error(`database password secret ${token}`);
    calls.push(action); authorize(state, actor, context, action, input, Date.now());
    const cacheKey = `${action}:${key}`;
    if (!readActions.has(action) && cache.has(cacheKey)) {
      const previous = cache.get(cacheKey);
      if (previous.hash !== hash(input)) throw new AppError('IDEMPOTENCY_CONFLICT', 409);
      return structuredClone(previous.result);
    }
    const result = dispatch(state, actor, context, action, input, Date.now());
    if (!readActions.has(action)) cache.set(cacheKey, { hash: hash(input), result: structuredClone(result) });
    onExecute?.(action);
    return structuredClone(result);
  }
  let handler;
  const server = createServer(async (req, res) => {
    try { if (!(await handler(req, res, req.url))) { res.writeHead(404); res.end(); } }
    catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createAgentHandler({ authenticateAgent, executeAgent, origin });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  const rpc = async (method, params, path = '/a2a', extra = {}) => {
    const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return { status: response.status, body: await response.json() };
  };
  const send = (messageId = randomUUID(), kind = 'registry', input = { period: '2026-08' }) =>
    ({ message: { kind: 'message', role: 'user', messageId, parts: [{ kind: 'data', data: { kind, input } }] } });
  return { origin, headers, rpc, send, state, calls, actor, grant, executeAgent, token,
    revoke: () => { revoked = true; }, expire: () => { expire = true; }, leak: () => { leakError = true; },
    afterExecute: fn => { onExecute = fn; } };
}

test('official MCP SDK initializes protocol 2025-11-25, discovers tools and calls the real domain', async t => {
  const f = await fixture(t);
  const client = new Client({ name: 'n3-interoperability-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${f.origin}/mcp`), { requestInit: { headers: f.headers } });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal(transport.protocolVersion, '2025-11-25');
  assert.equal(transport.sessionId, undefined);
  const tools = (await client.listTools()).tools;
  assert(tools.some(tool => tool.name === 'registry_prepare'));
  assert(!tools.some(tool => /approve|sent|export|grant|credential/.test(tool.name)));
  const result = await client.callTool({ name: 'registry_prepare', arguments: { input: { period: '2026-08' }, idempotencyKey: 'sdk-prepare' } });
  assert.equal(result.isError, undefined);
  assert(result.structuredContent.artifactId);
  const replay = await client.callTool({ name: 'registry_prepare', arguments: { input: { period: '2026-08' }, idempotencyKey: 'sdk-prepare' } });
  assert.deepEqual(replay.structuredContent, result.structuredContent);
  f.revoke();
  await assert.rejects(client.listTools());
  await assert.rejects(client.callTool({ name: 'registry_prepare', arguments: { input: { period: '2026-08' }, idempotencyKey: 'sdk-prepare' } }));
});

test('A2A card and durable application task mapping: replay, changed input, current get, terminal cancel', async t => {
  const f = await fixture(t);
  const card = await (await fetch(`${f.origin}/.well-known/agent-card.json`)).json();
  assert.equal(card.protocolVersion, '0.3.0'); assert.equal(card.url, `${f.origin}/a2a`);
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false, stateTransitionHistory: false });
  assert.deepEqual(card.security, [{ agentBearer: [] }]); assert.equal(card.securitySchemes.agentBearer.scheme, 'bearer');
  const params = f.send('stable-message');
  const first = await f.rpc('message/send', params);
  assert.equal(first.status, 200); assert.equal(first.body.result.kind, 'task');
  assert.equal(first.body.result.status.state, 'completed');
  assert.equal(first.body.result.contextId, first.body.result.id);
  assert.equal(first.body.result.artifacts[0].parts[0].kind, 'data');
  assert(!JSON.stringify(first.body).includes(f.grant.id));
  const replay = await f.rpc('message/send', params);
  assert.deepEqual(replay, first); assert.equal(f.state.tasks.length, 1);
  const conflict = await f.rpc('message/send', f.send('stable-message', 'registry', { period: '2026-07' }));
  assert.equal(conflict.body.error.code, -32602); assert.equal(f.state.tasks.length, 1);
  assert.deepEqual((await f.rpc('tasks/get', { id: first.body.result.id })).body.result, first.body.result);
  assert.equal((await f.rpc('tasks/cancel', { id: first.body.result.id })).body.error.code, -32002);
  f.revoke();
  assert.equal((await f.rpc('tasks/get', { id: first.body.result.id })).status, 403);
  assert.equal((await f.rpc('message/send', params)).status, 403);
});

test('A2A supports pending cancellation, forbids foreign task ownership and scopes', async t => {
  const f = await fixture(t, 'partner');
  assert.equal((await f.rpc('message/send', f.send())).status, 403);
  const created = await f.executeAgent(f.token, 'task.create', { kind: 'partner', input: {} }, 'pending');
  const canceled = await f.rpc('tasks/cancel', { id: created.id });
  assert.equal(canceled.body.result.status.state, 'canceled');
  assert.equal((await f.rpc('tasks/cancel', { id: created.id })).body.error.code, -32002);
  f.state.tasks.push({ ...created, id: 'other-task', actorId: 'someone-else' });
  assert.equal((await f.rpc('tasks/get', { id: 'other-task' })).status, 403);
  assert.equal((await f.rpc('tasks/get', { id: 'absent-task' })).body.error.code, -32001);
  assert.equal((await f.rpc('message/send', f.send('own-partner', 'partner', { partnerId: 'someone-else' }))).status, 403);
  assert.equal((await f.rpc('message/send', f.send('own-partner', 'partner', {}))).body.result.status.state, 'completed');
});

test('A2A rejects authority/context injection and unsupported protocol operations with JSON-RPC errors', async t => {
  const f = await fixture(t);
  for (const field of ['contextId', 'taskId', 'actorId', 'metadata']) {
    const params = f.send(); params.message[field] = 'injected';
    assert.equal((await f.rpc('message/send', params)).body.error.code, -32602);
  }
  const params = f.send(); params.message.parts[0].data.input.grantId = f.grant.id;
  assert.equal((await f.rpc('message/send', params)).body.error.code, -32602);
  assert.equal((await f.rpc('unknown/method', {})).body.error.code, -32601);
  assert.equal((await f.rpc('message/stream', f.send())).body.error.code, -32004);
  assert.equal((await f.rpc('tasks/pushNotificationConfig/set', {})).body.error.code, -32003);
  assert.equal((await f.rpc('agent/getAuthenticatedExtendedCard', {})).body.error.code, -32007);
  assert.equal((await f.rpc('message/send', { ...f.send(), configuration: { pushNotificationConfig: {} } })).body.error.code, -32003);
  assert.equal((await f.rpc('message/send', { ...f.send(), configuration: { blocking: false } })).body.error.code, -32004);
  const text = f.send(); text.message.parts = [{ kind: 'text', text: 'make a payment' }];
  assert.equal((await f.rpc('message/send', text)).body.error.code, -32005);
  assert.equal(f.state.tasks.length, 0);
});

test('standalone boundary: bearer, Origin, methods, body bounds, parsing, versions and notifications', async t => {
  const f = await fixture(t);
  for (const path of ['/mcp', '/a2a']) {
    const missing = await fetch(`${f.origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missing.status, 401); assert.match(missing.headers.get('www-authenticate'), /Bearer/);
    assert.equal((await f.rpc('ping', {}, path, { origin: 'https://attacker.test' })).status, 403);
    assert.equal((await fetch(`${f.origin}${path}`, { headers: f.headers })).status, 405);
    assert.equal((await fetch(`${f.origin}${path}`, { method: 'POST', headers: f.headers, body: 'x'.repeat(65537) })).status, 413);
    const invalid = await fetch(`${f.origin}${path}`, { method: 'POST', headers: f.headers, body: '{' });
    assert.equal((await invalid.json()).error.code, -32700);
    assert.equal((await f.rpc('ping', {}, path, { [path === '/mcp' ? 'mcp-protocol-version' : 'a2a-version']: '1900-01-01' })).status, 400);
  }
  const notify = await fetch(`${f.origin}/a2a`, { method: 'POST', headers: f.headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'message/send', params: f.send() }) });
  assert.equal(notify.status, 204); assert.equal(await notify.text(), ''); assert.equal(f.state.tasks.length, 0);
  const mcpNotify = await fetch(`${f.origin}/mcp`, { method: 'POST', headers: f.headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(mcpNotify.status, 202);
  f.expire(); assert.equal((await f.rpc('message/send', f.send())).status, 403);
});

test('revocation during execution prevents result publication; internal errors never expose secrets', async t => {
  const f = await fixture(t);
  f.afterExecute(action => { if (action === 'task.read') f.revoke(); });
  const result = await f.rpc('message/send', f.send());
  assert.equal(result.status, 403); assert(!JSON.stringify(result).includes(f.token)); assert(!result.body.result);
  const other = await fixture(t); other.leak();
  const failure = await other.rpc('message/send', other.send());
  assert.equal(failure.status, 500); assert.equal(failure.body.error.code, -32603); assert(!JSON.stringify(failure).includes(other.token));
});

test('cancellation loses a completion race safely and MCP rejects out-of-scope calls and injected input', async t => {
  const f = await fixture(t);
  const pending = await f.executeAgent(f.token, 'task.create', { kind: 'registry', input: { period: '2026-08' } }, 'race');
  f.afterExecute(action => { if (action === 'task.read') f.state.tasks.find(task => task.id === pending.id).state = 'completed'; });
  assert.equal((await f.rpc('tasks/cancel', { id: pending.id })).body.error.code, -32002);
  const other = await fixture(t, 'partner');
  assert.equal((await other.rpc('tools/call', { name: 'registry_prepare', arguments: { input: { period: '2026-08' }, idempotencyKey: 'scope' } }, '/mcp')).body.error.code, -32602);
  assert.equal((await other.rpc('tools/call', { name: 'partner_read', arguments: { input: { actorId: f.actor.id } } }, '/mcp')).body.result.isError, true);
  const unknown = await other.rpc('unknown/method', {}, '/mcp');
  assert.equal(unknown.body.error.code, -32601);
});
