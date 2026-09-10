import { spawn } from 'node:child_process';
import { createServer as tcpServer } from 'node:net';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
export async function freePort() {
  const server = tcpServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
export async function browser(proxyPort, runtime, evidence) {
  const port = await freePort();
  const profileRoot = process.env.AGENT_E2E_FIREFOX_PROFILE_ROOT || '/root/snap/firefox/common';
  const driver = spawn('geckodriver', ['--host', '127.0.0.1', '--port', String(port), '--profile-root', profileRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = []; driver.stdout.on('data', x => logs.push(String(x))); driver.stderr.on('data', x => logs.push(String(x)));
  const endpoint = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let n = 0; n < 450; n++) {
    try { if ((await fetch(endpoint + '/status')).ok) { ready = true; break; } } catch {}
    if (driver.exitCode !== null) throw Error('Private geckodriver exited: ' + logs.join('').slice(0, 500));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) { driver.kill('SIGTERM'); throw Error('Private geckodriver readiness timeout'); }
  const response = await fetch(endpoint + '/session', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: 'firefox', acceptInsecureCerts: true,
      proxy: { proxyType: 'manual', httpProxy: `127.0.0.1:${proxyPort}`, sslProxy: `127.0.0.1:${proxyPort}`, noProxy: [] },
      'moz:firefoxOptions': { args: ['-headless'], prefs: { 'network.proxy.allow_hijacking_localhost': true, 'network.proxy.no_proxies_on': '', 'network.captive-portal-service.enabled': false, 'network.connectivity-service.enabled': false, 'network.dns.disablePrefetch': true, 'network.prefetch-next': false } } } } }) });
  const session = await response.json(); assert.ok(response.ok, session.value?.message);
  const base = `${endpoint}/session/${session.value.sessionId}`;
  async function wd(path, data, method) {
    const r = await fetch(base + path, { method: method || (data === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(55000) });
    const result = await r.json(); if (!r.ok) throw Error(`Browser ${path}: ${result.value?.message}`); return result.value;
  }
  const js = (script, ...args) => wd('/execute/sync', { script, args });
  async function until(script, timeout = 30000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await js(script)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error(`Browser condition timeout: ${script}; ${(await js('return document.body.innerText')).slice(0, 500)}`);
  }
  async function locate(using, value) { const result = await wd('/element', { using, value }); return Object.values(result)[0]; }
  async function click(selector) { const id = await locate('css selector', selector); await wd(`/element/${id}/click`, {}); }
  async function button(text) { const id = await locate('xpath', `//button[contains(normalize-space(.),${JSON.stringify(text)})]`); await wd(`/element/${id}/click`, {}); }
  async function fill(selector, text) { const id = await locate('css selector', selector); await wd(`/element/${id}/clear`, {}); await wd(`/element/${id}/value`, { text }); }
  async function label(label, text) { const id = await locate('xpath', `//label[contains(normalize-space(.),${JSON.stringify(label)})]//input`); await wd(`/element/${id}/clear`, {}); await wd(`/element/${id}/value`, { text }); }
  async function checkbox(label) { const id = await locate('xpath', `//label[contains(normalize-space(.),${JSON.stringify(label)})]//input[@type='checkbox']`); await wd(`/element/${id}/click`, {}); }
  async function open(url) { await wd('/url', { url }); await until('return document.readyState === "complete"'); }
  async function shot(name) { await js('document.querySelectorAll("textarea,input[type=password]").forEach(e=>e.style.visibility="hidden")'); await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, name + '.png'), Buffer.from(await wd('/screenshot'), 'base64')); }
  await wd('/window/rect', { width: 1440, height: 1100 });
  await wd('/timeouts', { pageLoad: 45000, script: 30000 });
  return { wd, js, until, click, button, fill, label, checkbox, open, shot,
    async close() { try { await wd('', undefined, 'DELETE'); } finally { driver.kill('SIGTERM'); } },
  };
}
