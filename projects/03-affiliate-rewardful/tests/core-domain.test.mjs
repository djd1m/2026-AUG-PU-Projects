import test from 'node:test';
import assert from 'node:assert/strict';
import { reward, policy, safeTree } from '../shared/domain/common.mjs';
import { csvCell } from '../shared/domain/registry.mjs';
import { seed } from '../shared/infrastructure/seed.mjs';
import { fixtureEvent } from '../shared/domain/events.mjs';

test('SC-US-003-1 integer rounding preserves original reward under cumulative partial refunds', () => {
  assert.equal(reward(100000000, 10000), 100000000);
  assert.throws(() => reward(0.1, 2000));
  const s = seed('test'), event = { ...s.fixtureEvents.payment, objectId: 'round', amountMinor: 9 };
  const p = fixtureEvent(s, event);
  assert.equal(p.rewardMinor, 1);
  for (const [i, amountMinor] of [1, 1, 7].entries()) fixtureEvent(s, { ...s.fixtureEvents.refund, objectId: `round-r-${i}`, paymentId: 'round', amountMinor });
  assert.deepEqual(s.ledger.filter(e => e.paymentId === p.paymentId).map(e => e.amountMinor), [1, -1]);
});
test('schema boundary rejects prototype injection, unknown fields and unsafe policies; CSV neutralizes formulas', () => {
  assert.throws(() => safeTree(JSON.parse('{"__proto__":{"admin":true}}')));
  assert.throws(() => safeTree(Object.create({ admin: true })));
  assert.throws(() => policy({ kind: 'cash', bps: 2000, holdDays: 7, windowDays: 30, recurring: true, admin: true }, 1, 'now'));
  assert.equal(csvCell(' =SUM(A1)'), '"\' =SUM(A1)"');
  assert.equal(csvCell('Анна "А"'), '"Анна ""А"""');
});
