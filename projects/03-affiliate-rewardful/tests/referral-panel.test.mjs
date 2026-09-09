import assert from 'node:assert/strict';
import test from 'node:test';

class FakeNode {
  constructor(tag, text = '') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.value = ''; this._text = text; }
  get textContent() { return this._text + this.children.map(child => child.textContent ?? '').join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = [...children]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  setAttribute(name, value) { this[name] = value; }
}

globalThis.document = {
  createElement: tag => new FakeNode(tag),
  createTextNode: text => new FakeNode('#text', String(text)),
};
globalThis.location = { origin: 'https://n3.example' };
const { mountReferralPanel } = await import('../shared/ui/account/referrals.mjs');

function walk(node) { return [node, ...node.children.flatMap(walk)]; }
function actionNode(container, name) { return walk(container).find(node => node.dataset?.referralAction === name); }
function makePanel({ membership, request }) {
  const container = new FakeNode('section'), notices = [];
  const panel = mountReferralPanel({ container, action: (_target, operation) => operation({ id: 1 }), request,
    getMembership: () => membership.current, notify: (...args) => notices.push(args) });
  return { container, notices, panel };
}
const owner = { current: { membershipId: 'member-1', tenantId: '123e4567-e89b-42d3-a456-426614174000', role: 'merchant' } };
const status = { configured: false, keyActive: false, keyExpiresAt: null, metrics: { visits: 0, registrations: 0,
  payingCustomers: 0, testPayingCustomers: 0, firstCommissionAt: null, firstLiveCommissionAt: null,
  activatedThisWeek: 0, mrr: null } };

test('owner panel renders truthful empty state and keyless tracker instructions', () => {
  const membership = { current: { ...owner.current } };
  const { container, panel } = makePanel({ membership, request: async () => status });
  panel.render(status, membership.current);
  assert.match(container.textContent, /Метрики недоступны|Переходы0/);
  assert.match(container.textContent, /MRR: Недоступно: подписочная модель не подключена/);
  const snippet = walk(container).find(node => node.tagName === 'PRE').textContent;
  assert.equal(snippet, '<script src="https://n3.example/api/referrals/123e4567-e89b-42d3-a456-426614174000/tracker.js" defer></script>');
  assert.doesNotMatch(snippet, /Bearer|secret|ключ/i);
  assert.equal(actionNode(container, 'revoke').disabled, true);
});

test('owner configuration sends exact account contract and refreshes status', async () => {
  const membership = { current: { ...owner.current } }, calls = [];
  const { container, notices, panel } = makePanel({ membership, request: async (_context, path, body) => {
    calls.push({ path, body });
    return path === 'referral-status' ? { ...status, configured: true, landingUrl: 'https://shop.example/register', returnUrl: 'https://shop.example/done' } : { configured: true };
  } });
  panel.render(status, membership.current);
  const inputs = walk(container).filter(node => node.tagName === 'INPUT');
  assert.deepEqual(inputs.map(input => input.value), ['', '']);
  inputs[0].value = 'https://shop.example/register'; inputs[1].value = 'https://shop.example/done';
  const form = walk(container).find(node => node.tagName === 'FORM');
  await form.listeners.submit({ preventDefault() {} });
  assert.deepEqual(calls, [
    { path: 'referral-settings', body: { membershipId: 'member-1', input: { landingUrl: 'https://shop.example/register', returnUrl: 'https://shop.example/done' } } },
    { path: 'referral-status', body: { membershipId: 'member-1' } },
  ]);
  assert.match(container.textContent, /https:\/\/shop\.example\/register/);
  assert.equal(notices.at(-1)[0], 'Адреса подключения сохранены.');
});

test('clear prevents a delayed one-time key from repopulating the panel', async () => {
  const membership = { current: { ...owner.current } };
  let resolveKey;
  const delayed = new Promise(resolve => { resolveKey = resolve; });
  const { container, panel } = makePanel({ membership, request: async (_context, path) => path === 'referral-key' ? delayed : status });
  panel.render(status, membership.current);
  const pending = actionNode(container, 'issue').listeners.click();
  panel.clear();
  membership.current = { membershipId: 'member-2', tenantId: '223e4567-e89b-42d3-a456-426614174000', role: 'merchant' };
  resolveKey({ token: 'K'.repeat(43), expiresAt: '2026-12-08T00:00:00Z' });
  await pending;
  const secret = walk(container).find(node => node['aria-label'] === 'Одноразовый ключ интеграции');
  assert.equal(secret.value, '');
  assert.equal(secret.hidden, true);
  assert.doesNotMatch(container.textContent, /K{20}/);
});

test('partner sees only personal funnel metrics and no owner controls', () => {
  const membership = { current: { ...owner.current } };
  const partnerStatus = { metrics: { ...status.metrics, visits: 7, registrations: 3, payingCustomers: 2 } };
  const { container, panel } = makePanel({ membership, request: async () => partnerStatus });
  panel.render({ ...status, landingUrl: 'https://private.example/register', returnUrl: 'https://private.example/done' }, membership.current);
  membership.current = { membershipId: 'partner-1', tenantId: owner.current.tenantId, role: 'partner' };
  panel.render(partnerStatus, membership.current);
  assert.match(container.textContent, /Ваш результат рекомендаций/);
  assert.match(container.textContent, /Переходы7/);
  assert.doesNotMatch(container.textContent, /private\.example|Статус подключения/);
  assert.equal(walk(container).find(node => node.tagName === 'DIV' && node.children.some(child => child.tagName === 'FORM')).hidden, true);
});

test('clear removes owner status, tenant instructions and an issued key before partner render', async () => {
  const membership = { current: { ...owner.current } };
  const ownerStatus = { ...status, configured: true, keyActive: true,
    landingUrl: 'https://private.example/register', returnUrl: 'https://private.example/done' };
  const partnerStatus = { metrics: { ...status.metrics, visits: 4 } };
  const { container, panel } = makePanel({ membership, request: async (_context, path) => {
    if (path === 'referral-key') return { token: 'Q'.repeat(43), expiresAt: '2026-12-08T00:00:00.000Z' };
    return ownerStatus;
  } });
  panel.render(ownerStatus, membership.current);
  await actionNode(container, 'issue').listeners.click();
  const keyOutput = walk(container).find(node => node['aria-label'] === 'Одноразовый ключ интеграции');
  assert.equal(keyOutput.value, 'Q'.repeat(43));
  assert.match(container.textContent, /private\.example/);

  panel.clear();
  membership.current = { membershipId: 'partner-2', tenantId: '323e4567-e89b-42d3-a456-426614174000', role: 'partner' };
  panel.render(partnerStatus, membership.current);

  assert.equal(keyOutput.value, '');
  assert.equal(keyOutput.hidden, true);
  assert.doesNotMatch(container.textContent,
    /private\.example|123e4567-e89b-42d3-a456-426614174000|Q{20}|Статус подключения|Добавьте трекер/);
  assert.match(container.textContent, /Ваш результат рекомендаций/);
  assert.match(container.textContent, /Переходы4/);
});

test('partner summary separates test commission and applies visible refund adjustment without exposing live ledger totals',async()=>{
  const {renderParticipant}=await import('../shared/ui/account/helpers.mjs');
  const ui=Object.fromEntries(['merchant','participant','owner-invite','enroll','summary','share'].map(id=>[id,new FakeNode('section')]));
  const screen={primary:{program:{enrollment:true,policy:{bps:2000,version:1}},personal:{payments:[{testMode:true}],
    ledger:[{testMode:true,amountMinor:19800},{testMode:false,amountMinor:99999}]}}};
  renderParticipant(ui,{role:'partner'},screen);
  assert.match(ui.summary.textContent,/Тестовые комиссии с учётом возвратов: 198\.00 ₽/);
  assert.match(ui.summary.textContent,/не входят в сумму к выплате/);assert.doesNotMatch(ui.summary.textContent,/999\.99/);
  screen.primary.personal.ledger.push({testMode:true,amountMinor:-9900});ui.summary.replaceChildren();
  renderParticipant(ui,{role:'partner'},screen);assert.match(ui.summary.textContent,/99\.00 ₽/);assert.doesNotMatch(ui.summary.textContent,/198\.00/);
});
