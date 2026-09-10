import { createServer } from 'node:http';
import { connect } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, chmod, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { ORIGIN, PAY, socket, localFetch } from './network.mjs';
import { startProvider } from './provider.mjs';
import { browser } from './browser.mjs';
import { scenario } from './scenario.mjs';
const tests = dirname(fileURLToPath(import.meta.url)), evidence = join(tests, 'evidence');
const source = process.env.AGENT_E2E_MAIN_SOURCE;
assert.ok(source && process.env.AGENT_E2E_BUILD_READY === 'true', 'Root must declare final candidate build READY and supply MAIN P1 source');
const runtime = await mkdtemp('/tmp/ap-e2e-'); process.env.AGENT_E2E_RUNTIME = runtime;
const name = 'agent-payments-e2e-' + randomBytes(4).toString('hex');
const secret = randomBytes(32).toString('base64url'), shop = 'agent-e2e-shop', key = 'test_' + randomBytes(24).toString('hex'), mailKey = randomBytes(24).toString('hex');
const inputFiles = ['apps/web/src/lib/agent-payments/runtime.ts', 'apps/web/src/lib/agent-payments/host.ts', 'apps/web/src/lib/agent-payments/identity.ts',
  'apps/web/src/lib/agent-payments/legacy.ts', 'apps/web/src/lib/agent-payments/notification.ts', 'apps/web/src/app/agent-payments/page.tsx',
  'apps/web/src/app/api/agent-payments/human/route.ts', 'apps/web/src/app/api/agent-payments/commands/route.ts',
  'services/agent-api/src/server.mjs', 'services/agent-api/src/protocols.mjs', 'services/agent-api/src/backend.mjs'];
for (const directory of ['packages/agent-payments/src', 'apps/web/src/lib/agent-payments', 'services/agent-api/src']) {
  for (const file of await readdir(join(source, directory))) if (/\.(ts|mjs)$/.test(file) && !inputFiles.includes(directory + '/' + file)) inputFiles.push(directory + '/' + file);
}
for (const file of ['.next/server/app/agent-payments/page.js', '.next/server/app/api/agent-payments/human/route.js', '.next/server/app/api/agent-payments/commands/route.js', '.next/server/app/api/agent-payments/webhook/route.js']) inputFiles.push('apps/web/' + file);
const candidateRevision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).stdout.trim();
const hashes = {};
for (const file of inputFiles) hashes[file] = createHash('sha256').update(await readFile(join(source, file))).digest('hex');
const buildId = (await readFile(join(source, 'apps/web/.next/BUILD_ID'), 'utf8')).trim();
const privateEnv = join(runtime, 'fixture.env');
await writeFile(privateEnv, Object.entries({ AGENT_PAYMENTS_ENABLED: 'true', AGENT_PAYMENTS_AUDIENCE: 'proofwall-agent-api', AGENT_GATEWAY_SECRET: secret,
  AGENT_YOOKASSA_TEST_SHOP_ID: shop, AGENT_YOOKASSA_TEST_SECRET_KEY: key, RESEND_API_KEY: mailKey, MAIL_FROM: 'Fixture <fixture@example.test>',
  BASE_URL: ORIGIN, NEXT_PUBLIC_BASE_URL: ORIGIN, AGENT_E2E_ISOLATED: 'true', AGENT_E2E_SOURCE: '/source', AGENT_E2E_RUNTIME: '/runtime',
  NODE_OPTIONS: '--import=/e2e/preload.mjs', NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', PAYMENTS_STUB: 'false',
}).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
const cert = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', join(runtime, 'fixture.key'), '-out', join(runtime, 'fixture.crt'),
  '-subj', '/CN=agent-proofwall.test', '-addext', 'subjectAltName=DNS:agent-proofwall.test,DNS:yoomoney.ru,DNS:api.yookassa.ru,DNS:api.resend.com'], { stdio: 'ignore' });
assert.equal(cert.status, 0); await chmod(join(runtime, 'fixture.key'), 0o600);
const ca = await readFile(join(runtime, 'fixture.crt'));
const webFetch = localFetch(new Map([[ORIGIN, { socket: socket('web'), allow: () => true }]]), ca);
const webhookFetch = localFetch(new Map([[ORIGIN, { socket: socket('webhook'), allow: p => p === '/api/agent-payments/webhook' }]]), ca);
const provider = await startProvider({ shop, key, mailKey, notify: async payment => {
  const response = await webhookFetch(ORIGIN + '/api/agent-payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: payment.id } }) });
  const result = await response.json(); assert.ok(response.ok, `Verified fixture notification rejected: ${JSON.stringify(result)}`); return result;
} });
const proxy = createServer((req, res) => { res.writeHead(403); res.end('HTTPS fixture origins only'); });
proxy.on('connect', (req, client, head) => {
  const target = new Map([['agent-proofwall.test:443', socket('web')], ['yoomoney.ru:443', socket('provider')]]).get(req.url);
  if (!target) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const remote = connect(target, () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) remote.write(head); remote.pipe(client); client.pipe(remote); });
  remote.on('error', () => client.destroy()); client.on('error', () => remote.destroy());
});
await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
const redact = value => String(value).replace(/[A-Za-z0-9_+\/=-]{43,}/g, '[redacted]');
let child, browserSession, gateway;
const started = new Date().toISOString(), logs = [];
const require = createRequire(join(source, 'services/agent-api/package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createGateway } = await import(pathToFileURL(join(source, 'services/agent-api/src/server.mjs')));
let gatewayOrigin;
async function startGateway() {
  gateway = createGateway({ publicOrigin: 'http://127.0.0.1', backendUrl: ORIGIN + '/api/agent-payments/commands', gatewaySecret: secret, fetchImpl: webFetch });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve)); gatewayOrigin = `http://127.0.0.1:${gateway.address().port}`;
}
async function closeServer(server) { if (!server?.listening) return; server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
async function mcp(token) {
  const client = new Client({ name: 'proofwall-integrated-acceptance', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(gatewayOrigin + '/mcp'), { requestInit: { headers: token ? { authorization: `Bearer ${token}` } : {} } })); return client;
}
async function a2a(token, method, params) {
  const response = await fetch(gatewayOrigin + '/a2a', { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'acceptance', method, params }) }); return { status: response.status, body: await response.json() };
}
async function db(sql, params = []) {
  const result = spawnSync('docker', ['exec', name, 'node', '/e2e/db.mjs', JSON.stringify({ sql, params })], { encoding: 'utf8' });
  assert.equal(result.status, 0, `Fixture database command failed: ${result.stderr.slice(0, 400)}`); return JSON.parse(result.stdout);
}
try {
  // No host ports: only the pre-existing dedicated database network and mounted Unix sockets.
  child = spawn('docker', ['run', '--rm', '--name', name, '--network', 'proofwall-agent-payments-test_database',
    '--env-file', join(source, '.secrets/bridge-test.env'), '--env-file', privateEnv,
    '-v', `${source}:/source:ro`, '-v', `${tests}:/e2e:ro`, '-v', `${runtime}:/runtime`, '-w', '/source/apps/web',
    'node:22.22.0-bookworm-slim', 'node', '/e2e/runtime.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => logs.push(chunk.toString())); child.stderr.on('data', chunk => logs.push(chunk.toString()));
  let ready = false;
  for (let n = 0; n < 150; n++) {
    try { if ((await webFetch(ORIGIN + '/login')).status === 200) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw Error('Isolated Next runtime exited: ' + logs.join('').slice(-2500));
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Isolated Next runtime failed readiness'); await startGateway();
  browserSession = await browser(proxy.address().port, runtime, evidence);
  const result = await scenario({ browser: browserSession, provider, db, mcp, a2a, webFetch, evidence,
    restartGateway: async () => { await closeServer(gateway); await startGateway(); } });
  const ended = new Date().toISOString();
  await writeFile(join(evidence, 'acceptance.json'), JSON.stringify({ status: 'PASS', started_at: started, ended_at: ended,
    elapsed_ms: Date.parse(ended) - Date.parse(started), candidateRevision, buildId, sourceHashes: hashes, ...result }, null, 2) + '\n');
  console.log(`PASS integrated acceptance: ${result.records.length} scenarios; ${result.providerCreateCount} TEST fixture payments`);
} catch (error) {
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ status: 'FAIL', at: new Date().toISOString(), candidateRevision, buildId, sourceHashes: hashes, message: redact(error.message) }, null, 2) + '\n');
  if (browserSession) await browserSession.shot('failure').catch(() => {});
  console.error(redact(error.stack)); process.exitCode = 1;
} finally {
  if (browserSession) await browserSession.close().catch(() => {});
  await closeServer(gateway); await closeServer(provider.server); proxy.close();
  if (child) { spawnSync('docker', ['stop', '--time', '3', name], { stdio: 'ignore' }); child.kill('SIGTERM'); }
  // Runtime logs stay in private /tmp, where synthetic auth/config values are kept as well.
  await writeFile(join(runtime, 'runtime.log'), logs.join(''), { mode: 0o600 });
  console.log('Private test runtime artifacts: ' + runtime);
}
