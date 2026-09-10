import { it,expect } from 'vitest';
import { validatePolicy } from '../src/lib/onboarding/policy';
import { randomBytes,randomUUID } from 'node:crypto';
import type { SavePolicyInput } from '../../../packages/db/src/onboarding-contract';
const valid:SavePolicyInput={sessionTokenHash:randomBytes(32),program_id:randomUUID(),rate_bp:1,attribution_days:90,conflict_rule:'explicit_promo_else_last_valid_cookie',recurring_mode:'every_eligible_payment',commission_duration:'lifetime',currency:'RUB',timezone:'Europe/Moscow',terms_text:'<script>Text remains plain text</script>',expected_version:0,effective_mode:'now',acknowledged:true};
it('allows exact plain text and rejects incomplete/noninteger/control policy input',()=>{
 expect(()=>validatePolicy(valid)).not.toThrow();
 for(const patch of [{rate_bp:0},{rate_bp:1.1},{rate_bp:10001},{acknowledged:false},{terms_text:'x\u0000'},{timezone:'invented/place'},{terms_text:'я'.repeat(8193)},{expected_version:-1}])expect(()=>validatePolicy({...valid,...patch} as SavePolicyInput)).toThrow('invalid_input');
});
