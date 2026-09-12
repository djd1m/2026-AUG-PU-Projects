// Последовательный потолок (AC-foundation-8).
//
// ВАЖНО, ЧЕГО ЭТОТ ТЕСТ НЕ ДОКАЗЫВАЕТ: он зеленеет и при атомарном операторе, и при
// «прочитать, потом записать». Различает их только конкурентный прогон —
// tests/concurrency/quota-parallel.test.ts. Этот проверяет ДРУГОЕ: что отказ называет
// scope и что транзакция откатывается целиком.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { checkAndConsumeQuota } from '../../apps/api/src/quota/check-and-consume.js';
import { moscowDay } from '../../apps/api/src/quota/keys.js';
import { migratedPool, seedSession, truncateAll } from '../helpers/db.js';

const LIMITS = { scanLimitUser: 10, scanLimitDay: 3000, escalationLimitDay: 600 };

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-quota-seq');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function counter(scope: string, key: string): Promise<number | undefined> {
  const rows = await pool.query<{ used: number }>(
    'SELECT used FROM scan_quota_counter WHERE scope = $1::quota_scope AND scope_key = $2 AND day = $3',
    [scope, key, moscowDay()],
  );
  return rows.rows[0]?.used;
}

describe('последовательная квота', () => {
  it('одиннадцатая попытка получает refused с scope user', async () => {
    const session = await seedSession(pool, 'quota-seq');

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const decision = await checkAndConsumeQuota(pool, {
        sessionId: session.id,
        ipPrefix: '203.0.113.0/24',
        reason: 'primary',
        limits: LIMITS,
      });
      expect(decision.outcome, `попытка ${attempt}`).toBe('granted');
    }

    const refused = await checkAndConsumeQuota(pool, {
      sessionId: session.id,
      ipPrefix: '203.0.113.0/24',
      reason: 'primary',
      limits: LIMITS,
    });

    expect(refused.outcome).toBe('refused');
    // Без названного scope «кончились сканы» и «кончились эскалации» неотличимы.
    expect(refused.outcome === 'refused' ? refused.scope : undefined).toBe('user');

    expect(await counter('user', session.id)).toBe(10);
    // Одиннадцатая попытка НЕ увеличила общий счётчик: транзакция откатилась целиком,
    // а не «откатилась встречным декрементом».
    expect(await counter('global', 'all')).toBe(10);
  });

  it('эскалация списывает ЧЕТВЁРТЫЙ ключ, и его исчерпание не трогает остальные', async () => {
    const session = await seedSession(pool, 'quota-escalation');
    const limits = { ...LIMITS, escalationLimitDay: 1 };

    const first = await checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'escalation', limits });
    expect(first.outcome).toBe('granted');
    expect(await counter('escalation', 'all')).toBe(1);

    const second = await checkAndConsumeQuota(pool, { sessionId: session.id, ipPrefix: '203.0.113.0/24', reason: 'escalation', limits });
    expect(second.outcome).toBe('refused');
    expect(second.outcome === 'refused' ? second.scope : undefined).toBe('escalation');

    // Отказ по четвёртому ключу откатывает ВСЮ попытку: три общих счётчика остались на 1.
    expect(await counter('user', session.id)).toBe(1);
    expect(await counter('user', '203.0.113.0/24')).toBe(1);
    expect(await counter('global', 'all')).toBe(1);
  });

  it('ключей у анонима ДВА: исчерпание по адресу отказывает новой сессии', async () => {
    const limits = { ...LIMITS, scanLimitUser: 2 };
    const first = await seedSession(pool, 'quota-ip-1');
    const second = await seedSession(pool, 'quota-ip-2');

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const decision = await checkAndConsumeQuota(pool, { sessionId: first.id, ipPrefix: '203.0.113.0/24', reason: 'primary', limits });
      expect(decision.outcome).toBe('granted');
    }

    // Смена одного ключа (новая сессия) НЕ обнуляет защиту: второй ключ — адрес.
    const refused = await checkAndConsumeQuota(pool, { sessionId: second.id, ipPrefix: '203.0.113.0/24', reason: 'primary', limits });
    expect(refused.outcome).toBe('refused');
    expect(refused.outcome === 'refused' ? refused.scope : undefined).toBe('user');
  });
});
