// Root runs with the host's isolated BRIDGE_CA / BRIDGE_TLS_KEY / BRIDGE_TLS_CERT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROVIDER, required, tlsConfig, socketFetch, closeServer } from './tls.mjs';

test('TLS socket adapter preserves verified streaming HTTPS, rejects unknown routes/names and propagates cancellation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'n3-tls-')), path = join(directory, 'https.sock');
  let calls = 0, aborted = false;
  const server = createServer(await tlsConfig(), async (req, res) => {
    calls++;
    if (req.url === '/redirect') { res.writeHead(302, { location: `${PROVIDER}/json` }); return res.end(); }
    if (req.url === '/slow') {
      res.writeHead(200, { 'content-type': 'application/json' }); res.write('{');
      const timer = setInterval(() => res.write(' '), 10);
      res.on('close', () => { aborted = true; clearInterval(timer); }); return;
    }
    if (req.url === '/large') { res.writeHead(200); res.end(Buffer.alloc(1100000, 65)); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, host: req.headers.host, authorization: req.headers.authorization,
      role: req.headers['x-bridge-test-client'], body: Buffer.concat(chunks).toString('utf8') }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
  t.after(async () => { await closeServer(server); await rm(directory, { recursive: true, force: true }); });
  const ca = await readFile(required('BRIDGE_CA'));
  const fetch = socketFetch({ ca, role: 'p1', routes: new Map([[PROVIDER, { socket: path, allow: route => ['/json', '/slow', '/large', '/redirect'].includes(route) }]]) });
  const response = await fetch(`${PROVIDER}/json`, { method: 'POST', headers: { authorization: 'Bearer synthetic' }, body: '{"value":1}' });
  assert.equal(response.url, `${PROVIDER}/json`);
  assert.deepEqual(await response.json(), { method: 'POST', host: new URL(PROVIDER).host, authorization: 'Bearer synthetic', role: 'p1', body: '{"value":1}' });
  const before = calls;
  await assert.rejects(fetch('https://not-allowed.example/json'), /unlisted endpoint/);
  await assert.rejects(fetch(`${PROVIDER}/not-allowed`), /unlisted endpoint/);
  assert.equal(calls, before, 'Rejected requests never reach a socket');
  const wrong = socketFetch({ ca, routes: new Map([['https://wrong.example', { socket: path, allow: () => true }]]) });
  await assert.rejects(wrong('https://wrong.example/json'), error => error.code === 'ERR_TLS_CERT_ALTNAME_INVALID');
  await assert.rejects(fetch(`${PROVIDER}/redirect`, { redirect: 'error' }), /refused redirect/);
  const controller = new AbortController();
  const slow = await fetch(`${PROVIDER}/slow`, { signal: controller.signal });
  const pending = slow.text(); controller.abort(); await assert.rejects(pending);
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(aborted, true);
  const large = await fetch(`${PROVIDER}/large`); const reader = large.body.getReader(); let bytes = 0;
  for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; }
  assert.equal(bytes, 1100000, 'Adapter preserves bytes for the product body-limit guard');
});
