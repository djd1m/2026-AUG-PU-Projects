import { OnboardingError, type SavePolicyInput } from '../../../../../packages/db/src/onboarding-contract';
export function validatePolicy(input: SavePolicyInput): void {
  if (!Number.isInteger(input.rate_bp) || input.rate_bp < 1 || input.rate_bp > 10000
    || ![30,60,90].includes(input.attribution_days) || input.conflict_rule !== 'explicit_promo_else_last_valid_cookie'
    || input.recurring_mode !== 'every_eligible_payment' || input.commission_duration !== 'lifetime'
    || input.currency !== 'RUB' || input.acknowledged !== true || !Number.isInteger(input.expected_version) || input.expected_version < 0
    || typeof input.terms_text !== 'string' || Buffer.byteLength(input.terms_text) < 1 || Buffer.byteLength(input.terms_text) > 16384
    || /[\x00-\x08\x0b-\x1f\x7f]/.test(input.terms_text) || typeof input.timezone !== 'string'
    || !['now','future'].includes(input.effective_mode)) throw new OnboardingError('invalid_input');
  try { new Intl.DateTimeFormat('en', {timeZone: input.timezone}); } catch { throw new OnboardingError('invalid_input'); }
  if (input.effective_mode === 'future' && !isUtcInstant(input.effective_at)) throw new OnboardingError('invalid_input');
}
export function isUtcInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
