import { OnboardingError, type PolicyDTO, type EnrollmentPreview, type AcceptedEnrollment, type AcceptedPartner,
  type MeDTO, type ProgramDTO, type MembersDTO, type PartnerAssetsDTO, type HistoricalEligibility, type AdmissionResult } from './onboarding-contract';
type Check = (v: unknown) => boolean;
const string: Check = v => typeof v === 'string';
const uuid: Check = v => typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
const instant: Check = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const integer: Check = v => typeof v === 'number' && Number.isInteger(v);
const boolean: Check = v => typeof v === 'boolean';
const choice = (...values: unknown[]): Check => v => values.includes(v);
const nullable = (check: Check): Check => v => v === null || check(v);
const array = (check: Check): Check => v => Array.isArray(v) && v.every(check);
const object = (fields: Record<string, Check>): Check => v => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const record = v as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(fields).length && Object.entries(fields).every(([k,c]) => c(record[k]));
};
const role = choice('owner','operator','partner');
const scopes = array(choice('read','configure','invite','payout','tax','reconcile'));
const programStatus = choice('draft','active','paused');
const partnerStatus = choice('invited','active','suspended');
const policyFields = { id: uuid,version:integer,terms_hash:(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),
  effective_at:instant,rate_bp:integer,attribution_days:choice(30,60,90),conflict_rule:choice('explicit_promo_else_last_valid_cookie'),
  recurring_mode:choice('every_eligible_payment'),commission_duration:choice('lifetime'),currency:choice('RUB'),timezone:string,terms_text:string };
const policy = object(policyFields);
const membership = object({id:uuid,program_id:uuid,program_name:string,user_id:uuid,role,scopes,partner_id:nullable(uuid),status:choice('active','revoked'),partner_status:nullable(partnerStatus)});
const grant = object({id:uuid,role,scopes,partner_id:nullable(uuid),expires_at:instant,revoked_at:nullable(instant),consumed_at:nullable(instant)});
const page = (entry:Check) => object({items:array(entry),next_cursor:nullable(uuid)});
const asset = object({id:uuid,kind:choice('link','promo'),public_code:string,status:choice('active','revoked'),expires_at:nullable(instant),cohort:string,future_path:nullable(string)});
const assetFields = {partner_id:uuid,program_id:uuid,program_status:programStatus,integration_status:choice('not_ready'),partner_status:partnerStatus,accepted_policy_id:uuid,accepted_at:instant,assets:array(asset)};
function decoder<T>(check: Check): (v: unknown) => T {
  return v => { if (!check(v)) throw new OnboardingError('unavailable');
    // The full nested DTO shape (including exact key set) was checked above before this narrowing.
    return v as T; };
}
export const decodePolicy = decoder<PolicyDTO>(policy);
export const decodePreview = decoder<EnrollmentPreview>(object({grant_id:uuid,role,scopes,program_id:uuid,program_name:string,program_status:programStatus,integration_status:choice('not_ready'),policy:nullable(policy)}));
export const decodeAccepted = decoder<AcceptedEnrollment>(object({membership_id:uuid,program_id:uuid,role:choice('owner','operator')}));
export const decodeAssets = decoder<PartnerAssetsDTO>(object(assetFields));
export const decodePartner = decoder<AcceptedPartner>(object({...assetFields,membership_id:uuid}));
export const decodeMe = decoder<MeDTO>(object({user_id:uuid,memberships:page(membership)}));
export const decodeProgram = decoder<ProgramDTO>(object({id:uuid,name:string,public_slug:string,currency:choice('RUB'),program_status:programStatus,integration_status:choice('not_ready'),role,scopes,partner_id:nullable(uuid),current_policy:nullable(policy),latest_version:integer,timezone:nullable(string),calendar_locked_at:nullable(instant)}));
export const decodeMembers = decoder<MembersDTO>(object({members:page(membership),grants:page(grant)}));
export const decodeHistorical = decoder<HistoricalEligibility>(object({state:choice('eligible','ineligible','unknown'),partner_fact_id:nullable(uuid),asset_fact_id:nullable(uuid),consent_policy_id:nullable(uuid)}));
export const decodeAdmission = decoder<AdmissionResult>(object({allowed:boolean,retry_after:integer}));
export const decodeRegistered = decoder<{user_id:string;expires_at:string}>(object({user_id:uuid,expires_at:instant}));
export const decodePreflight = decoder<{allowed:true}>(object({allowed:choice(true)}));
export const decodeIssued = decoder<{grant_id:string;partner_id:string|null}>(object({grant_id:uuid,partner_id:nullable(uuid)}));
export const decodeSaved = decoder<{policy_id:string;version:number;program_status:'draft'|'active'|'paused'}>(object({policy_id:uuid,version:integer,program_status:programStatus}));
export const decodeRevoked = decoder<{status:'revoked'}>(object({status:choice('revoked')}));
export const decodeStatus = decoder<{status:'active'|'suspended'}>(object({status:choice('active','suspended')}));
export const decodeBootstrap = decoder<{program_id:string;grant_id:string;replayed:boolean}>(object({program_id:uuid,grant_id:uuid,replayed:boolean}));
export function requireUuid(value: unknown): void { if (!uuid(value)) throw new OnboardingError('invalid_input'); }
export function requireSession(value: unknown): void { if (!Buffer.isBuffer(value) || value.length !== 32) throw new OnboardingError('unauthorized'); }
export function requireLimit(value: unknown): number { const n = value === undefined ? 100 : value; if (typeof n!=='number'||!Number.isInteger(n)||n<1||n>100) throw new OnboardingError('invalid_input');return n; }
