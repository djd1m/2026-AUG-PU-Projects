import assert from 'node:assert/strict';
import test from 'node:test';

import { mountAccessUI, readAccountFragment } from '../shared/ui/account/access.mjs';
import { createContextGuard } from '../shared/ui/account/helpers.mjs';

class FakeNode {
  constructor() {
    this.disabled = false; this.hidden = false; this.listeners = {}; this.required = false;
    this.textContent = ''; this.value = ''; this.button = null;
  }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector(selector) { return selector === 'button' ? this.button : null; }
  reset() { this.value = ''; }
}

function fakeUi() {
  const ids = [
    'access-status', 'login', 'login-email', 'login-password', 'yandex-login',
    'register-form', 'register-email', 'register-name', 'register-submit', 'register-cooldown',
    'forgot-form', 'forgot-email', 'forgot-submit', 'forgot-cooldown', 'access-completion',
    'completion-title', 'completion-copy', 'completion-form', 'completion-password-label',
    'completion-password', 'completion-submit', 'security-message', 'security-provider', 'contact-request',
    'contact-cooldown', 'recovery-request', 'recovery-cooldown', 'yandex-link',
    'yandex-link-password', 'yandex-unlink', 'yandex-unlink-password', 'change-password',
  ];
  const ui = Object.fromEntries(ids.map(id => [id, new FakeNode()]));
  ui['yandex-link'].button = new FakeNode();
  ui['yandex-unlink'].button = new FakeNode();
  return ui;
}

function submit(node) { return node.listeners.submit({ preventDefault() {} }); }

function harness({ fragment = {}, responder = async () => ({}), now = () => 1_000 } = {}) {
  const ui = fakeUi(), contexts = createContextGuard(), calls = [], notices = [], signedOut = [], navigated = [], authenticated = [];
  const request = async (context, path, input, options) => {
    contexts.assert(context); calls.push({ path, input, options });
    const result = await responder(path, input, options);
    contexts.assert(context); return result;
  };
  const action = async (_target, operation, success, { replace = false } = {}) => {
    const context = replace ? contexts.replace() : contexts.capture();
    try {
      const result = await operation(context);
      if (!contexts.current(context)) return undefined;
      if (success) notices.push([success, false]);
      return result;
    } catch (error) {
      if (!contexts.current(context) || error?.name === 'AbortError') return undefined;
      notices.push([error.message, true]); return undefined;
    }
  };
  const panel = mountAccessUI({ ui, action, request, fragment, now,
    setTimer: () => ({ unref() {} }), clearTimer() {}, notify: (...args) => notices.push(args),
    onAuthenticated: async context => { authenticated.push(context); }, onBeforeAuthSwitch: () => true,
    onSignedOut: message => { signedOut.push(message); contexts.replace(); },
    navigate: url => navigated.push(url) });
  return { ui, panel, contexts, calls, notices, signedOut, navigated, authenticated };
}

test('email proof is captured from the fragment and stripped without browser persistence or a GET', () => {
  const token = 'A'.repeat(43), writes = [];
  const browser = {
    location: { hash: `#access=reset&token=${token}`, pathname: '/account', search: '?from=mail' },
    history: { state: { keep: true }, replaceState: (...args) => writes.push(args) },
    get localStorage() { throw new Error('must not read storage'); },
    get sessionStorage() { throw new Error('must not read storage'); },
  };
  assert.deepEqual(readAccountFragment(browser), { proof: { purpose: 'reset', token } });
  assert.deepEqual(writes, [[{ keep: true }, '', '/account?from=mail']]);

  browser.location.hash = '#access-error=collision';
  assert.match(readAccountFragment(browser).error, /почта уже занята/i);
  assert.equal(writes.length, 2);
});

test('registration sends email and name only, reports delivery uncertainty, and starts a visible cooldown', async () => {
  const h = harness({ responder: async path => path === 'access-status'
    ? { mailConfigured: true, yandexConfigured: false, verificationRequired: true }
    : { accepted: true, message: 'generic' } });
  await h.panel.loadStatus(h.contexts.capture());
  h.ui['register-email'].value = 'person@example.test';
  h.ui['register-name'].value = 'Моя команда';
  await submit(h.ui['register-form']);

  assert.deepEqual(h.calls.map(({ path, input }) => ({ path, input })), [
    { path: 'access-status', input: undefined },
    { path: 'register', input: { email: 'person@example.test', name: 'Моя команда' } },
  ]);
  assert.equal(h.ui['register-submit'].disabled, true);
  assert.match(h.ui['register-cooldown'].textContent, /60 с/);
  assert.match(h.notices.at(-1)[0], /Доставка не гарантируется/);
  assert.doesNotMatch(JSON.stringify(h.calls), /password/i);
});

test('a replaced context clears a transient reset secret and ignores its delayed response', async () => {
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const token = 'R'.repeat(43);
  const h = harness({ fragment: { proof: { purpose: 'reset', token } },
    responder: async path => path === 'reset' ? delayed : {} });
  h.ui['completion-password'].value = 'correct horse battery staple';
  const pending = submit(h.ui['completion-form']);
  h.contexts.replace();
  h.panel.clearSecrets();
  release({ completed: true, loginRequired: true });
  await pending;

  assert.deepEqual(h.calls[0], { path: 'reset', input: { token, password: 'correct horse battery staple' }, options: undefined });
  assert.equal(h.ui['completion-password'].value, '');
  assert.equal(h.ui['access-completion'].hidden, true);
  assert.deepEqual(h.signedOut, []);
});

test('verification enforcement selects security-only state and keeps the correct recovery route visible', async () => {
  const h = harness({ responder: async () => ({ mailConfigured: true, yandexConfigured: true, verificationRequired: true }) });
  await h.panel.loadStatus(h.contexts.capture());
  const sso = { email: 'sso@example.test', emailVerified: false, verificationRequired: true,
    hasPassword: false, yandexLinked: true };
  h.panel.setIdentity(sso);
  assert.equal(h.panel.securityOnly(), true);
  assert.equal(h.ui['contact-request'].hidden, false);
  assert.equal(h.ui['recovery-request'].hidden, true);

  h.panel.setIdentity({ ...sso, emailVerified: true });
  assert.equal(h.panel.securityOnly(), false);
  assert.equal(h.ui['contact-request'].hidden, true);
  assert.equal(h.ui['recovery-request'].hidden, false);

  h.panel.setIdentity({ ...sso, hasPassword: true, yandexLinked: false });
  assert.equal(h.ui['recovery-request'].hidden, false);
  assert.equal(h.ui['yandex-link'].hidden, true);
});

test('contact confirmation uses the current session proof without sending a password', async () => {
  const token = 'C'.repeat(43);
  const h = harness({ fragment: { proof: { purpose: 'contact', token } },
    responder: async () => ({ completed: true }) });
  assert.equal(h.ui['completion-password-label'].hidden, true);
  await submit(h.ui['completion-form']);
  assert.deepEqual(h.calls, [{ path: 'verify-contact', input: { token }, options: undefined }]);
  assert.equal(h.authenticated.length, 1);
  assert.equal(h.ui['access-completion'].hidden, true);
  assert.match(h.notices.at(-1)[0], /почта подтверждена/i);
});

test('Yandex link includes fresh password proof and unlink returns to login', async () => {
  const h = harness({ responder: async path => path === 'access-status'
    ? { mailConfigured: true, yandexConfigured: true, verificationRequired: true }
    : path === 'yandex/start' ? { url: 'https://oauth.yandex.ru/authorize?state=link' } : { unlinked: true } });
  await h.panel.loadStatus(h.contexts.capture());
  h.panel.setIdentity({ email: 'owner@example.test', emailVerified: true, verificationRequired: true,
    hasPassword: true, yandexLinked: false });
  h.ui['yandex-link-password'].value = 'fresh-password-proof';
  await submit(h.ui['yandex-link']);
  assert.deepEqual(h.calls.at(-1), { path: 'yandex/start',
    input: { intent: 'link', currentPassword: 'fresh-password-proof' }, options: undefined });
  assert.equal(h.ui['yandex-link-password'].value, '');
  assert.deepEqual(h.navigated, ['https://oauth.yandex.ru/authorize?state=link']);

  h.panel.setIdentity({ email: 'owner@example.test', emailVerified: true, verificationRequired: true,
    hasPassword: true, yandexLinked: true });
  h.ui['yandex-unlink-password'].value = 'fresh-unlink-proof';
  await submit(h.ui['yandex-unlink']);
  assert.deepEqual(h.calls.at(-1), { path: 'yandex/unlink',
    input: { currentPassword: 'fresh-unlink-proof' }, options: undefined });
  assert.equal(h.signedOut.length, 1);
  assert.match(h.signedOut[0], /сеансы и ключи отозваны/i);
});

test('provider configuration stays explicit and Yandex navigation accepts only its HTTPS origin', async () => {
  const h = harness({ responder: async path => path === 'access-status'
    ? { mailConfigured: false, yandexConfigured: true, verificationRequired: false }
    : { url: 'https://oauth.yandex.ru/authorize?state=safe' } });
  await h.panel.loadStatus(h.contexts.capture());
  assert.equal(h.ui['register-submit'].disabled, true);
  assert.equal(h.ui['forgot-submit'].disabled, true);
  assert.equal(h.ui['yandex-login'].disabled, false);
  assert.match(h.ui['access-status'].textContent, /не настроены оператором/);
  await h.ui['yandex-login'].listeners.click();
  assert.deepEqual(h.calls.at(-1), { path: 'yandex/start', input: { intent: 'login' }, options: undefined });
  assert.deepEqual(h.navigated, ['https://oauth.yandex.ru/authorize?state=safe']);

  const unsafe = harness({ responder: async path => path === 'access-status'
    ? { mailConfigured: true, yandexConfigured: true, verificationRequired: false }
    : { url: 'https://attacker.example/authorize' } });
  await unsafe.panel.loadStatus(unsafe.contexts.capture());
  await unsafe.ui['yandex-login'].listeners.click();
  assert.deepEqual(unsafe.navigated, []);
  assert.match(unsafe.notices.at(-1)[0], /небезопасную ссылку/);
});
