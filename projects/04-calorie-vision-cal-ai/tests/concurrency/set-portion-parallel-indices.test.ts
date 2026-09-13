// Две конкурентные правки РАЗНЫХ позиций одной записи (RV-diary-and-streak-03,
// review-report.md, `.claude/rules/shared-resource-verification.md`). Последовательный тест
// («правим индекс 0, потом индекс 1») зеленеет и при устаревшей реализации — оба правки видны
// только тогда, когда они РЕАЛЬНО конкурируют за ОДНУ строку. Барьер — тот же приём, что
// `tests/concurrency/portion-vs-delete-race.test.ts`: третий клиент держит `FOR UPDATE` на
// строке, обе правки блокируются на НЕЙ, порядок постановки в очередь решает порядок фиксации.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbClient, DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { deviceSession, grantConsent, patchDiary, riceItem, seedRecognition } from '../helpers/diary.js';
import { setDiaryEntryPortion } from '../../apps/api/src/diary/set-diary-entry-portion.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-set-portion-parallel-indices');
  app = buildServer({ config: testApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function lockWaiterCount(): Promise<number> {
  const result = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
     WHERE wait_event_type = 'Lock' AND pid != pg_backend_pid() AND datname = current_database()`,
  );
  return result.rows[0]?.n ?? 0;
}

async function waitForLockWaiters(atLeast: number, deadlineMs = 5_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if ((await lockWaiterCount()) >= atLeast) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`не дождались ${atLeast} заблокированных бэкендов`);
}

describe('конкурентные set_portion на РАЗНЫХ индексах одной записи', () => {
  it('обе правки применяются — ни одна не теряется и не откатывает соседнюю позицию', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.120');
    await grantConsent(app, token);
    // Запись с ДВУМЯ позициями: индекс 0 (рис), индекс 1 (тоже рис — снимок не важен, важна
    // независимость индексов).
    const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(200), riceItem(200)] });
    const confirmed = await patchDiary(app, token, recognitionId, { op: 'confirm' });
    const entryId = (confirmed.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id;

    const lockClient: DbClient = await pool.connect();
    try {
      await lockClient.query('BEGIN');
      await lockClient.query('SELECT id FROM diary_entry WHERE id = $1 FOR UPDATE', [entryId]);

      // Правка индекса 0 встаёт в очередь ПЕРВОЙ.
      const editIndex0 = setDiaryEntryPortion({ pool, ownerKey: sessionId, entryId, index: 0, massG: 150 });
      await waitForLockWaiters(1);

      // Правка индекса 1 встаёт в очередь ВТОРОЙ — её собственный `SELECT … FOR UPDATE`
      // блокируется на той же строке (RV-03: раньше это был обычный `SELECT`, не блокирующий
      // ничего, и обе правки читали один и тот же старый массив).
      const editIndex1 = setDiaryEntryPortion({ pool, ownerKey: sessionId, entryId, index: 1, massG: 300 });
      await waitForLockWaiters(2);

      await lockClient.query('COMMIT'); // освобождаем — очередь разрешается по порядку прихода

      const [result0, result1] = await Promise.all([editIndex0, editIndex1]);
      expect(result0.outcome).toBe('updated');
      expect(result1.outcome).toBe('updated');
    } finally {
      lockClient.release();
    }

    // Обе массы применены: 150 г на индексе 0 И 300 г на индексе 1 — ни одна не откатилась к
    // исходным 200. Под старым дефектом второй UPDATE переписывал items ЦЕЛИКОМ поверх своей
    // устаревшей копии, и один из двух индексов возвращался бы к 200.
    const row = await pool.query<{ items: Array<{ mass_g: number }>; kcal_total: number }>(
      'SELECT items, kcal_total FROM diary_entry WHERE id = $1',
      [entryId],
    );
    const items = row.rows[0]?.items ?? [];
    expect(items[0]?.mass_g).toBe(150);
    expect(items[1]?.mass_g).toBe(300);
    // Итог записи пересчитан по ОБЕИМ актуальным массам: (150/100)×130 + (300/100)×130 = 195+390=585.
    expect(row.rows[0]?.kcal_total).toBe(585);
  }, 30_000);
});
