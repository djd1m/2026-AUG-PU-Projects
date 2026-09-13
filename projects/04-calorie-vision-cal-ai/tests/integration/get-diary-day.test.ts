// GET /api/v1/diary?date= — GetDiaryDay (FR-diary-and-streak-5, AC-diary-and-streak-12/13/14).

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
  pool = await migratedPool('n4-tests-get-diary-day');
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

describe('GET /api/v1/diary?date=', () => {
  it('чтение дня возвращает только записи вызывающего владельца', async () => {
    const ownerA = await deviceSession(app, pool, '203.0.113.90');
    const ownerB = await deviceSession(app, pool, '203.0.113.91');
    await grantConsent(app, ownerA.token);
    await grantConsent(app, ownerB.token);
    const today = todayMoscow();

    const recA = await seedRecognition(pool, { deviceSessionId: ownerA.sessionId, items: [riceItem(200)] });
    await patchDiary(app, ownerA.token, recA, { op: 'confirm' });
    const recB = await seedRecognition(pool, { deviceSessionId: ownerB.sessionId, items: [riceItem(300)] });
    await patchDiary(app, ownerB.token, recB, { op: 'confirm' });

    const response = await getDiary(app, ownerA.token, today);
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { entries: Array<{ recognition_id: string }> } };
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0]?.recognition_id).toBe(recA);

    // Маршрут не принимает параметр «чей дневник» ни в query, ни в заголовке — передать чужой
    // владелец нечем; owner_key вычисляется ТОЛЬКО из сессии (AC-diary-and-streak-12).
    const withForeignHeader = await app.inject({
      method: 'GET',
      url: `/api/v1/diary?date=${today}&owner_key=${ownerB.sessionId}`,
      headers: { cookie: `n4_session=${ownerA.token}`, 'x-owner-key': ownerB.sessionId },
    });
    const withForeignBody = withForeignHeader.json() as { data: { entries: Array<{ recognition_id: string }> } };
    expect(withForeignBody.data.entries).toHaveLength(1);
    expect(withForeignBody.data.entries[0]?.recognition_id).toBe(recA);
  });

  it('непригодная дата отклоняется без подстановки сегодняшнего дня', async () => {
    const { token } = await deviceSession(app, pool, '203.0.113.92');

    for (const badDate of ['2026-13-40', '', 'not-a-date']) {
      const response = await getDiary(app, token, badDate);
      expect(response.statusCode, JSON.stringify(badDate)).toBe(422);
      expect((response.json() as { error: { code: string } }).error.code).toBe('invalid_date');
    }

    const farFuture = new Date();
    farFuture.setUTCDate(farFuture.getUTCDate() + 400);
    const futureResponse = await getDiary(app, token, farFuture.toISOString().slice(0, 10));
    expect(futureResponse.statusCode).toBe(422);
  });

  it('запись в 23:50 по Europe/Moscow попадает в московскую календарную дату', async () => {
    // Момент 2026-09-12T21:30:00Z — это 00:30 13 сентября по Москве (UTC+3): московские сутки
    // НАЧИНАЮТСЯ раньше UTC-суток, поэтому здесь UTC-дата (12-е) и московская дата (13-е)
    // расходятся — ровно тот случай, который AC-diary-and-streak-14 требует не перепутать.
    // Маршрут не принимает `now` как вход, поэтому момент подтверждения задаётся ВЫЗОВОМ
    // алгоритма напрямую (`confirm-diary-entry.ts` принимает `now` параметром для этого).
    const { sessionId } = await deviceSession(app, pool, '203.0.113.93');
    const utcMoment = new Date('2026-09-12T21:30:00.000Z');
    expect(utcMoment.toISOString().slice(0, 10)).toBe('2026-09-12'); // UTC-дата — ещё 12-е

    const { confirmDiaryEntry } = await import('../../apps/api/src/diary/confirm-diary-entry.js');
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);
    const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(200)] });
    const result = await confirmDiaryEntry({
      pool,
      owner: { table: 'device_session', id: sessionId },
      deviceSessionId: sessionId,
      accountId: null,
      recognitionId,
      now: utcMoment,
    });
    expect(result.outcome).toBe('created');
    if (result.outcome !== 'created') throw new Error('unreachable');
    expect(result.entry.eaten_on).toBe('2026-09-13'); // московская дата — уже 13-е

    const ownerKey = sessionId;
    const { getDiaryDay } = await import('../../apps/api/src/diary/get-diary-day.js');
    const onMoscowDate = await getDiaryDay(pool, ownerKey, '2026-09-13', utcMoment);
    expect(onMoscowDate.outcome).toBe('ok');
    if (onMoscowDate.outcome !== 'ok') throw new Error('unreachable');
    expect(onMoscowDate.entries).toHaveLength(1);

    const onUtcDate = await getDiaryDay(pool, ownerKey, '2026-09-12', utcMoment);
    expect(onUtcDate.outcome).toBe('ok');
    if (onUtcDate.outcome !== 'ok') throw new Error('unreachable');
    expect(onUtcDate.entries).toHaveLength(0); // запись НЕ попала в дату, вычисленную по UTC
  });
});
