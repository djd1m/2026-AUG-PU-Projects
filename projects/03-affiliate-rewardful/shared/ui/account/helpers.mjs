const MAX_RESPONSE_CHARS = 1024 * 1024;

export const byId = id => document.getElementById(id);

export function element(tag, text, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = String(text);
  if (className) value.className = className;
  return value;
}

export function addFact(parent, label, value) {
  const row = element('div', undefined, 'row');
  row.append(element('strong', `${label}: `), document.createTextNode(display(value)));
  parent.append(row);
  return row;
}

export function addDetails(parent, value, limit = 8_000) {
  const pre = element('pre');
  let text;
  try { text = JSON.stringify(value, null, 2); } catch { text = 'Данные недоступны'; }
  pre.textContent = text.length > limit ? `${text.slice(0, limit)}\n…` : text;
  parent.append(pre);
  return pre;
}

export function display(value) {
  if (value === null || value === undefined || value === '') return 'Недоступно';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  return String(value);
}

export function rub(minor) {
  if (!Number.isSafeInteger(minor)) return 'Сумма недоступна';
  const sign = minor < 0 ? '−' : '';
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')} ₽`;
}

function metric(parent, label, value) {
  const box = element('div', undefined, 'row');
  box.append(element('span', label), element('div', value, 'metric'));
  parent.append(box);
}

export function renderAccountSummary(ui, membership, screen) {
  ui.summary.replaceChildren();
  const role = membership.role;
  const summary = role === 'merchant' ? screen.primary.summary
    : role === 'partner' ? screen.primary.personal?.summary : screen.primary.personal;
  if (!summary || typeof summary !== 'object') {
    ui.summary.append(element('p', 'Сводка недоступна.'));
    return;
  }
  if (role === 'customer') {
    metric(ui.summary, 'Доступный бонус', rub(summary.availableMinor));
    metric(ui.summary, 'Удерживается', rub(summary.heldMinor));
    metric(ui.summary, 'Зарезервировано', rub(summary.reservedMinor));
    addFact(ui.summary, 'Назначение', summary.explanation);
  } else {
    metric(ui.summary, role === 'merchant' ? 'Доступно партнёрам' : 'Доступно', rub(summary.availableMinor));
    metric(ui.summary, 'Удерживается', rub(summary.heldMinor));
    metric(ui.summary, 'Отправлено по реестру', rub(summary.sentMinor));
    addFact(ui.summary, 'Ориентир выплаты', summary.dueDate);
    addFact(ui.summary, 'Пояснение', summary.explanation);
  }
}

export function renderParticipant(ui, membership, screen) {
  ui.merchant.hidden = true;
  ui.participant.hidden = false;
  ui['owner-invite'].hidden = true;
  const { program, personal } = screen.primary;
  ui.enroll.hidden = Boolean(program?.enrollment);
  addFact(ui.summary, 'Условия', program?.terms);
  addFact(ui.summary, 'Ставка', Number.isInteger(program?.policy?.bps)
    ? `${Math.floor(program.policy.bps / 100)}.${String(program.policy.bps % 100).padStart(2, '0')}%` : 'Недоступно');
  addFact(ui.summary, 'Версия условий', program?.policy?.version);
  if (membership.role === 'partner' && Array.isArray(personal?.payments)) {
    addFact(ui.summary, 'Подтверждённых оплат', personal.payments.length);
    const testPayments = personal.payments.filter(payment => payment.testMode === true);
    if (testPayments.length) {
      addFact(ui.summary, 'Оплат в тестовом магазине', testPayments.length);
      const entries = Array.isArray(personal.ledger) ? personal.ledger.filter(entry => entry.testMode === true) : null;
      const net = entries?.every(entry => Number.isSafeInteger(entry.amountMinor))
        ? entries.reduce((total, entry) => total + entry.amountMinor, 0) : null;
      addFact(ui.summary, 'Тестовые комиссии с учётом возвратов', rub(net));
      ui.summary.append(element('p', 'Тестовый магазин: эти начисления не входят в сумму к выплате.'));
    }
  }
  ui.share.replaceChildren();
  if (screen.share) {
    addFact(ui.share, 'Реферальная ссылка', new URL(screen.share.referralUrl, location.origin).href);
    addFact(ui.share, 'Промокод', screen.share.promoCode);
    addFact(ui.share, 'Раскрытие', screen.share.disclosure);
  } else {
    ui.share.append(element('p', program?.enrollment
      ? 'Ссылка рекомендации временно недоступна.' : 'Подтвердите участие, чтобы получить ссылку.'));
  }
}

export function renderPayments(ui, screen) {
  ui.checkout.hidden = true;
  ui['checkout-output'].replaceChildren();
  const status = screen.payments;
  if (!status) return void (ui['payment-status'].textContent = 'Статус ЮKassa недоступен.');
  if (status.unavailableForRole) {
    ui['payment-status'].textContent = 'Создание и сверка оплат доступны владельцу организации.';
    return;
  }
  if (status.configured !== true) {
    ui['payment-status'].textContent = 'ЮKassa для этой организации не подключена.';
    return;
  }
  ui['payment-status'].textContent = `${status.testMode ? 'Тестовый' : 'Боевой'} магазин ЮKassa ${display(status.shopId)} настроен; API проверяется при запросе.`;
  const select = ui.checkout.elements.beneficiaryId;
  const partners = Array.isArray(screen.primary.partners) ? screen.primary.partners : [];
  select.replaceChildren(...partners.map(partner => {
    const option = element('option', display(partner.name)); option.value = partner.id; return option;
  }));
  ui.checkout.hidden = partners.length === 0;
  if (!partners.length) ui['checkout-output'].append(element('p', 'Сначала пригласите партнёра и дождитесь принятия приглашения.'));
  for (const order of Array.isArray(status.orders) ? status.orders : []) {
    const row = element('div', undefined, 'row');
    addFact(row, 'Заказ', order.orderId);
    addFact(row, 'Платёж', order.paymentId);
    addFact(row, 'Статус', order.status);
    addFact(row, 'Сумма', rub(order.amountMinor));
    ui['checkout-output'].append(row);
  }
}

export function parseRub(value) {
  const match = /^(?:0|[1-9]\d{0,6})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new Error('Укажите сумму в рублях с точностью до копеек.');
  const [major] = value.split('.');
  const amount = Number(major) * 100 + Number((match[1] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000) {
    throw new Error('Сумма должна быть от 0.01 до 1 000 000.00 ₽.');
  }
  return amount;
}

export class AccountApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
    this.code = code;
  }
}

async function responseJson(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_CHARS) {
    throw new AccountApiError('Ответ сервера слишком большой.', 503, 'RESPONSE_LIMIT');
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new AccountApiError('Ответ сервера слишком большой.', 503, 'RESPONSE_LIMIT');
  }
  try { return JSON.parse(text); }
  catch { throw new AccountApiError('Сервер вернул некорректный ответ.', 503, 'INVALID_RESPONSE'); }
}

function boundedSignal(signal, milliseconds) {
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function account(path, input, { get = false, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api/account/${path}`, {
      method: get ? 'GET' : 'POST',
      credentials: 'same-origin',
      ...(get ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
      signal: boundedSignal(signal, 14_000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AccountApiError('Связь с сервером прервалась. Повторите тот же запрос.', 503, 'NETWORK');
  }
  const payload = await responseJson(response);
  if (!response.ok) {
    throw new AccountApiError(payload?.error?.message || 'Запрос не выполнен.',
      response.status, payload?.error?.code || 'REQUEST_FAILED');
  }
  if (!payload || !Object.hasOwn(payload, 'data')) {
    throw new AccountApiError('Сервер не вернул результат.', 503, 'INVALID_RESPONSE');
  }
  return payload.data;
}

const disabledLeases = new WeakMap();

export async function disableWhile(target, operation) {
  const controls = target.matches?.('button,input,select,textarea')
    ? [target]
    : [...target.querySelectorAll('button')];
  controls.forEach(control => {
    const lease = disabledLeases.get(control);
    if (lease) lease.count += 1;
    else {
      disabledLeases.set(control, { count: 1, original: control.disabled });
      control.disabled = true;
    }
  });
  try { return await operation(); }
  finally {
    controls.forEach(control => {
      const lease = disabledLeases.get(control);
      if (!lease || --lease.count > 0) return;
      control.disabled = lease.original;
      disabledLeases.delete(control);
    });
  }
}

export function createContextGuard() {
  let generation = 0;
  let controller = new AbortController();
  const capture = () => Object.freeze({ generation, signal: controller.signal });
  return {
    capture,
    replace() {
      controller.abort();
      generation += 1;
      controller = new AbortController();
      return capture();
    },
    current(context) {
      return context?.generation === generation && !context.signal.aborted;
    },
    assert(context) {
      if (context?.generation !== generation || context.signal.aborted) {
        throw new DOMException('Рабочий контекст изменился.', 'AbortError');
      }
    },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function createMutationKeys() {
  const pending = new Map();
  return {
    key(scope, input) {
      const fingerprint = JSON.stringify(canonical(input));
      const current = pending.get(scope);
      if (current?.fingerprint === fingerprint) return current.key;
      if (!globalThis.crypto?.randomUUID) throw new Error('Безопасный генератор ключей недоступен.');
      const next = { fingerprint, key: crypto.randomUUID() };
      pending.set(scope, next);
      return next.key;
    },
    complete(scope) { pending.delete(scope); },
    clear() { pending.clear(); },
  };
}

function sseJson(text) {
  const data = text.split(/\r?\n/).filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim()).find(Boolean);
  return data ? JSON.parse(data) : null;
}

export async function mcp(token, method, params, id, signal) {
  let response;
  try {
    response = await fetch('/mcp', {
      method: 'POST',
      credentials: 'omit',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(method === 'initialize' ? {} : { 'mcp-protocol-version': '2025-11-25' }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: boundedSignal(signal, 10_000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('MCP-соединение недоступно.');
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) throw new Error('Ответ MCP слишком большой.');
  let payload;
  try {
    payload = response.headers.get('content-type')?.startsWith('text/event-stream')
      ? sseJson(text) : JSON.parse(text);
  } catch { throw new Error('MCP вернул некорректный ответ.'); }
  if (!response.ok || payload?.error) throw new Error(payload?.error?.message || 'MCP-запрос отклонён.');
  return payload?.result;
}
