// КОНКУРЕНТНЫЙ прогон cadence (AC-pro-interest-and-limits-ui-8, `shared-resource-verification`).
//
// Последовательный тест (`tests/integration/interest.test.ts`, AC-7) зеленеет и при
// атомарной блокировке, и при «прочитать, потом записать»: два запроса, пришедшие ПОДРЯД,
// не проверяют гонку. Различает их только параллельный прогон — ровно тот же класс теста,
// что `tests/concurrency/quota-parallel.test.ts` фичи `foundation`.
//
// Испытание стража (`guard-must-be-able-to-fail.md`): этот тест был вручную прогнан против
// редакции `recordProInterest`, замененяющей `pg_advisory_xact_lock` + `SELECT … FOR UPDATE`
// на «прочитать без блокировки, потом вставить» — прогон дал БОЛЕЕ ОДНОЙ строки за сутки
// (красный); после восстановления блокировки — снова ровно одна строка (зелёный). Обе строки
// записаны в квитанцию Phase 3 (`docs/telemetry/.../receipts/impl-pro.md`).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { recordProInterest } from '../../apps/api/src/interest/record-pro-interest.js';
import { migratedPool, seedSession, truncateAll } from '../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-interest-cadence');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('cadence pro_interest под конкуренцией', () => {
  it('AC-8: десять одновременных отправок одного владельца дают ровно одну запись', async () => {
    const session = await seedSession(pool, 'interest-cadence-main');

    const attempts = Array.from({ length: 10 }, (_, index) =>
      recordProInterest(pool, {
        ownerKey: session.id,
        deviceSessionId: session.id,
        contact: `contact${index}@b.ru`,
        source: 'user_limit',
      }),
    );
    const outcomes = await Promise.all(attempts);

    const recorded = outcomes.filter((outcome) => outcome.outcome === 'recorded');
    const alreadyRecorded = outcomes.filter((outcome) => outcome.outcome === 'already_recorded');

    expect(recorded).toHaveLength(1);
    expect(alreadyRecorded).toHaveLength(9);

    const rows = await pool.query('SELECT id FROM pro_interest WHERE owner_key = $1', [session.id]);
    expect(rows.rowCount).toBe(1);
  }, 30_000);

  it('добросовестный сосед (другой owner_key) не блокируется конкуренцией за первого', async () => {
    const saturating = await seedSession(pool, 'interest-cadence-saturating');
    const neighbour = await seedSession(pool, 'interest-cadence-neighbour');

    const mixed = [
      ...Array.from({ length: 10 }, (_, index) =>
        recordProInterest(pool, {
          ownerKey: saturating.id,
          deviceSessionId: saturating.id,
          contact: `sat${index}@b.ru`,
          source: 'user_limit',
        }),
      ),
      recordProInterest(pool, {
        ownerKey: neighbour.id,
        deviceSessionId: neighbour.id,
        contact: 'neighbour@b.ru',
        source: 'user_limit',
      }),
    ];
    const outcomes = await Promise.all(mixed);

    expect(outcomes.slice(0, 10).filter((outcome) => outcome.outcome === 'recorded')).toHaveLength(1);
    expect(outcomes[10]?.outcome).toBe('recorded');

    const neighbourRows = await pool.query('SELECT id FROM pro_interest WHERE owner_key = $1', [neighbour.id]);
    expect(neighbourRows.rowCount).toBe(1);
  }, 30_000);
});
