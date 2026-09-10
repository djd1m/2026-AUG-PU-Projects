import { OnboardingError, type OnboardingService } from '../../../../../packages/db/src/onboarding-contract';
import { OnboardingRepository } from '../../../../../packages/db/src/onboarding-repository';
import { PasswordService, isValidPassword } from '../auth/password';
import { generateSessionToken, hashSessionToken } from '../auth/session';
import { createGrantToken, hashGrantToken, hashIdentity } from './identity';
import { validatePolicy, isUtcInstant } from './policy';
import { validateIssue } from './partner';
export function createOnboardingService(options:{repository:OnboardingRepository;passwords:Pick<PasswordService,'hashPassword'>;sessionSecret:Buffer;identitySecret:Buffer}):OnboardingService {
  const {repository:r,passwords}=options;
  if(!Buffer.isBuffer(options.sessionSecret)||options.sessionSecret.length<32||!Buffer.isBuffer(options.identitySecret)||options.identitySecret.length<32)throw new OnboardingError('unavailable');
  const sessionSecret=Buffer.from(options.sessionSecret),identitySecret=Buffer.from(options.identitySecret);
  return {
    async register(input) {
      if(!isValidPassword(input.password))throw new OnboardingError('invalid_input');
      const identityHash=hashIdentity(input.identity,identitySecret),grantHash=hashGrantToken(input.grant_token);
      await r.registrationPreflight({grantHash,identityHash});
      if(input.signal?.aborted)throw new OnboardingError('canceled');
      let passwordHash:string;
      try {passwordHash=await passwords.hashPassword(input.password,input.signal);} catch(e) {
        if(e instanceof Error&&['queue_timeout','canceled','overloaded','invalid_input'].includes(e.message))throw new OnboardingError(e.message as 'queue_timeout'|'canceled'|'overloaded'|'invalid_input');
        throw new OnboardingError('unavailable');
      }
      if(input.signal?.aborted)throw new OnboardingError('canceled');
      const token=generateSessionToken();
      const result=await r.register({grantHash,identityHash,passwordHash,sessionHash:hashSessionToken(token,sessionSecret)});
      return {...result,token};
    },
    bindEnrollment: input=>r.bindEnrollment({sessionTokenHash:input.sessionTokenHash,grantHash:hashGrantToken(input.grant_token)}),
    previewEnrollment: input=>r.previewEnrollment({sessionTokenHash:input.sessionTokenHash,grantHash:hashGrantToken(input.grant_token)}),
    acceptEnrollment: input=>r.acceptEnrollment({sessionTokenHash:input.sessionTokenHash,grantHash:hashGrantToken(input.grant_token)}),
    acceptPartner: input=>r.acceptPartner({...input,grantHash:hashGrantToken(input.grant_token)}),
    getMe: input=>r.getMe(input),getProgram:input=>r.getProgram(input),listMembers:input=>r.listMembers(input),
    savePolicy(input){validatePolicy(input);return r.savePolicy(input);},
    activateProgram:input=>r.activateProgram(input),
    async issueEnrollment(input){validateIssue(input);const grant_token=createGrantToken();
      const result=await r.issueEnrollment({...input,identityHash:hashIdentity(input.identity,identitySecret),grantHash:hashGrantToken(grant_token)});
      return {...result,grant_token};},
    revokeEnrollment:input=>r.revokeEnrollment(input),revokeOperator:input=>r.revokeOperator(input),
    setPartnerStatus:input=>r.setPartnerStatus(input),revokeAsset:input=>r.revokeAsset(input),getPartnerAssets:input=>r.getPartnerAssets(input),
    resolveEligibility(input){if(!isUtcInstant(input.at))throw new OnboardingError('invalid_input');return r.resolveEligibility(input);},
  };
}
