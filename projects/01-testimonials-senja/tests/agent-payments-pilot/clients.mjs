import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import assert from 'node:assert/strict';
export function clients(source, state) {
  const require = createRequire(join(source, 'services/agent-api/package.json'));
  const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  async function mcp(token, action) {
    const client = new Client({ name: 'public-pilot-acceptance', version: '1.0.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(state.gatewayOrigin + '/mcp'), {
        requestInit: { headers: token ? { authorization: `Bearer ${token}` } : {} },
      })); return await action(client);
    } finally { await client.close(); }
  }
  async function tool(name, args, token = state.token) {
    return mcp(token, async c => { const result = await c.callTool({ name, arguments: args });
      assert.ok(!result.isError, `${name} rejected: ${result.structuredContent?.error?.code || 'safe command failure'}`); return result.structuredContent; });
  }
  async function a2a(method, params, token = state.token) {
    const response = await fetch(state.gatewayOrigin + '/a2a', { method: 'POST', headers: { 'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 'pilot', method, params }), signal: AbortSignal.timeout(45000) });
    return { status: response.status, body: await response.json() };
  }
  return { mcp, tool, a2a };
}
export async function actualMailLink(state) {
  assert.match(state.email, /^delivered\+[a-z0-9-]+@resend\.dev$/);
  const file = process.env.PILOT_MAIL_ENV; assert.ok(file, 'Coordinator must provide private Resend read credentials');
  const env = Object.fromEntries((await readFile(file, 'utf8')).split('\n').filter(x => x.includes('=')).map(x => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)]));
  assert.ok(env.RESEND_API_KEY);
  async function get(path) {
    const response = await fetch('https://api.resend.com' + path, { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, `Resend read unavailable (${response.status})`); return response.json();
  }
  for (let n = 0; n < 15; n++) {
    const list = await get('/emails?limit=100');
    const own = list.data?.find(x => x.to?.length === 1 && x.to[0] === state.email);
    if (own) {
      const email = await get('/emails/' + encodeURIComponent(own.id)); assert.deepEqual(email.to, [state.email]);
      const link = email.text?.match(/https:\/\/[^\s]+\/agent-payments#[A-Za-z0-9_-]+/)?.[0];
      assert.ok(link, 'Own actual sent email contains verification fragment'); assert.equal(new URL(link).origin, state.webOrigin);
      state.mailEvidence = { id: own.id, lastEvent: email.last_event || own.last_event }; return link;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw Error('Own actual sent test email not found');
}
