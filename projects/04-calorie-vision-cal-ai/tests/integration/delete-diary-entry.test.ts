// PATCH /api/v1/diary/{entry_id} { op: 'delete' } — DeleteDiaryEntry
// (FR-diary-and-streak-4, AC-diary-and-streak-9/10).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { deviceSession, getDiary, grantConsent, patchDiary, riceItem, seedRecognition } from '../helpers/diary.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-delete-diary-entry');
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

function todayMoscow(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function confirmedEntry(ip: string, massG = 250): Promise<{ token: string; entryId: string; sessionId: string }> {
  const { token, sessionId } = await deviceSession(app, pool, ip);
  await grantConsent(app, token);
  const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(massG)] });
  const confirmed = await patchDiary(app, token, recognitionId, { op: 'confirm' });
  const entryId = (confirmed.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id;
  return { token, entryId, sessionId };
}

describe('PATCH /api/v1/diary/{entry_id} { op: delete }', () => {
  it('удаление и пересчёт итога дня видны атомарно в одной транзакции', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.80');
    await grantConsent(app, token);
    const entryIds: string[] = [];
    for (const massG of [200, 200, 200]) {
      const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(massG)] });
      const confirmed = await patchDiary(app, token, recognitionId, { op: 'confirm' });
      entryIds.push((confirmed.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id);
    }
    // Три записи по (200/100)×130 = 260 ккал каждая — итог дня 780 до удаления.
    const beforeDelete = await getDiary(app, token, todayMoscow());
    expect((beforeDelete.json() as { data: { totals: { kcal: number } } }).data.totals.kcal).toBe(780);

    const [deletedId, ...remaining] = entryIds;
    const started = Date.now();
    const response = await patchDiary(app, token, deletedId as string, { op: 'delete' });
    const elapsedMs = Date.now() - started;

    expect(response.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(500);
    const body = response.json() as { data: { totals: { kcal: number } } };
    expect(body.data.totals.kcal).toBe(520); // без удалённой записи — расхождения с последующим GET нет

    const afterDelete = await getDiary(app, token, todayMoscow());
    const afterBody = afterDelete.json() as { data: { entries: unknown[]; totals: { kcal: number } } };
    expect(afterBody.data.entries).toHaveLength(2);
    expect(afterBody.data.entries.map((entry) => (entry as { entry_id: string }).entry_id).sort()).toEqual([...remaining].sort());
    expect(afterBody.data.totals.kcal).toBe(520);
  });

  it('повторное удаление уже удалённой записи отвечает 409', async () => {
    const { token, entryId } = await confirmedEntry('203.0.113.81');

    const first = await patchDiary(app, token, entryId, { op: 'delete' });
    expect(first.statusCode).toBe(200);
    const firstTotals = (first.json() as { data: { totals: { kcal: number } } }).data.totals;

    const second = await patchDiary(app, token, entryId, { op: 'delete' });
    expect(second.statusCode).toBe(409);
    expect((second.json() as { error: { code: string } }).error.code).toBe('already_deleted');

    // Итог не меняется повторно — не «минус ещё раз»: последующее чтение видит тот же итог.
    const after = await getDiary(app, token, todayMoscow());
    expect((after.json() as { data: { totals: { kcal: number } } }).data.totals.kcal).toBe(firstTotals.kcal);
  });

  it('чужая и несуществующая запись для delete неразличимы, 403 невозможен', async () => {
    const owner = await confirmedEntry('203.0.113.82');
    const stranger = await deviceSession(app, pool, '203.0.113.83');
    await grantConsent(app, stranger.token);

    const foreignResponse = await patchDiary(app, stranger.token, owner.entryId, { op: 'delete' });
    const missingResponse = await patchDiary(app, stranger.token, '00000000-0000-0000-0000-000000000000', { op: 'delete' });

    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(foreignResponse.json()).toEqual(missingResponse.json());
  });
});
