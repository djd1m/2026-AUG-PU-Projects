// КОНКУРЕНТНЫЙ прогон квоты (AC-foundation-9, NFR-foundation-1).
//
// ЭТОТ тест и есть проверка атомарности. Последовательный прогон зеленеет и при
// `INSERT … ON CONFLICT … WHERE used < limit`, и при «прочитать, потом записать»:
// во втором случае две попытки, пришедшие ОДНОВРЕМЕННО, обе читают `used = 9` и обе
// пишут `10` — одиннадцатый скан проходит, и это видно только здесь.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { checkAndConsumeQuota } from '../../apps/api/src/quota/check-and-consume.js';
import { moscowDay } from '../../apps/api/src/quota/keys.js';
import { migratedPool, seedSession, truncateAll } from '../helpers/db.js';

const LIMIT = 10;
const LIMITS = { scanLimitUser: LIMIT, scanLimitDay: 3000, escalationLimitDay: 600 };
const POOL_SIZE = 10;

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-quota-parallel');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('квота под конкуренцией', () => {
  it('двадцать одновременных попыток при пределе десять дают ровно десять успехов', async () => {
    const session = await seedSession(pool, 'parallel-main');

    const attempts = Array.from({ length: 20 }, () =>
      checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'primary', limits: LIMITS }),
    );
    const decisions = await Promise.all(attempts);

    const granted = decisions.filter((decision) => decision.outcome === 'granted');
    const refused = decisions.filter((decision) => decision.outcome === 'refused');

    expect(granted).toHaveLength(LIMIT);
    expect(refused).toHaveLength(10);
    for (const decision of refused) {
      expect(decision.outcome === 'refused' ? decision.scope : undefined).toBe('user');
    }

    const counters = await pool.query<{ scope: string; scope_key: string; used: number }>(
      'SELECT scope::text AS scope, scope_key, used FROM scan_quota_counter WHERE day = $1',
      [moscowDay()],
    );
    const bySession = counters.rows.find((row) => row.scope === 'user' && row.scope_key === session.id);
    const byGlobal = counters.rows.find((row) => row.scope === 'global');

    // Ни одна попытка не потеряна и не посчитана дважды.
    expect(bySession?.used).toBe(LIMIT);
    // Отказавшие попытки НЕ увеличили общий счётчик: транзакция откатилась целиком.
    expect(byGlobal?.used).toBe(LIMIT);
  }, 60_000);

  it('соседняя сессия не блокируется чужой квотой и пул не переполняется', async () => {
    const saturating = await seedSession(pool, 'parallel-saturating');
    const neighbour = await seedSession(pool, 'parallel-neighbour');

    let peak = 0;
    const watch = setInterval(() => {
      // Занятость пула наблюдается ВО ВРЕМЯ прогона: «сколько было занято потом» —
      // это уже не измерение конкуренции.
      peak = Math.max(peak, pool.totalCount - pool.idleCount);
    }, 5);

    const mixed = [
      ...Array.from({ length: 20 }, () =>
        checkAndConsumeQuota(pool, { sessionId: saturating.id, ipPrefix: '203.0.113.0/24', reason: 'primary', limits: LIMITS }),
      ),
      // Добросовестный сосед: ДРУГАЯ сессия и ДРУГАЯ сеть — механизм не имеет права
      // наказывать его за чужое насыщение.
      ...Array.from({ length: 5 }, () =>
        checkAndConsumeQuota(pool, { sessionId: neighbour.id, ipPrefix: '198.51.100.0/24', reason: 'primary', limits: LIMITS }),
      ),
    ];
    const decisions = await Promise.all(mixed);
    clearInterval(watch);

    expect(decisions.slice(0, 20).filter((d) => d.outcome === 'granted')).toHaveLength(LIMIT);
    const neighbourDecisions = decisions.slice(20);
    expect(neighbourDecisions.every((decision) => decision.outcome === 'granted')).toBe(true);

    // Число одновременно занятых соединений не растёт с числом ожидающих: 25 попыток
    // против пула в 10 не открывают 25 соединений.
    expect(peak).toBeLessThanOrEqual(POOL_SIZE);
    expect(pool.totalCount).toBeLessThanOrEqual(POOL_SIZE);
  }, 60_000);

  it('двадцать одновременных эскалаций при остатке один дают ровно один успех', async () => {
    // ЧЕТВЁРТЫЙ ключ проверяется ОТДЕЛЬНО: зелёный тест на трёх ключах не говорит о нём
    // ничего, а его исчерпание означает «дорогая модель сегодня недоступна».
    const session = await seedSession(pool, 'parallel-escalation');
    const limits = { ...LIMITS, scanLimitUser: 1000, scanLimitDay: 3000, escalationLimitDay: 1 };

    const decisions = await Promise.all(
      Array.from({ length: 20 }, () =>
        checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'escalation', limits }),
      ),
    );

    expect(decisions.filter((decision) => decision.outcome === 'granted')).toHaveLength(1);
    const refused = decisions.filter((decision) => decision.outcome === 'refused');
    expect(refused).toHaveLength(19);
    expect(refused.every((decision) => (decision.outcome === 'refused' ? decision.scope : '') === 'escalation')).toBe(true);

    const escalation = await pool.query<{ used: number }>(
      "SELECT used FROM scan_quota_counter WHERE scope = 'escalation' AND day = $1",
      [moscowDay()],
    );
    expect(escalation.rows[0]?.used).toBe(1);
  }, 60_000);
});
