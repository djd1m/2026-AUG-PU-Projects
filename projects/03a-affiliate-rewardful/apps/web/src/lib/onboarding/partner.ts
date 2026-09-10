import { OnboardingError, type IssueEnrollmentInput, type EvidenceRef } from '../../../../../packages/db/src/onboarding-contract';
import { isUtcInstant } from './policy';
export function validEvidence(e: EvidenceRef): boolean {
  return !!e && typeof e.reference === 'string' && e.reference.length >= 1 && e.reference.length <= 256
    && !/[\x00-\x1f\x7f]/.test(e.reference) && typeof e.sha256 === 'string' && /^[a-f0-9]{64}$/.test(e.sha256);
}
export function validateIssue(input: IssueEnrollmentInput): void {
  if (!isUtcInstant(input.expires_at) || !input.evidence || !validEvidence(input.evidence.identity) || !validEvidence(input.evidence.authority)) throw new OnboardingError('invalid_input');
  if (input.role === 'operator') {
    if (!Array.isArray(input.scopes) || input.scopes.length === 0 || new Set(input.scopes).size !== input.scopes.length
      || input.scopes.some(s => !['read','payout','tax','reconcile'].includes(s))) throw new OnboardingError('invalid_input');
  } else if (input.role !== 'partner' || input.scopes !== undefined) throw new OnboardingError('invalid_input');
}
