import { createHash, randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(code, status, message) { super(message); this.name = 'AppError'; this.code = code; this.status = status; }
}
export const fail = (code, status, message) => { throw new AppError(code, status, message); };
export const assert = (condition, code = 'VALIDATION', status = 400, message = 'Некорректный запрос') => {
  if (!condition) fail(code, status, message);
};
export const id = () => randomUUID();
export const canonical = value => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sort(value[k])]));
  return value;
}
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function object(value, allowed, required = []) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value));
  assert(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  assert(Object.keys(value).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(value, k)));
  return value;
}
export function safeTree(value, depth = 0) {
  assert(depth <= 12);
  if (typeof value === 'string') assert(value.length <= 8192);
  else if (typeof value === 'number') assert(Number.isFinite(value));
  else if (Array.isArray(value)) { assert(value.length <= 1000); value.forEach(v => safeTree(v, depth + 1)); }
  else if (value !== null && typeof value === 'object') {
    assert(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    for (const [k, v] of Object.entries(value)) {
      assert(!['__proto__', 'constructor', 'prototype'].includes(k)); safeTree(v, depth + 1);
    }
  } else assert(value === null || typeof value === 'boolean');
}
export function str(value, max = 160) { assert(typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/u.test(value)); return value; }
export function integer(value, min = 0, max = 100000000) { assert(Number.isSafeInteger(value) && value >= min && value <= max); return value; }
export function iso(value) { str(value, 40); assert(/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))); return new Date(value).toISOString(); }
export const addDays = (value, days) => new Date(Date.parse(value) + days * 86400000).toISOString();
export const reward = (amount, bps) => Number(BigInt(integer(amount)) * BigInt(integer(bps, 1, 10000)) / 10000n);
export const sum = values => values.reduce((a, b) => { const n = a + b; assert(Number.isSafeInteger(n), 'LIMIT', 409); return n; }, 0);
export function policy(input, version, at) {
  object(input, ['kind', 'bps', 'windowDays', 'holdDays', 'recurring'], ['kind', 'bps', 'windowDays', 'holdDays', 'recurring']);
  assert(['cash', 'credit'].includes(input.kind)); integer(input.bps, 1, 10000); integer(input.windowDays, 1, 365);
  integer(input.holdDays, 0, 90); assert(typeof input.recurring === 'boolean');
  return { ...input, id: id(), version, currency: 'RUB', publishedAt: at };
}
export function sourceChanged(state) {
  state.sourceVersion += 1;
  for (const artifact of state.registries) if (artifact.approval) { artifact.approval = null; artifact.status = 'stale'; }
  state.allocations = state.allocations.filter(a => a.transferId);
}
export function ownResource(list, resourceId) {
  const value = list.find(v => v.id === resourceId);
  assert(value, 'NOT_FOUND', 404, 'Ресурс не найден'); return value;
}
