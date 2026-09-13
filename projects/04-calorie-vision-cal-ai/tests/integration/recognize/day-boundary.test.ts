// AC-scan-pipeline-26 (правка RV-scan-pipeline-14) — граница суток на РЕАЛЬНОМ Postgres:
// счётчик дня D не растёт, счётчик дня D+1 получает списание, `reset_at` указывает на
// полночь D+1→D+2. Прежний сценарий (60 с, lease_fence=2) АРХИТЕКТУРНО НЕДОСТИЖИМ при
// бюджете задачи 30 с — см. `01_specification.md` AC-26 (правка) и квитанцию Попытки 3.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { checkAndConsumeQuota } from '@n4/db';
import { moscowDay } from '@n4/db';
import { nextMoscowMidnight } from '../../../apps/api/src/routes/scans.js';
import { migratedPool, seedSession, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-day-boundary');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('граница суток: списание квоты В МОМЕНТ ВЫЗОВА, а не в момент created_at (AC-scan-pipeline-26)', () => {
  it('момент ДО полуночи Europe/Moscow (день D) и момент ПОСЛЕ (день D+1) пишутся в РАЗНЫЕ строки счётчика', async () => {
    const session = await seedSession(pool, 'day-boundary');
    const limits = { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1000 };

    // 23:59:59.500 Europe/Moscow (UTC+3, без перехода на летнее время) 12 сентября 2026 —
    // POST/первый заход, day(created_at) = день D.
    const beforeMidnight = new Date('2026-09-12T20:59:59.500Z');
    const postDecision = await checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'primary', limits, at: beforeMidnight });
    expect(postDecision.outcome).toBe('granted');
    expect(postDecision.day).toBe('2026-09-12');

    // 00:00:00.200 Europe/Moscow 13 сентября — момент списания шага 3 recognize-scan.ts
    // (ПОСЛЕ нормализации 700 мс), day(now()) = день D+1 ≠ day(created_at) = день D.
    const afterMidnight = new Date('2026-09-12T21:00:00.200Z');
    const day = moscowDay(afterMidnight);
    expect(day).toBe('2026-09-13'); // подтверждает, что момент ДЕЙСТВИТЕЛЬНО день D+1

    const secondDecision = await checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'primary', limits, at: afterMidnight });
    expect(secondDecision.outcome).toBe('granted');
    expect(secondDecision.day).toBe('2026-09-13');

    // Счётчик дня D остаётся РОВНО тем, что дал POST — НЕ увеличен повторно.
    const dayDCounter = await pool.query<{ used: number }>("SELECT used FROM scan_quota_counter WHERE scope = 'global' AND day = '2026-09-12'");
    expect(dayDCounter.rows[0]?.used).toBe(1);

    // Счётчик дня D+1 получил СВОЁ, отдельное списание — начал с нуля, теперь 1.
    const dayD1Counter = await pool.query<{ used: number }>("SELECT used FROM scan_quota_counter WHERE scope = 'global' AND day = '2026-09-13'");
    expect(dayD1Counter.rows[0]?.used).toBe(1);

    // reset_at (используемый маршрутом при отказе) указывает на полночь D+1→D+2 ОТ момента ПОСЛЕ полуночи.
    const resetAt = nextMoscowMidnight(afterMidnight);
    expect(resetAt).toBe('2026-09-13T21:00:00.000Z'); // 00:00:00 Europe/Moscow 14 сентября = 21:00 UTC 13 сентября
  }, 20_000);
});
