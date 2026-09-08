import { assert, object, integer, str, id, ownResource } from './common.mjs';
import { creditRead } from './projections.mjs';

export function reserveCredit(state, actor, input) {
  object(input, ['amountMinor', 'invoiceId'], ['amountMinor', 'invoiceId']); integer(input.amountMinor, 1); str(input.invoiceId);
  const view = creditRead(state, actor);
  assert(view.invoice.id === input.invoiceId, 'NOT_FOUND', 404, 'Счёт не найден');
  assert(input.amountMinor <= view.availableMinor && input.amountMinor <= view.invoice.remainingMinor - view.reservedMinor,
    'INSUFFICIENT_CREDIT', 409, 'Доступного бонуса или остатка счёта недостаточно');
  const reservation = { id: id(), actorId: actor.id, invoiceId: input.invoiceId, amountMinor: input.amountMinor,
    currency: 'RUB', state: 'pending', createdAt: state.clock, transitions: [] };
  state.reservations.push(reservation);
  return { reservationId: reservation.id, ...reservation };
}
export function resolveCredit(state, input, operatorId) {
  object(input, ['reservationId', 'outcome'], ['reservationId', 'outcome']);
  assert(['success', 'failed', 'unknown'].includes(input.outcome)); str(input.reservationId);
  const reservation = ownResource(state.reservations, input.reservationId);
  if (['success', 'failed'].includes(reservation.state)) {
    assert(reservation.state === input.outcome, 'BILLING_CONFLICT', 409, 'Окончательный результат уже сохранён');
    return { reservationId: reservation.id, ...reservation };
  }
  if (reservation.state !== input.outcome) {
    reservation.state = input.outcome;
    reservation.transitions.push({ id: id(), state: input.outcome, at: state.clock, operatorId });
  }
  return { reservationId: reservation.id, ...reservation };
}
