import { assert, object, str, iso } from './common.mjs';

// Only the verified payment service supplies this snapshot, copied from a durable
// merchant customer binding before provider IO. It is never a browser event field.
export function boundAttribution(state, event, policy, binding) {
  assert(state.mode === 'real' && event.provider === 'yookassa', 'UNTRUSTED_BINDING', 403);
  object(binding, ['id','beneficiaryId','channel','attributedAt','registeredAt','testMode'],
    ['id','beneficiaryId','channel','attributedAt','registeredAt','testMode']);
  str(binding.id); assert(/^[a-f0-9-]{36}$/.test(binding.id));
  assert(typeof binding.testMode === 'boolean');
  assert(binding.beneficiaryId === event.beneficiaryId, 'BENEFICIARY_MISMATCH', 409);
  const registeredAt = iso(binding.registeredAt);
  assert(Date.parse(registeredAt) <= Date.parse(event.paidAt), 'PAYMENT_PREDATES_BINDING', 409);
  if (binding.channel === 'none') {
    assert(binding.beneficiaryId === null && binding.attributedAt === null);
    return { eligible:false, reason:'no_attribution', channel:'none', bindingId:binding.id };
  }
  assert(['link','promo'].includes(binding.channel));
  const beneficiary = state.actors.find(actor => actor.id === binding.beneficiaryId);
  assert(beneficiary?.role === 'partner' && event.kind === 'cash', 'INVALID_BENEFICIARY', 409);
  const attributedAt = iso(binding.attributedAt);
  assert(Date.parse(attributedAt) <= Date.parse(registeredAt), 'ATTRIBUTION_TIME', 409);
  // Qualification happened at verified signup. Do not re-interpret an old promo
  // or restart/expire the acquisition window on every later merchant invoice.
  const prior = state.payments.some(payment => payment.source === 'connector'
    && payment.testMode === binding.testMode && payment.customerId === event.customerId
    && payment.beneficiaryId === beneficiary.id && payment.rewardMinor > 0);
  if (!policy.recurring && prior) return { eligible:false, reason:'recurring_disabled',
    channel:binding.channel, bindingId:binding.id };
  return { eligible:true, channel:binding.channel, beneficiaryId:beneficiary.id,
    attributedAt, registeredAt, bindingId:binding.id, policyVersion:policy.version };
}
