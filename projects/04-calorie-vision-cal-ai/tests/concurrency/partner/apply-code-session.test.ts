// AC-partner-codes-and-cabinet-6, NFR-partner-codes-and-cabinet-1: разделяемый ресурс —
// attribution-строка ОДНОЙ сессии — под настоящей конкуренцией Postgres, не
// последовательно (`shared-resource-verification.md`: последовательный тест зеленеет и
// без сериализации). Два РАЗНЫХ кода одной сессией одновременно: ровно один `applied`,
// один `conflict`, РОВНО одна строка `attribution`, никогда `23505` (уникальность
// нарушения) наружу.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { applyPartnerCode } from '../../../apps/api/src/partner/apply-partner-code.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
const logger = createLogger({ service: 'test', sink: () => {} });

beforeAll(async () => {
  pool = await migratedPool('n4-tests-apply-code-session-parallel');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('конкурентное применение одной сессией (AC-6)', () => {
  it('два РАЗНЫХ кода одновременно дают ровно один applied и один conflict; РОВНО одна attribution; ни один вызов не падает 23505', async () => {
    const partner = await seedPartner(pool, 'liza');
    const codeA = await seedPartnerCode(pool, partner.partnerId, 'RACEA111');
    const codeB = await seedPartnerCode(pool, partner.partnerId, 'RACEB222');
    const session = await seedDeviceSession(pool, 'ac6');

    const [resultA, resultB] = await Promise.allSettled([
      applyPartnerCode({ rawCode: codeA.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'ra' }, { pool, logger }),
      applyPartnerCode({ rawCode: codeB.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: '203.0.113.0/24', requestId: 'rb' }, { pool, logger }),
    ]);

    // Ни один вызов не завершается необработанной ошибкой уникальности (23505) — оба
    // settled как fulfilled, sessionLock сериализует, а не даёт двум INSERT столкнуться.
    expect(resultA.status).toBe('fulfilled');
    expect(resultB.status).toBe('fulfilled');

    const outcomes = [resultA, resultB].map((r) => (r.status === 'fulfilled' ? r.value.outcome : 'rejected-with-throw'));
    expect(outcomes.filter((o) => o === 'applied')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'conflict')).toHaveLength(1);

    const rows = await pool.query('SELECT count(*)::int AS n FROM attribution WHERE device_session_id = $1', [session.id]);
    expect(rows.rows[0]?.n).toBe(1);

    const events = await pool.query("SELECT count(*)::int AS n FROM growth_event WHERE type = 'code_applied' AND device_session_id = $1", [session.id]);
    expect(events.rows[0]?.n).toBe(1); // событие пишется РОВНО при applied (FR-5)
  }, 30_000);
});
