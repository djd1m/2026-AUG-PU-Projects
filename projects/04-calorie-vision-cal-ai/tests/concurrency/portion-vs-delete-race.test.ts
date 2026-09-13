// Гонка set_portion×delete на одной записи (AC-diary-and-streak-17,
// `.claude/rules/shared-resource-verification.md`). Оба возможных порядка ФИКСАЦИИ в базе
// проверяются ОТДЕЛЬНО, с принудительной задержкой одной из веток через удерживаемую блокировку
// строки — а не полагаясь на случайное планирование ОС (04_refinement.md, «Конкурентные
// сценарии»). Тот же приём, что `tests/integration/account-delete.test.ts` (RV-03): третий
// клиент держит `FOR UPDATE` на строке, обе операции блокируются на НЕЙ, порядок, в котором они
// встали в очередь ДО освобождения лока, определяет порядок фиксации.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool, DbClient } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { deviceSession, grantConsent, patchDiary, riceItem, seedRecognition } from '../helpers/diary.js';
import { deleteDiaryEntry } from '../../apps/api/src/diary/delete-diary-entry.js';
import { setDiaryEntryPortion } from '../../apps/api/src/diary/set-diary-entry-portion.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-portion-vs-delete-race');
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

async function confirmedEntry(ip: string, massG: number): Promise<{ ownerKey: string; entryId: string }> {
  const { token, sessionId } = await deviceSession(app, pool, ip);
  await grantConsent(app, token);
  const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(massG)] });
  const confirmed = await patchDiary(app, token, recognitionId, { op: 'confirm' });
  const entryId = (confirmed.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id;
  return { ownerKey: sessionId, entryId };
}

/** Число бэкендов, реально заблокированных на локе (а не просто выполняющихся). */
async function lockWaiterCount(): Promise<number> {
  const result = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_stat_activity
     WHERE wait_event_type = 'Lock' AND pid != pg_backend_pid() AND datname = current_database()`,
  );
  return result.rows[0]?.n ?? 0;
}

/** Ждёт, пока число заблокированных бэкендов достигнет `atLeast`, БЕЗ фиксированной паузы. */
async function waitForLockWaiters(atLeast: number, deadlineMs = 5_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if ((await lockWaiterCount()) >= atLeast) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`не дождались ${atLeast} заблокированных бэкендов`);
}

describe('конкурентные set_portion и delete на одной записи', () => {
  it('конкурентные правка и удаление одной записи не теряют и не воскрешают данные при любом порядке фиксации', async () => {
    // ─── Порядок (а): delete фиксируется ПЕРВЫМ ────────────────────────────────────────────
    {
      const { ownerKey, entryId } = await confirmedEntry('203.0.113.110', 250);
      const lockClient: DbClient = await pool.connect();
      try {
        await lockClient.query('BEGIN');
        await lockClient.query('SELECT id FROM diary_entry WHERE id = $1 FOR UPDATE', [entryId]);

        // delete встаёт в очередь ПЕРВЫМ — обе его операции (UPDATE deleted_at, затем пересчёт
        // в ТОЙ ЖЕ транзакции) выполняются в одном клиенте `withTransaction`, первая же упирается
        // в удерживаемый лок.
        const deletePromise = deleteDiaryEntry(pool, entryId, ownerKey);
        await waitForLockWaiters(1);

        // set_portion встаёт в очередь ВТОРЫМ — его собственный `SELECT` без `FOR UPDATE`
        // проходит сразу (видит ещё не удалённую строку по MVCC-снимку), а вот UPDATE_ENTRY
        // блокируется на той же строке.
        const portionPromise = setDiaryEntryPortion({ pool, ownerKey, entryId, index: 0, massG: 100 });
        await waitForLockWaiters(2);

        await lockClient.query('COMMIT'); // освобождаем лок — очередь разрешается в порядке прихода

        const [deleteResult, portionResult] = await Promise.all([deletePromise, portionPromise]);

        expect(deleteResult.outcome).toBe('deleted');
        // (а) из спецификации: set_portion получает 404 ЛИБО 409 (запись уже удалена), и НЕ
        // изменяет удалённую строку.
        expect(['already_deleted', 'not_found']).toContain(portionResult.outcome);
      } finally {
        lockClient.release();
      }

      const row = await pool.query<{ deleted_at: Date | null; items: Array<{ mass_g: number }> }>(
        'SELECT deleted_at, items FROM diary_entry WHERE id = $1',
        [entryId],
      );
      expect(row.rows[0]?.deleted_at).not.toBeNull(); // удалённая запись НЕ получила deleted_at = NULL обратно
      expect(row.rows[0]?.items[0]?.mass_g).toBe(250); // set_portion НЕ изменил удалённую строку
    }

    // ─── Порядок (б): set_portion фиксируется ПЕРВЫМ ───────────────────────────────────────
    {
      const { ownerKey, entryId } = await confirmedEntry('203.0.113.111', 250);
      const lockClient: DbClient = await pool.connect();
      try {
        await lockClient.query('BEGIN');
        await lockClient.query('SELECT id FROM diary_entry WHERE id = $1 FOR UPDATE', [entryId]);

        // set_portion встаёт в очередь ПЕРВЫМ на этот раз.
        const portionPromise = setDiaryEntryPortion({ pool, ownerKey, entryId, index: 0, massG: 100 });
        await waitForLockWaiters(1);

        const deletePromise = deleteDiaryEntry(pool, entryId, ownerKey);
        await waitForLockWaiters(2);

        await lockClient.query('COMMIT');

        const [portionResult, deleteResult] = await Promise.all([portionPromise, deletePromise]);

        // (б) из спецификации: запись обновлена, а delete удаляет ОБНОВЛЁННУЮ запись и
        // пересчитывает итог по НОВОЙ порции.
        expect(portionResult.outcome).toBe('updated');
        expect(deleteResult.outcome).toBe('deleted');
      } finally {
        lockClient.release();
      }

      const row = await pool.query<{ deleted_at: Date | null; items: Array<{ mass_g: number }> }>(
        'SELECT deleted_at, items FROM diary_entry WHERE id = $1',
        [entryId],
      );
      expect(row.rows[0]?.deleted_at).not.toBeNull();
      // (100/100) × 130 = 130 ккал — delete удалил запись С НОВОЙ массой, не с исходной 250.
      expect(row.rows[0]?.items[0]?.mass_g).toBe(100);
    }

    // Ни при каком из двух порядков ни один из двух вызовов не завершился исключением (500) —
    // оба `await Promise.all` выше вернулись бы отклонённым промисом, если бы завершение было
    // ошибкой, а не структурированным исходом.
  }, 30_000);
});
