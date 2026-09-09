import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createResend } from '../shared/identity/providers/resend.mjs';
import { createYandex } from '../shared/identity/providers/yandex.mjs';

const mailConfig = { enabled: true, apiKey: 're_test-secret', from: 'Круг <access@example.test>' };
const yandexConfig = { enabled: true, clientId: 'test-client', clientSecret: 'client-secret' };
const message = { to: 'person@example.test', subject: 'Доступ', text: 'Ссылка', html: '<p>Ссылка</p>' };
const proof = { code: 'provider-code', state: 's'.repeat(43), verifier: 'v'.repeat(43), redirectUri: 'https://n3-a.example.test/api/account/yandex/callback' };
const user = { id: '1000034426', default_email: 'Person@Example.Test' };
const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const mail = fetchImpl => createResend({ config: mailConfig, fetchImpl });
const yandex = fetchImpl => createYandex({ config: yandexConfig, fetchImpl });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const unavailable = code => error => {
  assert.equal(error.code, code); assert.equal(error.status, 503);
  assert.equal(error.cause, undefined);
  assert.doesNotMatch(JSON.stringify(error) + error.stack, /test-secret|client-secret|provider-code|transient-token|person@example/);
  return true;
};

test('provider disabled and invalid configuration are explicit and perform no IO', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('unexpected IO'); };
  for (const config of [undefined, {}, { enabled: false }]) {
    const m = createResend({ config, fetchImpl }), y = createYandex({ config, fetchImpl });
    assert.equal(m.configured, false); assert.equal(y.configured, false);
    await assert.rejects(m.send(message), unavailable('MAIL_UNCONFIGURED'));
    assert.throws(() => y.authorizationUrl(proof), unavailable('YANDEX_UNCONFIGURED'));
    await assert.rejects(y.profile(proof), unavailable('YANDEX_UNCONFIGURED'));
  }
  for (const config of [null, [], { enabled: 'true' }, { enabled: true }, { ...mailConfig, apiKey: 'secret\n' },
    { ...mailConfig, from: 'a@example.test\r\nBcc: b@example.test' }, { ...mailConfig, endpoint: 'https://evil.test' }]) {
    assert.throws(() => createResend({ config }), unavailable('MAIL_CONFIG_INVALID'));
  }
  for (const config of [{ enabled: true }, { ...yandexConfig, clientSecret: 'secret\r\n' }, { ...yandexConfig, clientId: '' }]) {
    assert.throws(() => createYandex({ config }), unavailable('YANDEX_CONFIG_INVALID'));
  }
  assert.equal(calls, 0);
});

test('Resend adapts donor HTTP contract, snapshots config, and returns no provider credentials', async () => {
  const config = { ...mailConfig };
  const client = createResend({ config, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, { authorization: 'Bearer re_test-secret', 'content-type': 'application/json' });
    assert.deepEqual(JSON.parse(options.body), { from: mailConfig.from, to: [message.to], subject: message.subject, text: message.text, html: message.html });
    assert.equal(options.signal.aborted, false);
    return json({ id: 'email-id', secret: 'transient-token' });
  } });
  config.apiKey = 'changed'; config.from = 'changed@example.test';
  assert.equal(client.configured, true);
  assert.equal(await client.send(message), undefined);
  assert.deepEqual(Object.keys(client), ['configured', 'send']);
});

test('Yandex authorize uses S256 and exchange preserves verifier and exact redirect URI', async () => {
  const requests = [];
  const client = yandex(async (url, options) => {
    requests.push({ url, options });
    return url.endsWith('/token') ? json({ access_token: 'transient-token', refresh_token: 'never-return' }) : json(user);
  });
  // RFC7636 known vector, independent of the implementation's hash calculation.
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const url = new URL(client.authorizationUrl({ ...proof, verifier }));
  assert.equal(url.origin + url.pathname, 'https://oauth.yandex.ru/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), yandexConfig.clientId);
  assert.equal(url.searchParams.get('redirect_uri'), proof.redirectUri);
  assert.equal(url.searchParams.get('state'), proof.state);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(url.searchParams.has('code_verifier'), false);
  assert.deepEqual(await client.profile(proof), { externalId: user.id, email: 'person@example.test' });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://oauth.yandex.ru/token');
  assert.deepEqual(Object.fromEntries(requests[0].options.body), { grant_type: 'authorization_code', code: proof.code,
    client_id: yandexConfig.clientId, client_secret: yandexConfig.clientSecret, code_verifier: proof.verifier, redirect_uri: proof.redirectUri });
  assert.equal(requests[0].options.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(requests[1].url, 'https://login.yandex.ru/info?format=json');
  assert.deepEqual(requests[1].options.headers, { authorization: 'OAuth transient-token' });
  assert.equal(requests[1].options.body, undefined);
  assert.equal(requests[0].options.signal, requests[1].options.signal);
  for (const { url: target, options } of requests) {
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
    assert.doesNotMatch(target, /secret|token=/);
  }
});

test('invalid state, verifier, callback, code and email never reach provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(user); };
  const client = yandex(fetchImpl);
  for (const patch of [{ state: '' }, { state: 's'.repeat(1025) }, { state: 'x\n'.repeat(22) }, { verifier: 'short' },
    { verifier: 'x'.repeat(129) }, { redirectUri: 'http://n3-a.example.test/api/account/yandex/callback' },
    { redirectUri: 'https://user:pass@n3-a.example.test/api/account/yandex/callback' }, { redirectUri: proof.redirectUri + '?next=evil' },
    { redirectUri: proof.redirectUri + '#fragment' }, { redirectUri: 'https://n3-a.example.test/wrong' },
    { redirectUri: 'https://n3-a.example.test/api/../api/account/yandex/callback' }]) {
    assert.throws(() => client.authorizationUrl({ ...proof, ...patch }), { code: 'YANDEX_INPUT_INVALID' });
  }
  for (const patch of [{ code: '' }, { code: 'x'.repeat(2049) }, { code: 'secret\r\n' }, { verifier: '' }, { redirectUri: '//evil.test' }]) {
    await assert.rejects(client.profile({ ...proof, ...patch }), { code: 'YANDEX_INPUT_INVALID' });
  }
  for (const patch of [{ to: 'a@example.test\n' }, { to: 'bad' }, { subject: 'Bcc:\r\na@example.test' },
    { html: 'я'.repeat(32769) }, { text: '' }]) await assert.rejects(mail(fetchImpl).send({ ...message, ...patch }), { code: 'MAIL_INPUT_INVALID' });
  assert.equal(calls, 0);
});

test('provider responses reject malformed JSON, absent identity/email/token and header injection', async () => {
  for (const data of [null, [], {}, { id: user.id }, { ...user, id: '' }, { ...user, id: 123 },
    { ...user, default_email: 'bad' }, { ...user, default_email: 'x@example.test\n' }]) {
    await assert.rejects(yandex(async url => url.endsWith('/token') ? json({ access_token: 'transient-token' }) : json(data)).profile(proof), unavailable('YANDEX_UNAVAILABLE'));
  }
  for (const data of [null, [], {}, { access_token: 12 }, { access_token: 'x\r\nsecret' }, { access_token: 'x'.repeat(8193) }]) {
    let calls = 0;
    await assert.rejects(yandex(async () => { calls++; return json(data); }).profile(proof), unavailable('YANDEX_UNAVAILABLE'));
    assert.equal(calls, 1);
  }
  for (const response of [new Response('{"secret":"transient-token"', { headers: { 'content-type': 'application/json' } }),
    new Response('transient-token', { status: 500 }), new Response('{}', { headers: { 'content-type': 'text/html' } }), json({})]) {
    await assert.rejects(mail(async () => response).send(message), unavailable('MAIL_UNAVAILABLE'));
  }
  await assert.rejects(mail(async () => { throw new Error('re_test-secret person@example.test', { cause: 'transient-token' }); }).send(message), unavailable('MAIL_UNAVAILABLE'));
});

test('64 KiB streamed bytes are accepted exactly and oversize/lying lengths cancel without unbounded JSON reads', async () => {
  const exact = '{"id":"ok","padding":"' + 'x'.repeat(65536 - 24) + '"}';
  assert.equal(Buffer.byteLength(exact), 65536);
  await mail(async () => new Response(exact, { headers: { 'content-type': 'application/json' } })).send(message);
  for (const headers of [{}, { 'content-length': '1' }, { 'content-length': '65537' }, { 'content-length': 'invalid' }]) {
    let cancelled = false;
    const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(40000)); c.enqueue(new Uint8Array(40000)); }, cancel() { cancelled = true; } });
    const response = new Response(body, { headers: { 'content-type': 'application/json', ...headers } });
    response.json = () => { throw new Error('unbounded json forbidden'); };
    await assert.rejects(mail(async () => response).send(message), unavailable('MAIL_UNAVAILABLE'));
    assert.equal(cancelled, true);
  }
});

test('Yandex eight-second deadline covers token body plus profile body and frees admission', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const tokenReady = deferred(), profileReady = deferred();
  let tokenStream, profileStream, cancelled = false, requests = 0, signal;
  const client = yandex(async (url, options) => {
    requests++; signal = options.signal;
    return new Response(new ReadableStream({ start(c) {
      if (url.endsWith('/token')) { tokenStream = c; tokenReady.resolve(); }
      else { profileStream = c; profileReady.resolve(); }
    }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } });
  });
  const pending = client.profile(proof);
  const rejected = assert.rejects(pending, unavailable('YANDEX_UNAVAILABLE'));
  await tokenReady.promise; await flush();
  t.mock.timers.tick(6000);
  tokenStream.enqueue(Buffer.from('{"access_token":"transient-token"}')); tokenStream.close();
  await profileReady.promise; await flush();
  profileStream.enqueue(Buffer.from('{"id":"123",'));
  t.mock.timers.tick(1999); await flush();
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); await rejected;
  assert.equal(signal.aborted, true); assert.equal(cancelled, true); assert.equal(requests, 2);
  assert.deepEqual(await yandex(async url => json(url.endsWith('/token') ? { access_token: 'ok' } : user)).profile(proof), { externalId: user.id, email: 'person@example.test' });
});

test('mail eight-second deadline covers stalled body, cancels stream, and allows next send', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let cancelled = false, signal;
  const pending = mail(async (_, options) => {
    signal = options.signal;
    return new Response(new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } }), { headers: { 'content-type': 'application/json' } });
  }).send(message);
  const rejected = assert.rejects(pending, unavailable('MAIL_UNAVAILABLE'));
  await flush(); t.mock.timers.tick(8000); await rejected;
  assert.equal(signal.aborted, true); assert.equal(cancelled, true);
  await mail(async () => json({ id: 'next' })).send(message);
});

test('deadline rejects ignored abort, cancels late response, and never advances OAuth after timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const late = deferred(); let requests = 0, cancelled = false;
  const pending = yandex(async () => { requests++; return late.promise; }).profile(proof);
  const rejected = assert.rejects(pending, unavailable('YANDEX_UNAVAILABLE'));
  await flush(); t.mock.timers.tick(8000); await rejected;
  late.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }));
  await flush(); assert.equal(cancelled, true); assert.equal(requests, 1);
});

test('four active operations cap is shared across instances, spans both Yandex legs, and isolates mail', async () => {
  const release = deferred(), profileReady = deferred(); let requests = 0, profiles = 0;
  const fetchImpl = async url => {
    requests++;
    if (url.endsWith('/token')) return json({ access_token: 'transient-token' });
    profiles++; if (profiles === 4) profileReady.resolve();
    await release.promise; return json(user);
  };
  const pending = Array.from({ length: 4 }, () => yandex(fetchImpl).profile(proof));
  await profileReady.promise;
  await assert.rejects(yandex(fetchImpl).profile(proof), unavailable('YANDEX_BUSY'));
  assert.equal(requests, 8);
  await mail(async () => json({ id: 'unrelated-mail' })).send(message);
  release.resolve(); await Promise.all(pending);
  await yandex(fetchImpl).profile(proof);
  const mailRelease = deferred(); let sends = 0;
  const mailFetch = async () => { sends++; await mailRelease.promise; return json({ id: 'ok' }); };
  const sending = Array.from({ length: 4 }, () => mail(mailFetch).send(message));
  await flush(); await assert.rejects(mail(mailFetch).send(message), unavailable('MAIL_BUSY'));
  assert.equal(sends, 4); mailRelease.resolve(); await Promise.all(sending);
  await mail(mailFetch).send(message); assert.equal(sends, 5);
});

test('real HTTP redirect never propagates credentials to the redirect target', async t => {
  let redirected = 0;
  const target = createServer((req, res) => { redirected++; res.end('{}'); });
  target.listen(0, '127.0.0.1'); await once(target, 'listening');
  const server = createServer((req, res) => {
    req.resume(); res.writeHead(307, { location: `http://127.0.0.1:${target.address().port}/stolen` }); res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); target.closeAllConnections(); target.close(); });
  const fetchImpl = (_, options) => fetch(`http://127.0.0.1:${server.address().port}/provider`, options);
  await assert.rejects(mail(fetchImpl).send(message), unavailable('MAIL_UNAVAILABLE'));
  await assert.rejects(yandex(fetchImpl).profile(proof), unavailable('YANDEX_UNAVAILABLE'));
  assert.equal(redirected, 0);
});
