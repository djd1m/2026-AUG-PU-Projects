import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createGateway } from '../src/server.mjs';

const token = 'buyer-token-'.padEnd(43, 'x'), secret = 'test-gateway-'.padEnd(43, 's');
async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
async function fixture() {
  const calls = [], orders = new Map();
  const backend = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); calls.push({ body, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    if (req.headers['x-agent-gateway-key'] !== secret) { res.statusCode = 403; return res.end('{}'); }
    if (req.headers.authorization !== `Bearer ${token}` && !body.command.startsWith('buyer_link_')) {
      res.statusCode = 403; return res.end(JSON.stringify({ error: { code: 'GRANT_REVOKED', message: 'private provider credentials MUST NOT LEAK' } }));
    }
    let value;
    if (body.command === 'buyer_link_start') value = { pairingId: 'pairing', pollToken: 'p'.repeat(43), approvalUrl: 'https://proofwall.test/agent-payments', expiresAt: '2026-09-10T12:00:00Z' };
    if (body.command === 'offer_get') value = { quoteId: 'quote', productId: 'paid', amount: { minor: '99000', currency: 'RUB' } };
    if (body.command === 'order_create') {
      value = orders.get(body.input.requestKey) ?? { orderId: body.input.requestKey, paymentStatus: 'prepared', fulfillmentStatus: 'not_started', nextAction: { kind: 'none' } };
      orders.set(body.input.requestKey, value);
    }
    if (body.command === 'payment_execute') {
      value = orders.get(body.input.orderId);
      if (value) value = { ...value, paymentStatus: 'prepared', nextAction: { kind: 'human_approval', url: 'https://proofwall.test/agent-payments' } };
      orders.set(body.input.orderId, value);
    }
    if (body.command === 'order_get') value = orders.get(body.input.orderId);
    if (!value) { res.statusCode = 404; return res.end(JSON.stringify({ error: { code: 'ORDER_NOT_FOUND' } })); }
    res.end(JSON.stringify(value));
  });
  const backendOrigin = await listen(backend);
  const options = { publicOrigin: 'https://proofwall-agent.test', backendUrl: `${backendOrigin}/api/agent-payments/commands`, gatewaySecret: secret };
  const gateway = createGateway(options), origin = await listen(gateway);
  return { calls, orders, backend, gateway, origin, options, async close() { await close(gateway); await close(backend); } };
}
async function client(origin, bearer = token) {
  const instance = new Client({ name: 'agent-payments-conformance', version: '1.0.0' });
  await instance.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} },
  }));
  return instance;
}
async function rpc(origin, method, params, bearer = token) {
  const response = await fetch(`${origin}/a2a`, { method: 'POST', headers: {
    'content-type': 'application/json', authorization: `Bearer ${bearer}`,
  }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { status: response.status, body: await response.json() };
}
function message(command, input) {
  return { message: { kind: 'message', role: 'user', messageId: 'stable-message', parts: [{ kind: 'data', data: { command, input } }] } };
}

test('MCP SDK and A2A share order identity, preserve human handoff and survive gateway restart', async () => {
  const f = await fixture(); let c, restarted;
  try {
    c = await client(f.origin);
    const listed = await c.listTools(); assert.equal(listed.tools.length, 6);
    assert(!listed.tools.some(tool => /approve|grant|refund/.test(tool.name)));
    const offer = await c.callTool({ name: 'offer_get', arguments: { productId: 'paid' } });
    assert.equal(offer.structuredContent.amount.minor, '99000');
    const order = await c.callTool({ name: 'order_create', arguments: { quoteId: 'quote', requestKey: 'order-one' } });
    assert.equal(order.structuredContent.orderId, 'order-one');
    const replay = await rpc(f.origin, 'message/send', message('order_create', { quoteId: 'quote', requestKey: 'order-one' }));
    assert.equal(replay.body.result.id, 'order-one'); assert.equal(f.orders.size, 1);
    const execution = await rpc(f.origin, 'message/send', message('payment_execute', { orderId: 'order-one' }));
    assert.equal(execution.body.result.status.state, 'input-required');
    assert.equal(execution.body.result.artifacts[0].parts[0].data.nextAction.kind, 'human_approval');
    await c.close(); c = null;
    await close(f.gateway);
    restarted = createGateway(f.options); const origin = await listen(restarted);
    const recovered = await rpc(origin, 'tasks/get', { id: 'order-one' });
    assert.equal(recovered.body.result.id, 'order-one');
    assert.equal(recovered.body.result.status.state, 'input-required');
    const cancellation = await rpc(origin, 'tasks/cancel', { id: 'order-one' });
    assert.equal(cancellation.body.error.code, -32002);
    assert.equal(f.orders.get('order-one').paymentStatus, 'prepared');
    assert(f.calls.every(call => call.headers['x-agent-gateway-key'] === secret));
    assert(f.calls.every(call => /^[a-f0-9]{64}$/.test(call.headers['x-agent-client-key'])));
  } finally {
    if (c) await c.close(); if (restarted) await close(restarted);
    if (f.gateway.listening) await close(f.gateway); await close(f.backend);
  }
});

test('gateway service identity never replaces buyer grant and backend error details stay private', async () => {
  const f = await fixture(); let anonymous, revoked;
  try {
    anonymous = await client(f.origin, null);
    const denied = await anonymous.callTool({ name: 'payment_execute', arguments: { orderId: 'foreign' } });
    assert.equal(denied.isError, true); assert.match(denied.content[0].text, /BUYER_GRANT_REQUIRED/);
    assert.equal(f.calls.length, 0);
    revoked = await client(f.origin, 'revoked-'.padEnd(43, 'x'));
    const refused = await revoked.callTool({ name: 'order_get', arguments: { orderId: 'foreign' } });
    assert.equal(refused.isError, true); assert.equal(refused.content[0].text, 'GRANT_REVOKED');
    assert(!JSON.stringify(refused).includes('private provider'));
    const forged = await anonymous.callTool({ name: 'order_create', arguments: { quoteId: 'q', requestKey: 'k', approved: true } });
    assert.equal(forged.isError, true);
    const link = await anonymous.callTool({ name: 'buyer_link_start', arguments: { displayName: 'My agent', audience: 'proofwall-agent-api' } });
    assert.equal(link.structuredContent.pairingId, 'pairing'); assert(!Object.hasOwn(link.structuredContent, 'token'));
  } finally { if (anonymous) await anonymous.close(); if (revoked) await revoked.close(); await f.close(); }
});

test('origin, body and protocol validation reject requests without backend side effects', async () => {
  const f = await fixture();
  try {
    const denied = await fetch(`${f.origin}/mcp`, { method: 'POST', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403);
    const large = await fetch(`${f.origin}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(17000) }) });
    assert.equal(large.status, 413);
    const noStream = await fetch(`${f.origin}/mcp`); assert.equal(noStream.status, 405);
    const invalid = await rpc(f.origin, 'message/send', { message: { kind: 'message', role: 'user', messageId: 'x', parts: [{ kind: 'text', text: 'pay anything' }] } });
    assert(invalid.body.error);
    const notification = await fetch(`${f.origin}/a2a`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'message/send', params: message('payment_execute', { orderId: 'x' }) }) });
    assert.equal(notification.status, 400);
    assert.equal(f.calls.length, 0);
    const card = await (await fetch(`${f.origin}/.well-known/agent-card.json`)).json();
    assert.equal(card.protocolVersion, '0.3.0'); assert.equal(card.capabilities.streaming, false);
  } finally { await f.close(); }
});
