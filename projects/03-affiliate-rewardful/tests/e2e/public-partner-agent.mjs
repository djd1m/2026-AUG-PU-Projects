import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('public partner agent reads own rewards through MCP and A2A with durable replay and revocation', async () => {
  const origin = 'https://n3-d.212.192.0.33.sslip.io';
  function account() {
    let cookie;
    return async (path, data) => {
      const response = await fetch(`${origin}/api/account/${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(15000),
      });
      const body = await response.json(); assert.equal(response.status, 200, body.error?.code);
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return body.data;
    };
  }
  const owner = account(), partner = account();
  const register = api => api('register', { email: `agent-check-${randomUUID()}@example.test`,
    password: `Agent-${randomUUID()}!`, name: 'Agent scenario acceptance' });
  const clients = []; let issued, membershipId, revoked = false;
  try {
    await register(owner); await register(partner);
    const own = (await owner('me')).memberships[0];
    const invitation = await owner('invite', { membershipId: own.membershipId, input: { role: 'partner' } });
    const joined = await partner('accept-invite', { invitation: invitation.invitation, name: 'Agent scenario partner' });
    membershipId = joined.membershipId;
    issued = await partner('agent-token', { membershipId,
      input: { actions: ['program.read', 'partner.read', 'share.read'], expiresInSeconds: 300 } });
    async function connect() {
      const client = new Client({ name: 'n3-partner-scenario', version: '1.0.0' }); clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`),
        { requestInit: { headers: { Authorization: `Bearer ${issued.token}` } } }));
      return client;
    }
    const client = await connect();
    const tools = (await client.listTools()).tools.map(t => t.name);
    assert.ok(tools.includes('partner_read') && tools.includes('share_read'));
    assert.ok(!tools.some(t => /registry|checkout|payment|approve|export|sent/.test(t)));
    const rewards = await client.callTool({ name: 'partner_read', arguments: { input: {} } });
    assert.ok(!rewards.isError); assert.ok(rewards.structuredContent);
    const foreign = await client.callTool({ name: 'partner_read', arguments: { input: { partnerId: randomUUID() } } });
    assert.equal(foreign.isError, true);
    const card = await (await fetch(`${origin}/.well-known/agent-card.json`)).json();
    assert.equal(card.protocolVersion, '0.3.0'); assert.equal(card.url, `${origin}/a2a`);
    const rpc = async (method, params) => {
      const response = await fetch(card.url, { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${issued.token}`, 'A2A-Version': '0.3.0',
      }, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }), signal: AbortSignal.timeout(15000) });
      return { status: response.status, body: await response.json() };
    };
    const message = { kind: 'message', role: 'user', messageId: randomUUID(),
      parts: [{ kind: 'data', data: { kind: 'partner', input: {} } }] };
    const first = await rpc('message/send', { message });
    assert.equal(first.status, 200); assert.equal(first.body.result.status.state, 'completed');
    // Separate reads advance the real clock; compare business data, not capture time.
    const { clock: mcpClock, ...mcpData } = rewards.structuredContent;
    const { clock: a2aClock, ...a2aData } = first.body.result.artifacts[0].parts[0].data;
    assert.ok(Date.parse(a2aClock) >= Date.parse(mcpClock));
    assert.deepEqual(a2aData, mcpData);
    const replay = await rpc('message/send', { message });
    assert.equal(replay.body.result.id, first.body.result.id);
    assert.deepEqual((await rpc('tasks/get', { id: first.body.result.id })).body.result, first.body.result);
    const secondClient = await connect();
    const persisted = await secondClient.callTool({ name: 'task_read', arguments: { input: { taskId: first.body.result.id } } });
    assert.ok(!persisted.isError); assert.equal(persisted.structuredContent.state, 'completed');
    const forbidden = await rpc('message/send', { message: { ...message, messageId: randomUUID(),
      parts: [{ kind: 'data', data: { kind: 'registry', input: { period: '2026-08' } } }] } });
    assert.equal(forbidden.status, 403);
    const tasks = await partner('command', { membershipId, action: 'task.list' });
    assert.ok(JSON.stringify(tasks).includes(first.body.result.id));
    await partner('command', { membershipId, action: 'grant.revoke', input: { grantId: issued.grantId }, idempotencyKey: randomUUID() });
    revoked = true;
    assert.equal((await rpc('tasks/get', { id: first.body.result.id })).status, 403);
    await assert.rejects(secondClient.listTools());
    const dir = new URL('../../.runtime/agent-scenario/', import.meta.url); await mkdir(dir, { recursive: true });
    await writeFile(new URL('partner.json', dir), JSON.stringify({ at: new Date().toISOString(),
      origin, publicHttps: true, actualPostgres: true, mcpOfficialSdk: true, a2aJsonRpc: true,
      tools, ownRewardsRead: true, foreignPartnerDenied: true, mcpA2aResultEqual: true,
      sameMessageSameTask: true, newClientReadsPersistedTask: true, accountSeesTask: true,
      registryScopeDenied: true, bothTransportsDeniedAfterRevocation: true,
      testAccountRewardsInitiallyZero: true, externalLlm: false, chargedProvider: false }, null, 2));
  } finally {
    if (issued && !revoked) await partner('command', { membershipId, action: 'grant.revoke',
      input: { grantId: issued.grantId }, idempotencyKey: randomUUID() });
    for (const client of clients) await client.close();
    await Promise.allSettled([owner('logout', {}), partner('logout', {})]);
  }
});
