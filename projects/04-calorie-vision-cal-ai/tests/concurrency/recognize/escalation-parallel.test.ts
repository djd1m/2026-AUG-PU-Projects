// AC-scan-pipeline-13: 20 одновременных решений об эскалации при остатке потолка `escalation`
// = 1 дают РОВНО один `granted`. Проверяется НЕ логика решения (это делает
// `recognize-scan.test.ts` с инъецированным `consumeQuota`), а АТОМАРНОСТЬ самого счётчика
// `scan_quota_counter(scope='escalation')` под настоящей конкуренцией Postgres —
// `shared-resource-verification.md`: последовательный тест зеленеет и при «прочитать-потом-
// записать», различает только конкурентный прогон.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { checkAndConsumeQuota } from '@n4/db';
import { migratedPool, seedSession, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-escalation-parallel');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('конкурентная эскалация: 20 при остатке потолка 1 (AC-scan-pipeline-13)', () => {
  it('РОВНО один вызов получает granted, used(scope=escalation) = 1, ни одна попытка не потеряна', async () => {
    const session = await seedSession(pool, 'escalation-parallel');
    const limits = { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1 };

    const attempts = Array.from({ length: 20 }, () =>
      checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'escalation', limits, at: new Date() }),
    );
    const results = await Promise.all(attempts);

    const granted = results.filter((r) => r.outcome === 'granted');
    const refused = results.filter((r) => r.outcome === 'refused');

    expect(granted).toHaveLength(1);
    expect(refused).toHaveLength(19);
    for (const r of refused) {
      if (r.outcome === 'refused') expect(r.scope).toBe('escalation');
    }

    const counter = await pool.query("SELECT used FROM scan_quota_counter WHERE scope = 'escalation'");
    expect(counter.rows).toHaveLength(1);
    expect(counter.rows[0]?.used).toBe(1);
  }, 30_000);
});
