// Host orchestration only: root provisions containers, private mounts and trusted Firefox profile.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { connect, createServer as tcpServer } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startProvider } from '../tests/helpers/proofwall-bridge/provider.mjs';
import { P1, N3, PAY, socket, socketFetch, required, json, readJson, closeServer } from '../tests/helpers/proofwall-bridge/tls.mjs';

const evidence = resolve(process.env.BRIDGE_EVIDENCE_DIR || '.runtime/proofwall-e2e');
const proxyPort = Number(process.env.BRIDGE_BROWSER_PROXY_PORT || 19143);
const controlPort = Number(process.env.BRIDGE_CONTROL_PORT || 19144);
const driverPort = Number(process.env.BRIDGE_DRIVER_PORT || 4573);
const driverUrl = `http://127.0.0.1:${driverPort}`, controlUrl = `http://127.0.0.1:${controlPort}`;
const token = randomBytes(32).toString('base64url'), servers = [], tunnels = new Set();
let driver, browser, sessionId, provider, driverOutput = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function free(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid isolated port');
  const server = tcpServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await closeServer(server);
}
async function ready(check, label, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { if (await check()) return; } catch { /* Wait for root-provisioned runtime. */ } await pause(250); }
  throw new Error(`Isolated readiness timed out: ${label}`);
}
try {
  await mkdir(evidence, { recursive: true, mode: 0o700 });
  for (const port of [proxyPort, controlPort, driverPort]) await free(port);
  const bootstrap = JSON.parse(await readFile(required('BRIDGE_BOOTSTRAP_FILE'), 'utf8'));
  const { connectorKey: _connectorKey, ...context } = bootstrap;
  const ca = await readFile(required('BRIDGE_CA'));
  const routed = (origin, path, allow = () => true) => socketFetch({ ca, routes: new Map([[origin, { socket: path, allow }]]) });
  const webhookFetch = routed(P1, socket('p1-webhook'), path => path === '/api/webhooks/payment');
  const n3Control = routed(N3, socket('n3-control'), path => ['/state', '/pause', '/resume'].includes(path));
  const p1Fetch = routed(P1, socket('p1'));
  const n3Fetch = routed(N3, socket('n3'));
  provider = await startProvider({ webhookFetch }); servers.push(provider.server);
  const control = createServer(async (req, res) => {
    if (req.headers.origin || req.headers.authorization !== `Bearer ${token}`) return json(res, { error: 'Control refused' }, 403);
    try {
      const url = new URL(req.url, controlUrl);
      if (req.method === 'GET' && url.pathname === '/context') return json(res, context);
      if (req.method === 'GET' && url.pathname === '/provider') return json(res, provider.state());
      if (req.method === 'GET' && url.pathname === '/mail') return json(res, { link: provider.mailLink(url.searchParams.get('email')) });
      if (req.method === 'GET' && url.pathname === '/n3') {
        const response = await n3Control(`${N3}/state${url.search}`, { signal: AbortSignal.timeout(10000) });
        return json(res, await response.json(), response.status);
      }
      if (req.method === 'POST' && ['/pause', '/resume'].includes(url.pathname)) {
        const response = await n3Control(N3 + url.pathname, { method: 'POST', signal: AbortSignal.timeout(10000) });
        return json(res, await response.json(), response.status);
      }
      if (req.method === 'POST' && ['/replay', '/refund', '/replay-refund'].includes(url.pathname)) {
        const input = await readJson(req);
        const result = url.pathname === '/refund' ? await provider.refund(input.paymentId, input.amountMinor)
          : url.pathname === '/replay' ? await provider.replay(input.paymentId) : await provider.replayRefund(input.refundId);
        return json(res, result);
      }
      json(res, { error: 'Control route refused' }, 404);
    } catch { json(res, { error: 'Control operation failed' }, 503); }
  });
  await new Promise(resolve => control.listen(controlPort, '127.0.0.1', resolve)); servers.push(control);
  const targets = new Map([[`${new URL(P1).host}:443`, socket('p1')], [`${new URL(N3).host}:443`, socket('n3')], [`${new URL(PAY).host}:443`, socket('providers')]]);
  const proxy = createServer((req, res) => { res.writeHead(403); res.end(); });
  proxy.on('connect', (req, client, head) => {
    const path = targets.get(req.url); if (!path) return client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    const upstream = connect(path, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head); client.pipe(upstream); upstream.pipe(client);
    });
    for (const stream of [client, upstream]) { tunnels.add(stream); stream.on('close', () => tunnels.delete(stream)); }
    upstream.on('error', () => client.destroy()); client.on('error', () => upstream.destroy()); client.on('close', () => upstream.destroy());
  });
  await new Promise(resolve => proxy.listen(proxyPort, '127.0.0.1', resolve)); servers.push(proxy);
  await writeFile(`${evidence}/runner-ready.json`, JSON.stringify({ at: new Date().toISOString(), proxyPort, controlPort }), { mode: 0o600 });
  process.stdout.write('BRIDGE_EXTERNAL_FIXTURES_READY\n');
  await ready(async () => (await n3Fetch(`${N3}/health`, { signal: AbortSignal.timeout(2000) })).ok, 'N3');
  await ready(async () => (await p1Fetch(P1, { signal: AbortSignal.timeout(2000) })).ok, 'P1 Next');
  driver = spawn('geckodriver', ['--port', String(driverPort), '--host', '127.0.0.1', '--profile-root', required('BRIDGE_FIREFOX_PROFILE_ROOT')], { stdio: ['ignore', 'pipe', 'pipe'] });
  driver.on('error', () => { driverOutput += 'WebDriver process failed to start\n'; });
  for (const stream of [driver.stdout, driver.stderr]) stream.on('data', chunk => { driverOutput += chunk; });
  await ready(async () => (await fetch(`${driverUrl}/status`)).ok, 'WebDriver', 20000);
  const response = await fetch(`${driverUrl}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ capabilities: { alwaysMatch: {
    browserName: 'firefox', acceptInsecureCerts: false,
    proxy: { proxyType: 'manual', httpProxy: `127.0.0.1:${proxyPort}`, sslProxy: `127.0.0.1:${proxyPort}`, noProxy: [] },
    'moz:firefoxOptions': { args: ['-headless', '-profile', required('BRIDGE_FIREFOX_PROFILE')], prefs: {
      'network.proxy.allow_hijacking_localhost': true, 'network.proxy.no_proxies_on': '', 'network.captive-portal-service.enabled': false,
      'network.connectivity-service.enabled': false, 'network.trr.mode': 5, 'browser.safebrowsing.downloads.enabled': false } },
  } } }) });
  const session = await response.json(); if (!response.ok) throw new Error('WebDriver session creation failed');
  sessionId = session.value.sessionId;
  const sessionFile = `${evidence}/webdriver-session.json`;
  await writeFile(sessionFile, JSON.stringify(session), { mode: 0o600 });
  browser = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/e2e/proofwall-bridge.mjs'], { env: { ...process.env,
    N3_WEBDRIVER_URL: driverUrl, N3_WEBDRIVER_SESSION: sessionFile, BRIDGE_CONTROL_URL: controlUrl,
    BRIDGE_CONTROL_TOKEN: token, BRIDGE_EVIDENCE_DIR: evidence }, stdio: ['ignore', 'pipe', 'pipe'] });
  let tap = '';
  for (const stream of [browser.stdout, browser.stderr]) stream.on('data', chunk => { tap += chunk; process.stdout.write(chunk); });
  const code = await new Promise((resolve, reject) => { browser.once('error', reject); browser.once('close', resolve); });
  await writeFile(`${evidence}/browser.tap`, tap); process.exitCode = Number.isInteger(code) ? code : 1;
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  browser?.kill('SIGTERM');
  if (sessionId) { try { await fetch(`${driverUrl}/session/${sessionId}`, { method: 'DELETE', signal: AbortSignal.timeout(10000) }); } catch {} }
  driver?.kill('SIGTERM');
  for (const stream of tunnels) stream.destroy();
  await Promise.all(servers.map(closeServer)); provider?.clear();
  await writeFile(`${evidence}/driver.log`, driverOutput, { mode: 0o600 });
}
