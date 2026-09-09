import { assert, object, sum, ownResource } from './common.mjs';
import { paymentNet, registryView } from './registry.mjs';

export function ownTarget(actor, input, targetField) {
  object(input, [targetField, 'actorId']);
  assert((input[targetField] === undefined || input[targetField] === actor.id) && (input.actorId === undefined || input.actorId === actor.id),
    'FORBIDDEN', 403, 'Доступны только собственные данные');
}
export function cashSummary(state, actorId) {
  const payments = state.payments.filter(p => p.kind === 'cash' && (!actorId || p.beneficiaryId === actorId));
  const transfers = state.transfers.filter(t => !actorId || t.partnerId === actorId);
  const amount = predicate => sum(payments.filter(predicate).map(p => paymentNet(state, p.id)));
  return { currency: 'RUB', accruedMinor: sum(payments.map(p => p.rewardMinor)),
    heldMinor: amount(p => p.availableAt > state.clock),
    availableMinor: amount(p => p.availableAt <= state.clock && !state.allocations.some(a => a.obligationId === p.id)),
    allocatedMinor: amount(p => state.allocations.some(a => a.obligationId === p.id && !a.transferId)),
    sentMinor: sum(transfers.map(t => t.amountMinor)),
    adjustmentMinor: sum(state.ledger.filter(e => e.kind === 'cash' && e.amountMinor < 0 && (!actorId || e.beneficiaryId === actorId)).map(e => e.amountMinor)),
    dueDate: state.mode === 'real' ? new Date(Date.UTC(new Date(state.clock).getUTCFullYear(),new Date(state.clock).getUTCMonth()+1,5)).toISOString().slice(0,10) : '2026-09-05', explanation: 'Ориентир — до 5-го следующего месяца. Отметка отправки не подтверждает зачисление.' };
}
export function partnerRead(state, actor, input = {}) {
  ownTarget(actor, input, 'partnerId');
  return { actor: { id: actor.id, role: actor.role, name: actor.name }, clock: state.clock, sourceVersion: state.sourceVersion,
    summary: cashSummary(state, actor.id), ledger: state.ledger.filter(e => e.beneficiaryId === actor.id && e.kind === 'cash'),
    payments: state.payments.filter(p => p.beneficiaryId === actor.id && p.kind === 'cash').map(p => ({ paymentId: p.id,
      amountMinor: p.amountMinor, rewardMinor: p.rewardMinor, policyVersion: p.policyVersion, attribution: p.attribution.channel,
      paidAt: p.paidAt, availableAt: p.availableAt })),
    policies: state.policies.filter(p => p.kind === 'cash'), transfers: state.transfers.filter(t => t.partnerId === actor.id),
    exceptions: state.exceptions.filter(e => e.beneficiaryId === actor.id), simulated: state.mode !== 'real' };
}
export function creditRead(state, actor, input = {}) {
  ownTarget(actor, input, 'customerId');
  const ledger = state.ledger.filter(e => e.kind === 'credit' && e.beneficiaryId === actor.id);
  const reservations = state.reservations.filter(r => r.actorId === actor.id);
  const invoice = state.invoices.find(i => i.actorId === actor.id) ?? null;
  const heldMinor = sum(ledger.filter(e => e.availableAt > state.clock).map(e => e.amountMinor));
  const earnedAvailable = sum(ledger.filter(e => e.availableAt <= state.clock).map(e => e.amountMinor));
  const reservedMinor = sum(reservations.filter(r => ['pending', 'unknown'].includes(r.state)).map(r => r.amountMinor));
  const appliedMinor = sum(reservations.filter(r => r.state === 'success').map(r => r.amountMinor));
  return { actor: { id: actor.id, role: actor.role, name: actor.name }, clock: state.clock, sourceVersion: state.sourceVersion,
    currency: 'RUB', heldMinor, availableMinor: Math.max(0, earnedAvailable - reservedMinor - appliedMinor), reservedMinor, appliedMinor,
    adjustmentMinor: Math.min(0, earnedAvailable - reservedMinor - appliedMinor), ledger, reservations,
    invoice: invoice ? { ...invoice, remainingMinor: invoice.amountMinor - appliedMinor, reservedMinor } : null,
    exceptions: state.exceptions.filter(e => e.beneficiaryId === actor.id),
    explanation: 'Бонус уменьшает следующий счёт подписки; это не денежная выплата. При неизвестном результате резерв сохраняется.', simulated: state.mode !== 'real' };
}
export function programRead(state, actor) {
  const kind = actor.role === 'customer' ? 'credit' : 'cash';
  const current = state.policies.findLast(p => p.kind === kind);
  const enrollment = state.enrollments.find(e => e.actorId === actor.id) ?? null;
  return { policy: current, version: current.version, policies: state.policies, enrollment,
    enrollmentUrl: '/join', payoutSchedule: 'До 5-го следующего месяца; срок зачисления не гарантируется',
    terms: 'Добровольное участие. Вознаграждение только за подтверждённые рекомендации. Саморефералы исключены.',
    branded: true, simulated: state.mode !== 'real' };
}
export function shareRead(state, actor) {
  const enrollment = state.enrollments.find(e => e.actorId === actor.id);
  assert(enrollment, 'ENROLLMENT_REQUIRED', 403, 'Сначала подтвердите участие в программе');
  return { actorId: actor.id, referralUrl: enrollment.referralUrl, promoCode: actor.promoCode,
    disclosure: 'Я могу получить вознаграждение за вашу подписку по этой рекомендации.',
    text: 'Попробуйте Круг — сервис рекомендаций для подписочного бизнеса.', branded: true, simulated: state.mode !== 'real' };
}
export function dashboard(state, actor) {
  return { actor: { id: actor.id, role: actor.role, name: actor.name }, clock: state.clock, seedVersion: state.seedVersion,
    sourceVersion: state.sourceVersion, policy: state.policies.findLast(p => p.kind === 'cash'), policies: state.policies,
    summary: cashSummary(state), partners: state.actors.filter(a => a.role === 'partner').map(a => ({ ...a, summary: cashSummary(state, a.id) })),
    payments: state.payments, refunds: state.refunds, ledger: state.ledger, registries: state.registries.map(a => registryView(state, a)),
    transfers: state.transfers, exceptions: state.exceptions, reconciliations: state.reconciliations,
    reservations: state.reservations, grants: state.grants, tasks: state.tasks, fixtureEvents: state.fixtureEvents,
    tariff: { name: state.mode === 'real' ? 'Реальная организация' : 'F1 synthetic', realBillingAvailable: false, branded: true }, policyConfigured: state.policyConfigured ?? [], simulated: state.mode !== 'real' };
}
