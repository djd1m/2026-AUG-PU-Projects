// PATCH /api/v1/diary/{recognition_id} { op: 'confirm' } — ConfirmDiaryEntry
// (FR-diary-and-streak-1/2, AC-diary-and-streak-1/2/3/4).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { SESSION_COOKIE_NAME } from '../../apps/api/src/session/create-device-session.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { buildInitData } from '../helpers/telegram.js';
import { compositeItem, deviceSession, grantConsent, patchDiary, RICE_SNAPSHOT, riceItem, seedRecognition } from '../helpers/diary.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-confirm-diary-entry');
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

function confirm(token: string, recognitionId: string) {
  return patchDiary(app, token, recognitionId, { op: 'confirm' });
}

describe('PATCH /api/v1/diary/{recognition_id} { op: confirm }', () => {
  it('подтверждение при данном согласии создаёт запись из снимка распознавания', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.60');
    await grantConsent(app, token);
    const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(250)] });

    const response = await confirm(token, recognitionId);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { entry: Record<string, unknown>; totals: Record<string, number> } };
    expect(body.data.entry.recognition_id).toBe(recognitionId);
    // (250/100) × 130 = 325 ккал — из СНИМКА recognition, не из живой food_item.
    expect(body.data.entry.kcal_total).toBe(325);
    expect(body.data.totals.kcal).toBe(325);
    // Регресс на `packages/db/src/pool.ts` (тип-парсер колонки `date`): БЕЗ него `eaten_on`
    // приходит из pg объектом `Date`, а JSON-сериализация ответа маршрута сдвигает московскую
    // полночь в UTC на сутки назад (TZ=Europe/Moscow всех сервисов). Здесь — строка вида
    // YYYY-MM-DD, равная сегодняшней московской дате, а не `Date`/её ISO-представление со
    // временем.
    expect(typeof body.data.entry.eaten_on).toBe('string');
    expect(body.data.entry.eaten_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const rows = await pool.query<{ recognition_id: string; source_snapshot: unknown }>(
      'SELECT recognition_id, source_snapshot FROM diary_entry WHERE recognition_id = $1',
      [recognitionId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.source_snapshot).toEqual([RICE_SNAPSHOT]);
  });

  it('подтверждение без согласия отклоняется 403 и не создаёт запись', async () => {
    // DEC-A-019: исключения для анонимного владельца нет — проверяются ОБА случая одним тестом.
    const anon = await deviceSession(app, pool, '203.0.113.61');
    const anonRecognitionId = await seedRecognition(pool, { deviceSessionId: anon.sessionId });
    const anonResponse = await confirm(anon.token, anonRecognitionId);
    expect(anonResponse.statusCode).toBe(403);
    expect((anonResponse.json() as { error: { code: string } }).error.code).toBe('consent_required');

    const loggedIn = await deviceSession(app, pool, '203.0.113.62');
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/telegram',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${loggedIn.token}`, 'content-type': 'application/json' },
      payload: { init_data: buildInitData('950001') },
    });
    const accountId = (login.json() as { data: { account_id: string } }).data.account_id;
    const accountRecognitionId = await seedRecognition(pool, { deviceSessionId: loggedIn.sessionId, accountId });
    const accountResponse = await confirm(loggedIn.token, accountRecognitionId);
    expect(accountResponse.statusCode).toBe(403);

    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    expect(rows.rows[0]?.n).toBe(0);

    // Повторный вызов после выдачи согласия успешен (01_specification.md, AC-2).
    await grantConsent(app, anon.token);
    const retry = await confirm(anon.token, anonRecognitionId);
    expect(retry.statusCode).toBe(200);
  });

  it('подтверждение скана не в статусе done отклоняется 409', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.63');
    await grantConsent(app, token);

    for (const status of ['queued', 'failed', 'refused'] as const) {
      const recognitionId = await seedRecognition(pool, {
        deviceSessionId: sessionId,
        status,
        failureReason: status === 'refused' ? 'no_food_detected' : null,
      });
      const response = await confirm(token, recognitionId);
      expect(response.statusCode, status).toBe(409);
      if (status === 'refused') {
        const body = response.json() as { error: { details?: { failure_reason?: string } } };
        expect(body.error.details?.failure_reason).not.toBe('consent_required');
      }
    }
    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('подтверждение чужого и несуществующего recognition_id дают одинаковый 404', async () => {
    const owner = await deviceSession(app, pool, '203.0.113.64');
    const stranger = await deviceSession(app, pool, '203.0.113.65');
    await grantConsent(app, owner.token);
    await grantConsent(app, stranger.token);
    const ownerRecognitionId = await seedRecognition(pool, { deviceSessionId: owner.sessionId });

    const foreignResponse = await confirm(stranger.token, ownerRecognitionId);
    const missingResponse = await confirm(stranger.token, '00000000-0000-0000-0000-000000000000');

    expect(foreignResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(foreignResponse.json()).toEqual(missingResponse.json());

    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    expect(rows.rows[0]?.n).toBe(0);
  });

  // RV-diary-and-streak-01 (review-report.md): подтверждение составного блюда раньше давало
  // 0 ккал — верхний снимок позиции игнорировался бы полностью (нет ни одного питательного
  // поля), а `parts[]` не читались вовсе.
  it('подтверждение составного блюда считает по частям (parts[]), а не по верхнему снимку', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.66');
    await grantConsent(app, token);
    const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [compositeItem(300)] });

    const response = await confirm(token, recognitionId);

    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { entry: Record<string, unknown>; totals: Record<string, number> } };
    // 300 г, доли 0,6 риса (130 ккал/100г) и 0,4 курицы (165 ккал/100г): 1,8×130 + 1,2×165 = 432.
    expect(body.data.entry.kcal_total).toBe(432);
    expect(body.data.entry.kcal_total).not.toBe(0); // именно этот ноль воспроизводил RV-01
    expect(body.data.totals.kcal).toBe(432);
    // protein: 1,8×2.7 + 1,2×31 = 4.86+37.2 = 42.06 → округление до 0.1 = 42.1
    expect(body.data.entry.protein_total).toBeCloseTo(42.1, 1);
  });
});
