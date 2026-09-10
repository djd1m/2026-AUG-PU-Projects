import type { Pool } from 'pg';
import { OnboardingError, type OnboardingCode, type ProgramInput, type SessionInput, type Pagination, type SavePolicyInput, type IssueEnrollmentInput } from './onboarding-contract';
import * as c from './onboarding-codecs';
const safeCodes = new Set<OnboardingCode>(['invalid_input','invalid_credentials','enrollment_unavailable','unauthorized','forbidden','conflict','terms_changed','policy_unavailable','integration_not_ready','unavailable']);
export function safeDatabaseError(error: unknown): OnboardingError {
  if (error instanceof OnboardingError) return error;
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    if (error.code === 'P0001' && typeof error.message === 'string' && safeCodes.has(error.message as OnboardingCode)) return new OnboardingError(error.message as OnboardingCode);
    if (error.code === '23505') return new OnboardingError('conflict');
    if (['23502','23503','23514','22P02','22007','22008','22023'].includes(String(error.code))) return new OnboardingError('invalid_input');
  }
  return new OnboardingError('unavailable');
}
type HasGrant = SessionInput & {grantHash:Buffer};
export class OnboardingRepository {
  constructor(private readonly pool: Pool) {}
  private async query<T>(sql:string,params:unknown[],decode:(v:unknown)=>T):Promise<T> {
    try { const r = await this.pool.query<{result:unknown}>(sql,params); return decode(r.rows[0]?.result); }
    catch(error) { throw safeDatabaseError(error); }
  }
  private session(input:SessionInput) { c.requireSession(input.sessionTokenHash);return input.sessionTokenHash; }
  private program(input:ProgramInput) { c.requireUuid(input.program_id);return input.program_id; }
  registrationPreflight(input:{grantHash:Buffer;identityHash:Buffer}) { return this.query('SELECT n3a.onboarding_registration_preflight($1,$2) AS result',[input.grantHash,input.identityHash],c.decodePreflight); }
  register(input:{grantHash:Buffer;identityHash:Buffer;passwordHash:string;sessionHash:Buffer}) { return this.query('SELECT n3a.onboarding_register($1,$2,$3,$4) AS result',[input.grantHash,input.identityHash,input.passwordHash,input.sessionHash],c.decodeRegistered); }
  bindEnrollment(input:HasGrant) { return this.query('SELECT n3a.onboarding_bind($1,$2) AS result',[this.session(input),input.grantHash],c.decodePreview); }
  previewEnrollment(input:HasGrant) { return this.query('SELECT n3a.onboarding_preview($1,$2) AS result',[this.session(input),input.grantHash],c.decodePreview); }
  acceptEnrollment(input:HasGrant) { return this.query('SELECT n3a.onboarding_accept($1,$2) AS result',[this.session(input),input.grantHash],c.decodeAccepted); }
  acceptPartner(input:HasGrant&{policy_id:string;terms_hash:string;accepted:true}) { return this.query('SELECT n3a.onboarding_accept_partner($1,$2,$3) AS result',[this.session(input),input.grantHash,JSON.stringify({policy_id:input.policy_id,terms_hash:input.terms_hash,accepted:input.accepted})],c.decodePartner); }
  getMe(input:SessionInput&Pagination) { if(input.cursor)c.requireUuid(input.cursor);return this.query('SELECT n3a.onboarding_me($1,$2,$3) AS result',[this.session(input),c.requireLimit(input.limit),input.cursor??null],c.decodeMe); }
  getProgram(input:ProgramInput) { return this.query('SELECT n3a.onboarding_program($1,$2) AS result',[this.session(input),this.program(input)],c.decodeProgram); }
  listMembers(input:ProgramInput&{limit?:number;member_cursor?:string;grant_cursor?:string}) {
    if(input.member_cursor)c.requireUuid(input.member_cursor);if(input.grant_cursor)c.requireUuid(input.grant_cursor);
    return this.query('SELECT n3a.onboarding_members($1,$2,$3,$4,$5) AS result',[this.session(input),this.program(input),c.requireLimit(input.limit),input.member_cursor??null,input.grant_cursor??null],c.decodeMembers);
  }
  savePolicy(input:SavePolicyInput) { const {sessionTokenHash,...fields}=input;return this.query('SELECT n3a.onboarding_save_policy($1,$2,$3) AS result',[this.session(input),this.program(input),JSON.stringify(fields)],c.decodeSaved); }
  async activateProgram(input:ProgramInput):Promise<never> { await this.query('SELECT n3a.onboarding_activate($1,$2) AS result',[this.session(input),this.program(input)],()=>{throw new OnboardingError('unavailable');});throw new OnboardingError('unavailable'); }
  issueEnrollment(input:Omit<IssueEnrollmentInput,'identity'>&{identityHash:Buffer;grantHash:Buffer}) {
    return this.query('SELECT n3a.onboarding_issue($1,$2,$3,$4,$5) AS result',[this.session(input),this.program(input),JSON.stringify({role:input.role,scopes:input.scopes,expires_at:input.expires_at,evidence:input.evidence}),input.identityHash,input.grantHash],c.decodeIssued);
  }
  revokeEnrollment(input:ProgramInput&{grant_id:string}) {c.requireUuid(input.grant_id);return this.query('SELECT n3a.onboarding_revoke_grant($1,$2,$3) AS result',[this.session(input),this.program(input),input.grant_id],c.decodeRevoked);}
  revokeOperator(input:ProgramInput&{membership_id:string}) {c.requireUuid(input.membership_id);return this.query('SELECT n3a.onboarding_revoke_operator($1,$2,$3) AS result',[this.session(input),this.program(input),input.membership_id],c.decodeRevoked);}
  setPartnerStatus(input:ProgramInput&{partner_id:string;status:'active'|'suspended';expected_status:'active'|'suspended'}) {c.requireUuid(input.partner_id);return this.query('SELECT n3a.onboarding_partner_status($1,$2,$3,$4) AS result',[this.session(input),this.program(input),input.partner_id,JSON.stringify({status:input.status,expected_status:input.expected_status})],c.decodeStatus);}
  revokeAsset(input:ProgramInput&{asset_id:string}) {c.requireUuid(input.asset_id);return this.query('SELECT n3a.onboarding_revoke_asset($1,$2,$3) AS result',[this.session(input),this.program(input),input.asset_id],c.decodeRevoked);}
  getPartnerAssets(input:ProgramInput&{partner_id?:string}) {if(input.partner_id)c.requireUuid(input.partner_id);return this.query('SELECT n3a.onboarding_assets($1,$2,$3) AS result',[this.session(input),this.program(input),input.partner_id??null],c.decodeAssets);}
  resolveEligibility(input:ProgramInput&{partner_id:string;asset_id:string;at:string}) {c.requireUuid(input.partner_id);c.requireUuid(input.asset_id);return this.query('SELECT n3a.onboarding_eligibility($1,$2,$3,$4,$5) AS result',[this.session(input),this.program(input),input.partner_id,input.asset_id,input.at],c.decodeHistorical);}
}
