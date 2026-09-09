import type { EnrollmentEvidence, IssueEnrollmentInput, Pagination, ProgramInput, SavePolicyInput, Scope } from '../../../../../packages/db/src/onboarding-contract';
import { HttpError } from './errors';
export function invalid(): never { throw new HttpError(422, 'invalid_input'); }
export function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some((key) => !allowed.includes(key))) return invalid();
  return obj;
}
export function text(value: unknown, max: number, min = 1): string {
  if (typeof value !== 'string' || value.length < min || Buffer.byteLength(value, 'utf8') > max || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) return invalid();
  return value;
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) return invalid();
  return value;
}
export function hash32(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return invalid();
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}
export function literal<T extends string>(value: unknown, choices: readonly T[]): T {
  for (const choice of choices) if (value === choice) return choice;
  return invalid();
}
export function instant(value: unknown): string {
  const result = text(value, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(result) || !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result.replace(/(?<!\.[0-9]{3})Z$/, '.000Z')) return invalid();
  return result;
}
export function pagination(params: URLSearchParams, allowed = ['limit', 'cursor']): Pagination {
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1) return invalid();
  const limit = params.get('limit'); const cursor = params.get('cursor');
  if (limit !== null && !/^[0-9]{1,3}$/.test(limit)) return invalid();
  return { ...(limit === null ? {} : { limit: integer(Number(limit), 1, 100) }), ...(cursor === null ? {} : { cursor: uuid(cursor) }) };
}
export function evidence(value: unknown): EnrollmentEvidence {
  const fields = object(value, ['identity', 'authority']);
  const reference = (input: unknown) => {
    const ref = object(input, ['reference', 'sha256']);
    return { reference: text(ref.reference, 256), sha256: hash32(ref.sha256) };
  };
  return { identity: reference(fields.identity), authority: reference(fields.authority) };
}
export function policyInput(value: unknown, program: ProgramInput): SavePolicyInput {
  const b = object(value, ['rate_bp', 'attribution_days', 'conflict_rule', 'recurring_mode', 'commission_duration',
    'currency', 'timezone', 'terms_text', 'expected_version', 'acknowledged', 'effective_mode', 'effective_at']);
  if (b.acknowledged !== true) return invalid();
  const days = integer(b.attribution_days, 30, 90);
  if (days !== 30 && days !== 60 && days !== 90) return invalid();
  const timezone = text(b.timezone, 100);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { return invalid(); }
  const base = { ...program, rate_bp: integer(b.rate_bp, 1, 10000), attribution_days: days,
    conflict_rule: literal(b.conflict_rule, ['explicit_promo_else_last_valid_cookie']),
    recurring_mode: literal(b.recurring_mode, ['every_eligible_payment']),
    commission_duration: literal(b.commission_duration, ['lifetime']), currency: literal(b.currency, ['RUB']),
    timezone, terms_text: text(b.terms_text, 16384), expected_version: integer(b.expected_version, 0, 2147483646), acknowledged: true as const };
  if (b.effective_mode === 'now') {
    if (b.effective_at !== undefined) return invalid();
    return { ...base, attribution_days: days, effective_mode: 'now' };
  }
  if (b.effective_mode !== 'future') return invalid();
  return { ...base, attribution_days: days, effective_mode: 'future', effective_at: instant(b.effective_at) };
}
export function enrollmentInput(value: unknown, program: ProgramInput): IssueEnrollmentInput {
  const b = object(value, ['identity', 'role', 'scopes', 'expires_at', 'evidence']);
  const base = { ...program, identity: text(b.identity, 300), expires_at: instant(b.expires_at), evidence: evidence(b.evidence) };
  if (b.role === 'partner') {
    if (b.scopes !== undefined) return invalid();
    return { ...base, role: 'partner' };
  }
  if (b.role !== 'operator' || !Array.isArray(b.scopes) || b.scopes.length === 0 || b.scopes.length > 4) return invalid();
  const scopes: Scope[] = b.scopes.map((s) => literal(s, ['read', 'payout', 'tax', 'reconcile']));
  if (new Set(scopes).size !== scopes.length) return invalid();
  return { ...base, role: 'operator', scopes };
}
