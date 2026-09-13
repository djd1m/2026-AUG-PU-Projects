// AC-partner-codes-and-cabinet-9, NFR-partner-codes-and-cabinet-1: anti-fraud блокирует
// на 51-м применении и переживает конкуренцию. Второй разделяемый ресурс фичи —
// anti-fraud-счётчик ОДНОГО кода — под codeLock сериализуется, поэтому 20 одновременных
// попыток при 45 засчитанных дают РОВНО одну блокировку, а не 20 (тот же класс проверки,
// что `escalation-parallel.test.ts` в `scan-pipeline`).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { applyPartnerCode } from '../../../apps/api/src/partner/apply-partner-code.js';
import { migratedPool, truncateAll } from '../../helpers/db.js';
import { seedCodeAppliedEvents, seedDeviceSession, seedPartner, seedPartnerCode } from '../../helpers/partner.js';

let pool: DbPool;
const logger = createLogger({ service: 'test', sink: () => {} });
const IP_PREFIX = '198.51.100.0/24';

beforeAll(async () => {
  pool = await migratedPool('n4-tests-antifraud-parallel');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('AC-9(а): 51-е применение блокирует код, последовательно', () => {
  it('код переходит в blocked/antifraud_ip_burst, 51-я попытка получает rejected(antifraud_ip_burst)', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'BURST111');
    await seedCodeAppliedEvents(pool, code.id, IP_PREFIX, 50);
    const session = await seedDeviceSession(pool, 'ac9a', { ipPrefix: IP_PREFIX });

    const outcome = await applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: IP_PREFIX, requestId: 'r51' }, { pool, logger });

    expect(outcome).toEqual({ outcome: 'rejected', reason: 'antifraud_ip_burst' });
    const codeRow = await pool.query<{ status: string; blocked_reason: string | null }>(
      'SELECT status::text AS status, blocked_reason::text AS blocked_reason FROM partner_code WHERE id = $1',
      [code.id],
    );
    expect(codeRow.rows[0]).toMatchObject({ status: 'blocked', blocked_reason: 'antifraud_ip_burst' });
  }, 30_000);
});

describe('AC-9(б): 20 одновременных применений с одного ip_prefix при исходных 45 засчитанных', () => {
  it('код блокируется РОВНО один раз; дополнительно принятых не более 6; итоговая причина блокировки одна', async () => {
    const partner = await seedPartner(pool, 'liza');
    const code = await seedPartnerCode(pool, partner.partnerId, 'BURST222');
    await seedCodeAppliedEvents(pool, code.id, IP_PREFIX, 45);

    const sessions = await Promise.all(
      Array.from({ length: 20 }, (_, i) => seedDeviceSession(pool, `ac9b-${i}`, { ipPrefix: IP_PREFIX })),
    );

    const results = await Promise.all(
      sessions.map((session, i) =>
        applyPartnerCode({ rawCode: code.code, source: 'explicit', deviceSessionId: session.id, ipPrefix: IP_PREFIX, requestId: `r${i}` }, { pool, logger }),
      ),
    );

    const applied = results.filter((r) => r.outcome === 'applied');
    const blockedNow = results.filter((r) => r.outcome === 'rejected' && r.reason === 'antifraud_ip_burst');

    // 50 - 45 + 1 отклонённое = ровно то, что даёт последовательная сериализация по codeLock.
    expect(applied.length).toBeLessThanOrEqual(6);
    expect(applied.length).toBeGreaterThan(0);
    expect(blockedNow.length).toBe(20 - applied.length);

    const codeRow = await pool.query<{ status: string; blocked_reason: string | null }>(
      'SELECT status::text AS status, blocked_reason::text AS blocked_reason FROM partner_code WHERE id = $1',
      [code.id],
    );
    expect(codeRow.rows[0]?.status).toBe('blocked');
    expect(codeRow.rows[0]?.blocked_reason).toBe('antifraud_ip_burst'); // РОВНО одна причина — блокировка не переписана 20 раз

    const totalApplied = await pool.query(
      "SELECT count(*)::int AS n FROM growth_event WHERE type = 'code_applied' AND partner_code_id = $1",
      [code.id],
    );
    // 45 исходных + принятые в этом прогоне.
    expect(totalApplied.rows[0]?.n).toBe(45 + applied.length);
  }, 30_000);
});
