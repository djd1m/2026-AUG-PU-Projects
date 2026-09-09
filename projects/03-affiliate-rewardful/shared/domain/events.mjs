import { assert, object, str, integer, iso, id, hash, reward, addDays, sourceChanged, sum } from './common.mjs';

const paymentFields = ['type', 'provider', 'accountId', 'objectId', 'verified', 'status', 'customerId', 'beneficiaryId', 'kind', 'amountMinor', 'paidAt', 'promo', 'cookie'];
const refundFields = ['type', 'provider', 'accountId', 'objectId', 'verified', 'status', 'paymentId', 'amountMinor', 'refundedAt'];
export const eventKey = event => `${event.provider}/${event.accountId}/${event.objectId}`;
export function validateEvent(event) {
  assert(event?.verified === true && event?.status === 'confirmed', 'UNVERIFIED_EVENT', 409, 'Подтверждение события недоступно; повторите проверку');
  assert(['payment', 'refund'].includes(event.type));
  object(event, event.type === 'payment' ? paymentFields : refundFields,
    event.type === 'payment' ? paymentFields.filter(k => !['promo', 'cookie'].includes(k)) : refundFields);
  assert(['fixture','yookassa'].includes(event.provider), 'PROVIDER_UNAVAILABLE', 400, 'Доступен только синтетический провайдер');
  for (const field of ['accountId', 'objectId']) { str(event[field]); assert(!event[field].includes('/')); }
  integer(event.amountMinor, 1);
  if (event.type === 'refund') { str(event.paymentId); assert(!event.paymentId.includes('/')); iso(event.refundedAt); return; }
  str(event.customerId); str(event.beneficiaryId); iso(event.paidAt); assert(['cash', 'credit'].includes(event.kind));
  for (const field of ['promo', 'cookie']) if (event[field] !== undefined) {
    object(event[field], field === 'promo' ? ['code', 'beneficiaryId', 'attributedAt'] : ['beneficiaryId', 'attributedAt'],
      field === 'promo' ? ['code', 'attributedAt'] : ['beneficiaryId', 'attributedAt']);
    iso(event[field].attributedAt); if (field === 'promo') str(event[field].code); else str(event[field].beneficiaryId);
  }
}
function attribution(state, event, currentPolicy) {
  const explicit = Object.hasOwn(event, 'promo');
  const touch = explicit ? event.promo : event.cookie;
  if (!touch) return { eligible: false, reason: 'no_attribution', channel: 'none' };
  const beneficiary = explicit ? state.actors.find(a => a.promoCode === touch.code) : state.actors.find(a => a.id === touch.beneficiaryId);
  if (!beneficiary || (touch.beneficiaryId && touch.beneficiaryId !== beneficiary.id)) return { eligible: false, reason: 'invalid_promo_or_link', channel: explicit ? 'promo' : 'link' };
  if (beneficiary.id !== event.beneficiaryId) return { eligible: false, reason: 'beneficiary_mismatch', channel: explicit ? 'promo' : 'link' };
  if (event.customerId === beneficiary.id) return { eligible: false, reason: 'self_referral', channel: explicit ? 'promo' : 'link' };
  if ((event.kind === 'cash' && beneficiary.role !== 'partner') || (event.kind === 'credit' && beneficiary.role !== 'customer')) return { eligible: false, reason: 'reward_kind_mismatch' };
  const age = Date.parse(event.paidAt) - Date.parse(touch.attributedAt);
  if (age < 0 || age > currentPolicy.windowDays * 86400000) return { eligible: false, reason: 'attribution_expired', channel: explicit ? 'promo' : 'link' };
  if (!currentPolicy.recurring && state.payments.some(p => p.customerId === event.customerId && p.beneficiaryId === beneficiary.id && p.rewardMinor > 0)) return { eligible: false, reason: 'recurring_disabled' };
  return { eligible: true, channel: explicit ? 'promo' : 'link', beneficiaryId: beneficiary.id, attributedAt: iso(touch.attributedAt), policyVersion: currentPolicy.version };
}
function reverse(state, payment, refund) {
  const prior = state.ledger.filter(e => e.paymentId === payment.id && e.amountMinor < 0);
  const refunded = sum(state.refunds.filter(r => r.paymentKey === payment.businessKey).map(r => r.amountMinor));
  assert(refunded <= payment.amountMinor, 'REFUND_EXCEEDS_PAYMENT', 409, 'Возврат превышает исходную оплату');
  const cumulative = payment.rewardMinor - (payment.rewardMinor ? reward(payment.amountMinor - refunded, payment.bps) : 0);
  const delta = cumulative + sum(prior.map(e => e.amountMinor));
  if (delta <= 0) return;
  state.ledger.push({ id: id(), businessKey: `refund:${refund.businessKey}`, paymentId: payment.id, eventId: refund.id,
    beneficiaryId: payment.beneficiaryId, kind: payment.kind, currency: 'RUB', amountMinor: -delta,
    policyVersion: payment.policyVersion, effectiveAt: refund.refundedAt, availableAt: payment.availableAt,
    reason: 'refund', originalEntryId: state.ledger.find(e => e.paymentId === payment.id && e.amountMinor > 0)?.id });
  const sent = state.allocations.some(a => a.obligationId === payment.id && a.transferId);
  const applied = payment.kind === 'credit' && state.reservations.some(r => r.actorId === payment.beneficiaryId && r.state === 'success');
  if (sent || applied) state.exceptions.push({ id: id(), type: sent ? 'post_sent_refund' : 'applied_credit_refund',
    paymentId: payment.id, refundId: refund.id, beneficiaryId: payment.beneficiaryId, amountMinor: delta,
    kind: payment.kind, createdAt: state.clock, explanation: 'Исходный перевод/применение сохранён; требуется сверка, автоматического взаимозачёта нет' });
}
export function fixtureEvent(state, event, policyId) {
  assert(event.provider === (state.mode === 'real' ? 'yookassa' : 'fixture'), 'PROVIDER_UNAVAILABLE', 400);
  validateEvent(event);
  assert(Date.parse(event.type === 'payment' ? event.paidAt : event.refundedAt) <= Date.parse(state.clock));
  const businessKey = eventKey(event), inputHash = hash(event);
  const list = event.type === 'payment' ? state.payments : state.refunds;
  const previous = list.find(p => p.businessKey === businessKey);
  if (previous) { assert(previous.inputHash === inputHash, 'BUSINESS_KEY_CONFLICT', 409, 'Событие с этим идентификатором уже содержит другие данные'); return previous.result; }
  assert(state.mode === 'real' || state.payments.length + state.refunds.length < 2000, 'DEMO_LIMIT', 429, 'Лимит событий демосреды');
  if (event.type === 'refund') {
    const paymentKey = `${event.provider}/${event.accountId}/${event.paymentId}`;
    const payment = state.payments.find(p => p.businessKey === paymentKey);
    const record = { ...event, id: id(), businessKey, paymentKey, inputHash };
    record.result = { eventId: record.id, status: payment ? 'refunded' : 'pending_payment', paymentId: payment?.id ?? null };
    state.refunds.push(record);
    if (payment) { reverse(state, payment, record); sourceChanged(state); }
    return record.result;
  }
  assert(state.actors.some(a => a.id === event.beneficiaryId), 'NOT_FOUND', 404, 'Получатель не найден');
  const currentPolicy = policyId ? state.policies.find(p=>p.id===policyId && p.kind===event.kind) : state.policies.findLast(p => p.kind === event.kind);
  assert(currentPolicy,'POLICY_REQUIRED',409);
  const resolved = attribution(state, event, currentPolicy);
  const record = { ...event, id: id(), businessKey, inputHash, attribution: resolved, currency: 'RUB',
    policyVersion: currentPolicy.version, bps: currentPolicy.bps, policyId: currentPolicy.id,
    effectiveAt: iso(event.paidAt), availableAt: addDays(event.paidAt, currentPolicy.holdDays),
    rewardMinor: resolved.eligible ? reward(event.amountMinor, currentPolicy.bps) : 0 };
  record.result = { paymentId: record.id, rewardMinor: record.rewardMinor, kind: record.kind, policyVersion: record.policyVersion,
    attribution: resolved, status: record.rewardMinor ? 'accrued' : 'no_reward' };
  state.payments.push(record);
  if (record.rewardMinor) state.ledger.push({ id: id(), businessKey: `payment:${businessKey}`, paymentId: record.id, eventId: record.id,
    beneficiaryId: record.beneficiaryId, kind: record.kind, currency: 'RUB', amountMinor: record.rewardMinor,
    effectiveAt: record.effectiveAt, availableAt: record.availableAt, policyVersion: record.policyVersion, reason: 'confirmed_payment' });
  // Apply pending facts in arrival order so cumulative rounding creates one immutable delta per refund.
  const pending = state.refunds.filter(r => r.paymentKey === businessKey);
  if (pending.length) {
    const all = state.refunds;
    state.refunds = all.filter(r => r.paymentKey !== businessKey);
    for (const refund of pending) { state.refunds.push(refund); reverse(state, record, refund); }
    state.refunds = all;
  }
  sourceChanged(state);
  return record.result;
}
