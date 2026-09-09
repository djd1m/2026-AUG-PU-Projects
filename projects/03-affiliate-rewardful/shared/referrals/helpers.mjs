import { assert, str } from '../domain/common.mjs';

export const day = 86400000;
export const iso = value => new Date(value).toISOString();
export function uuid(value) {
  assert(typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value));
  return value;
}
export function publishedPolicy(state) {
  const policy = state.policies.findLast(p => p.kind === 'cash');
  assert(state.policyConfigured?.includes('cash') && policy?.publishedAt, 'POLICY_REQUIRED', 409, 'Опубликуйте денежную программу');
  return policy;
}
export function eligible(state, actorId) {
  return state.actors.some(a => a.id === actorId && a.role === 'partner') &&
    state.enrollments.some(e => e.actorId === actorId && e.consent === true);
}
export function destination(value) {
  str(value, 2048); let url;
  try { url = new URL(value); } catch { assert(false); }
  assert(url.protocol === 'https:' && !url.username && !url.password && !url.hash &&
    !url.searchParams.has('n3_ref') && !url.searchParams.has('n3_ref_expires'));
  assert(url.hostname.includes('.') && !url.hostname.endsWith('.') &&
    !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) && !url.hostname.includes(':'),
  'VALIDATION', 400, 'Укажите публичный HTTPS адрес');
  return url;
}
export function bindingResult(row) {
  return { customerId: row.external_id, bindingId: row.id,
    attribution: { channel: row.channel, beneficiaryId: row.beneficiary_id,
      attributedAt: row.attributed_at ? iso(row.attributed_at) : null,
      ...(row.channel === 'none' && row.source_id ? { reason: 'attribution_expired' } : {}) }, registeredAt: iso(row.registered_at) };
}
