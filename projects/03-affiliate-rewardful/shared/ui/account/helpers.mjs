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

export async function account(path, input, { get = false } = {}) {
  let response;
  try {
    response = await fetch(`/api/account/${path}`, {
      method: get ? 'GET' : 'POST',
      credentials: 'same-origin',
      ...(get ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }),
      signal: AbortSignal.timeout(14_000),
    });
  } catch {
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

export async function disableWhile(target, operation) {
  const controls = target.matches?.('button,input,select,textarea')
    ? [target]
    : [...target.querySelectorAll('button,input,select,textarea')];
  const previous = controls.map(control => control.disabled);
  controls.forEach(control => { control.disabled = true; });
  try { return await operation(); }
  finally { controls.forEach((control, index) => { control.disabled = previous[index]; }); }
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

export async function mcp(token, method, params, id) {
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
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
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
