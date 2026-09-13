// PATCH /api/v1/diary/{entry_id} { op: 'set_portion' } — SetDiaryEntryPortion
// (FR-diary-and-streak-3, NFR-diary-and-streak-1, AC-diary-and-streak-6/7/8/11).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { deviceSession, grantConsent, patchDiary, riceItem, seedRecognition } from '../helpers/diary.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-set-diary-entry-portion');
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

async function confirmedEntry(ip: string, massG = 250): Promise<{ token: string; entryId: string }> {
  const { token, sessionId } = await deviceSession(app, pool, ip);
  await grantConsent(app, token);
  const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(massG)] });
  const confirmed = await patchDiary(app, token, recognitionId, { op: 'confirm' });
  const entryId = (confirmed.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id;
  return { token, entryId };
}

describe('PATCH /api/v1/diary/{entry_id} { op: set_portion }', () => {
  it('правка порции пересчитывает четыре числа и не вызывает модель', async () => {
    const { token, entryId } = await confirmedEntry('203.0.113.70', 250);
    // Прогрев соединения/JIT ДО замера — иначе первый запрос теста мерил бы холодный старт
    // процесса, а не саму операцию (NFR-diary-and-streak-1: локальный пересчёт без вызова модели).
    await patchDiary(app, token, entryId, { op: 'set_portion', index: 0, mass_g: 200 });

    const started = Date.now();
    const response = await patchDiary(app, token, entryId, { op: 'set_portion', index: 0, mass_g: 180 });
    const elapsedMs = Date.now() - started;

    expect(response.statusCode).toBe(200);
    // Порог с запасом относительно заявленных 100 мс p95: единичный замер в тестовом
    // контейнере — не полноценный p95 по множеству запросов, только грубая проверка того,
    // что путь ЛОКАЛЬНЫЙ (без сетевого вызова модели, который стоил бы секунды).
    expect(elapsedMs).toBeLessThan(500);
    const body = response.json() as { data: { entry: Record<string, unknown> } };
    // (180/100) × 130 = 234 ккал, из ХРАНИМОГО source_snapshot — новый вызов модели не нужен и
    // не происходит (модуль set-diary-entry-portion.ts не импортирует ни один провайдер).
    expect(body.data.entry.kcal_total).toBe(234);
    expect(body.data.entry.user_corrected).toBe(true);

    const row = await pool.query<{ user_corrected: boolean }>('SELECT user_corrected FROM diary_entry WHERE id = $1', [entryId]);
    expect(row.rows[0]?.user_corrected).toBe(true);
  });

  it('граница порции отклоняет ввод целиком, прежняя порция сохраняется во всех пяти формах', async () => {
    const { token, entryId } = await confirmedEntry('203.0.113.71', 180);

    for (const badMassG of [5000, 0, -10, 'abc', null]) {
      const response = await patchDiary(app, token, entryId, { op: 'set_portion', index: 0, mass_g: badMassG });
      expect(response.statusCode, JSON.stringify(badMassG)).toBe(422);
      expect((response.json() as { error: { code: string } }).error.code).toBe('portion_out_of_range');
    }

    const row = await pool.query<{ items: Array<{ mass_g: number }> }>('SELECT items FROM diary_entry WHERE id = $1', [entryId]);
    expect(row.rows[0]?.items[0]?.mass_g).toBe(180);
  });

  it('индекс позиции вне списка отклоняется, ни одна позиция не изменена', async () => {
    const { token, entryId } = await confirmedEntry('203.0.113.72', 180);

    const response = await patchDiary(app, token, entryId, { op: 'set_portion', index: 2, mass_g: 100 });

    expect(response.statusCode).toBe(422);
    expect((response.json() as { error: { code: string } }).error.code).toBe('index_out_of_range');
    const row = await pool.query<{ items: Array<{ mass_g: number }> }>('SELECT items FROM diary_entry WHERE id = $1', [entryId]);
    expect(row.rows[0]?.items[0]?.mass_g).toBe(180);
  });

  it('правка чужой и несуществующей записи дают одинаковый 404, не 403', async () => {
    const owner = await confirmedEntry('203.0.113.73', 200);
    const stranger = await deviceSession(app, pool, '203.0.113.74');
    await grantConsent(app, stranger.token);

    const foreignResponse = await patchDiary(app, stranger.token, owner.entryId, { op: 'set_portion', index: 0, mass_g: 100 });
    const missingResponse = await patchDiary(app, stranger.token, '00000000-0000-0000-0000-000000000000', { op: 'set_portion', index: 0, mass_g: 100 });

    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(foreignResponse.json()).toEqual(missingResponse.json());
    expect(foreignResponse.statusCode).not.toBe(403);
    expect(missingResponse.statusCode).not.toBe(403);
  });
});
