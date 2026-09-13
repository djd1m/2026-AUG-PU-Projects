// Двойной (двадцатикратный) параллельный confirm (AC-diary-and-streak-5,
// `.claude/rules/shared-resource-verification.md`). Последовательный тест на «второй confirm
// идемпотентен» зеленеет и при реализации «прочитать, потом вставить» — гонка обязана быть
// создана НАМЕРЕННО, конкурентным `Promise.all`, иначе окно между чтением и записью никогда не
// будет задето.

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
  pool = await migratedPool('n4-tests-confirm-diary-entry-parallel');
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

describe('двадцать параллельных confirm одного recognition_id', () => {
  it('двадцать параллельных подтверждений одного recognition_id создают ровно одну запись', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.100');
    await grantConsent(app, token);
    const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(200)] });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => patchDiary(app, token, recognitionId, { op: 'confirm' })),
    );

    // Ни один ответ не является ошибкой уникальности, поднятой наверх приложением — ON CONFLICT
    // гасит её на уровне БД (02_pseudocode.md, ConfirmDiaryEntry шаг 6-8).
    for (const response of responses) {
      expect(response.statusCode, response.body).toBe(200);
    }

    const entryIds = new Set(responses.map((response) => (response.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id));
    expect(entryIds.size).toBe(1); // все 20 ответов несут ОДИН и тот же entry_id

    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE recognition_id = $1', [recognitionId]);
    expect(rows.rows[0]?.n).toBe(1); // РОВНО одна строка, а не 20
  }, 30_000);
});
