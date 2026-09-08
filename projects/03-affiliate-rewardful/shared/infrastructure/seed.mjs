import { id, policy } from '../domain/common.mjs';
import { fixtureEvent } from '../domain/events.mjs';

export const SEED_VERSION = 'n3-fixture-v1';
export const DEMO_CLOCK = '2026-09-03T12:00:00.000Z';
export function seed(runId) {
  const actors = [
    { id: id(), role: 'merchant', name: 'Владелец Круга' },
    { id: id(), role: 'partner', name: 'Анна', promoCode: 'ANNA20' },
    { id: id(), role: 'partner', name: 'Илья', promoCode: 'ILYA20' },
    { id: id(), role: 'customer', name: 'Мария', promoCode: 'MARIA20' },
  ];
  const state = { runId, seedVersion: SEED_VERSION, clock: DEMO_CLOCK, sourceVersion: 1, actors,
    policies: ['cash', 'credit'].map((kind, i) => policy({ kind, bps: 2000, windowDays: 30, holdDays: 7, recurring: true }, i + 1, DEMO_CLOCK)),
    payments: [], refunds: [], ledger: [], registries: [], approvals: [], allocations: [], transfers: [], exceptions: [], reconciliations: [],
    reservations: [], invoices: [{ id: id(), actorId: actors[3].id, amountMinor: 150000, currency: 'RUB', dueDate: '2026-09-05' }],
    enrollments: [], grants: [], tasks: [], audit: [] };
  function payment(objectId, actor, amountMinor, paidAt, channel = 'promo') {
    return { type: 'payment', provider: 'fixture', accountId: 'demo', objectId, verified: true, status: 'confirmed',
      customerId: `referred-${objectId}`, beneficiaryId: actor.id, kind: actor.role === 'customer' ? 'credit' : 'cash', amountMinor, paidAt,
      [channel]: channel === 'promo' ? { code: actor.promoCode, attributedAt: '2026-08-10T12:00:00.000Z' } :
        { beneficiaryId: actor.id, attributedAt: '2026-08-10T12:00:00.000Z' } };
  }
  const initial = [payment('anna-eligible', actors[1], 100000, '2026-08-15T12:00:00.000Z'),
    payment('ilya-eligible', actors[2], 200000, '2026-08-17T12:00:00.000Z', 'cookie'),
    payment('anna-held', actors[1], 50000, '2026-08-31T12:00:00.000Z'),
    payment('maria-credit', actors[3], 150000, '2026-08-20T12:00:00.000Z'),
    payment('anna-refunded', actors[1], 50000, '2026-08-18T12:00:00.000Z')];
  for (const event of initial) fixtureEvent(state, event);
  fixtureEvent(state, { type: 'refund', provider: 'fixture', accountId: 'demo', objectId: 'anna-refund-full',
    paymentId: 'anna-refunded', verified: true, status: 'confirmed', amountMinor: 50000, refundedAt: '2026-08-25T12:00:00.000Z' });
  state.fixtureEvents = { payment: payment('additional-renewal', actors[1], 100000, '2026-08-24T12:00:00.000Z'),
    refund: { type: 'refund', provider: 'fixture', accountId: 'demo', objectId: 'eligible-partial-refund', paymentId: 'anna-eligible',
      verified: true, status: 'confirmed', amountMinor: 25000, refundedAt: DEMO_CLOCK } };
  return state;
}
