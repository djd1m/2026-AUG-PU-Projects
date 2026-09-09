// Feature contract v1. All public DTO fields use the exact HTTP snake_case names.
// Buffer/session/token inputs remain server-only. HTTP never serializes register.token.
export type Role = 'owner' | 'operator' | 'partner';
export type Scope = 'read' | 'configure' | 'invite' | 'payout' | 'tax' | 'reconcile';
export type ProgramStatus = 'draft' | 'active' | 'paused';
export type PartnerStatus = 'invited' | 'active' | 'suspended';
export type OnboardingCode = 'invalid_input' | 'invalid_credentials' | 'enrollment_unavailable'
  | 'unauthorized' | 'forbidden' | 'conflict' | 'terms_changed' | 'policy_unavailable'
  | 'integration_not_ready' | 'overloaded' | 'queue_timeout' | 'canceled' | 'unavailable';
export class OnboardingError extends Error {
  constructor(readonly code: OnboardingCode) { super(code); this.name = 'OnboardingError'; }
}
export interface EvidenceRef { reference: string; sha256: string }
export interface EnrollmentEvidence { identity: EvidenceRef; authority: EvidenceRef }
export interface SessionInput { sessionTokenHash: Buffer }
export interface ProgramInput extends SessionInput { program_id: string }
export interface GrantInput extends SessionInput { grant_token: string }
export interface Pagination { limit?: number; cursor?: string }
// Cursor is the last returned UUID, ascending id order, exclusive; limit 1..100 (default100).
export interface Page<T> { items: T[]; next_cursor: string | null }
export interface PolicyFields {
  rate_bp: number;
  attribution_days: 30 | 60 | 90;
  conflict_rule: 'explicit_promo_else_last_valid_cookie';
  recurring_mode: 'every_eligible_payment';
  commission_duration: 'lifetime';
  currency: 'RUB';
  timezone: string;
  terms_text: string;
}
export interface PolicyDTO extends PolicyFields {
  id: string; version: number; terms_hash: string; effective_at: string;
}
export type SavePolicyInput = ProgramInput & PolicyFields & {
  expected_version: number; acknowledged: true;
} & ({ effective_mode: 'now'; effective_at?: never } |
  { effective_mode: 'future'; effective_at: string });
export interface MembershipDTO {
  id: string; program_id: string; program_name: string; user_id: string;
  role: Role; scopes: Scope[]; partner_id: string | null;
  status: 'active' | 'revoked'; partner_status: PartnerStatus | null;
}
export interface MeDTO { user_id: string; memberships: Page<MembershipDTO> }
export interface ProgramDTO {
  id: string; name: string; public_slug: string; currency: 'RUB';
  program_status: ProgramStatus; integration_status: 'not_ready';
  role: Role; scopes: Scope[]; partner_id: string | null;
  current_policy: PolicyDTO | null; latest_version: number;
  timezone: string | null; calendar_locked_at: string | null;
}
export interface EnrollmentPreview {
  grant_id: string; role: Role; scopes: Scope[]; program_id: string; program_name: string;
  program_status: ProgramStatus; integration_status: 'not_ready'; policy: PolicyDTO | null;
}
export interface AssetDTO {
  id: string; kind: 'link' | 'promo'; public_code: string;
  status: 'active' | 'revoked'; expires_at: string | null; cohort: string;
  // Future link path only; HTTP/UI resolve against APP_ORIGIN. Tracking is unavailable.
  future_path: string | null;
}
export interface PartnerAssetsDTO {
  partner_id: string; program_id: string; program_status: ProgramStatus;
  integration_status: 'not_ready'; partner_status: PartnerStatus;
  accepted_policy_id: string; accepted_at: string; assets: AssetDTO[];
}
export interface AcceptedEnrollment { membership_id: string; program_id: string; role: 'owner' | 'operator' }
export interface AcceptedPartner extends PartnerAssetsDTO { membership_id: string }
export interface GrantDTO {
  id: string; role: Role; scopes: Scope[]; partner_id: string | null;
  expires_at: string; revoked_at: string | null; consumed_at: string | null;
}
export interface MembersDTO { members: Page<MembershipDTO>; grants: Page<GrantDTO> }
export type IssueEnrollmentInput = ProgramInput & {
  identity: string; expires_at: string; evidence: EnrollmentEvidence;
} & ({ role: 'partner'; scopes?: never } | { role: 'operator'; scopes: Scope[] });
export interface IssuedEnrollment { grant_id: string; grant_token: string; partner_id: string | null }
export interface AdmissionResult { allowed: boolean; retry_after: number }
export interface AdmissionRepositoryContract {
  chargeSource(slot: number): Promise<AdmissionResult>;
  chargeIdentity(slot: number): Promise<AdmissionResult>;
}
export interface HistoricalEligibility {
  state: 'eligible' | 'ineligible' | 'unknown';
  partner_fact_id: string | null; asset_fact_id: string | null; consent_policy_id: string | null;
}
export interface OnboardingService {
  register(input: { identity: string; password: string; grant_token: string; signal?: AbortSignal }):
    Promise<{ user_id: string; token: string; expires_at: string }>;
  bindEnrollment(input: GrantInput): Promise<EnrollmentPreview>;
  previewEnrollment(input: GrantInput): Promise<EnrollmentPreview>;
  acceptEnrollment(input: GrantInput): Promise<AcceptedEnrollment>;
  acceptPartner(input: GrantInput & { policy_id: string; terms_hash: string; accepted: true }): Promise<AcceptedPartner>;
  getMe(input: SessionInput & Pagination): Promise<MeDTO>;
  getProgram(input: ProgramInput): Promise<ProgramDTO>;
  listMembers(input: ProgramInput & { limit?: number; member_cursor?: string; grant_cursor?: string }): Promise<MembersDTO>;
  savePolicy(input: SavePolicyInput): Promise<{ policy_id: string; version: number; program_status: ProgramStatus }>;
  activateProgram(input: ProgramInput): Promise<never>;
  issueEnrollment(input: IssueEnrollmentInput): Promise<IssuedEnrollment>;
  revokeEnrollment(input: ProgramInput & { grant_id: string }): Promise<{ status: 'revoked' }>;
  revokeOperator(input: ProgramInput & { membership_id: string }): Promise<{ status: 'revoked' }>;
  setPartnerStatus(input: ProgramInput & { partner_id: string; status: 'active' | 'suspended'; expected_status: 'active' | 'suspended' }): Promise<{ status: 'active' | 'suspended' }>;
  revokeAsset(input: ProgramInput & { asset_id: string }): Promise<{ status: 'revoked' }>;
  getPartnerAssets(input: ProgramInput & { partner_id?: string }): Promise<PartnerAssetsDTO>;
  // Internal future attribution seam, no HTTP route. Current owner read authority required.
  resolveEligibility(input: ProgramInput & { partner_id: string; asset_id: string; at: string }): Promise<HistoricalEligibility>;
}
