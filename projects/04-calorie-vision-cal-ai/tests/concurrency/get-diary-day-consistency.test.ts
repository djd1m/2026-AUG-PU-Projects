// GET /api/v1/diary читает список, итог дня и стрик СОГЛАСОВАННО (RV-diary-and-streak-02,
// review-report.md): барьер вставлен МЕЖДУ первым чтением GetDiaryDay (список записей) и
// последующими (итог/стрик) — конкурентное удаление коммитится РОВНО в этом окне.
//
// Барьер сделан на уровне интерфейса `DbPool`, БЕЗ изменения производственного кода: обёртка
// над реальным пулом перехватывает `client.query`, и после запроса, совпадающего с текстом
// SQL списка записей, ждёт внешний сигнал ПЕРЕД тем, как отдать управление обратно
// `getDiaryDay`. Это позволяет управлять моментом коммита конкурентного `delete` ИЗНУТРИ
// транзакции `getDiaryDay`, а не полагаться на удачу планировщика.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../apps/api/src/server.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { testApiConfig } from '../helpers/config.js';
import { deviceSession, grantConsent, patchDiary, riceItem, seedRecognition } from '../helpers/diary.js';
import { getDiaryDay } from '../../apps/api/src/diary/get-diary-day.js';
import { deleteDiaryEntry } from '../../apps/api/src/diary/delete-diary-entry.js';

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-get-diary-day-consistency');
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

/**
 * Пул-обёртка: после ПЕРВОГО запроса, чей текст содержит `pauseAfterSqlFragment`, ждёт `gate`
 * перед возвратом результата вызывающему. Остальные запросы того же клиента идут БЕЗ паузы.
 */
function pausingPool(realPool: DbPool, pauseAfterSqlFragment: string, gate: Promise<void>): DbPool {
  return {
    connect: async () => {
      const client = await realPool.connect();
      let paused = false;
      const originalQuery = client.query.bind(client) as (text: unknown, params?: unknown) => Promise<unknown>;
      const wrappedQuery = async (text: unknown, params?: unknown): Promise<unknown> => {
        const result = await originalQuery(text, params);
        const sql = typeof text === 'string' ? text : (text as { text?: string } | undefined)?.text;
        if (!paused && typeof sql === 'string' && sql.includes(pauseAfterSqlFragment)) {
          paused = true;
          await gate;
        }
        return result;
      };
      return Object.assign(client, { query: wrappedQuery }) as unknown as typeof client;
    },
  } as unknown as DbPool;
}

describe('GetDiaryDay: список, итог и стрик — из ОДНОГО снимка базы', () => {
  it('удаление, зафиксированное МЕЖДУ чтением списка и чтением итога, не создаёт расхождение в одном ответе', async () => {
    const { token, sessionId } = await deviceSession(app, pool, '203.0.113.130');
    await grantConsent(app, token);
    const entryIds: string[] = [];
    for (const massG of [200, 200, 200]) {
      const recognitionId = await seedRecognition(pool, { deviceSessionId: sessionId, items: [riceItem(massG)] });
      const confirmed = await patchDiary(app, token, recognitionId, { op: 'confirm' });
      entryIds.push((confirmed.json() as { data: { entry: { entry_id: string } } }).data.entry.entry_id);
    }
    // Три записи по (200/100)×130 = 260 ккал — итог 780 ДО удаления.

    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    // Пауза — сразу ПОСЛЕ запроса списка записей (первого запроса `getDiaryDay`, устанавливающего
    // REPEATABLE READ снимок), ДО запроса итога дня.
    const wrappedPool = pausingPool(pool, 'FROM diary_entry WHERE owner_key = $1 AND eaten_on = $2 AND deleted_at IS NULL ORDER BY created_at', gate);

    const getDiaryDayPromise = getDiaryDay(wrappedPool, sessionId, todayMoscow());

    // Дать событийному циклу время исполнить запрос списка и упереться в паузу.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Конкурентное удаление ФИКСИРУЕТСЯ ПОЛНОСТЬЮ, пока getDiaryDay удерживает открытую
    // транзакцию между своим первым и вторым запросом.
    const deleted = entryIds[0] as string;
    const deleteResult = await deleteDiaryEntry(pool, deleted, sessionId);
    expect(deleteResult.outcome).toBe('deleted');

    releaseGate();
    const result = await getDiaryDayPromise;

    expect(result.outcome).toBe('ok');
    if (result.outcome !== 'ok') throw new Error('unreachable');

    // РЕШАЮЩАЯ ПРОВЕРКА (RV-02): то, что показывает totals, ОБЯЗАНО совпадать с суммой entries
    // ИЗ ЭТОГО ЖЕ ответа — оба поля читаны из ОДНОГО снимка (REPEATABLE READ), поэтому либо ОБА
    // видят все три записи (снимок зафиксирован ДО коммита delete), либо (при другой раскладке
    // планировщика) НИ ОДНО из полей увидевшую удалённую запись не покажет. Расхождение между
    // ними — ровно тот дефект, который правка устраняет.
    const sumFromEntries = result.entries.reduce((sum, entry) => sum + entry.kcal_total, 0);
    expect(result.totals.totals.kcal).toBe(sumFromEntries);

    // Снимок был зафиксирован ДО коммита delete (пауза стоит между 1-м и 2-м запросом
    // транзакции) — поэтому ОБА поля этого ответа видят ВСЕ ТРИ записи, включая ту, что
    // удаление уже зафиксировало снаружи транзакции.
    expect(result.entries).toHaveLength(3);
    expect(result.totals.totals.kcal).toBe(780);

    // И одновременно удаление РЕАЛЬНО применилось — это не «расхождение спрятали, потеряв
    // запись навсегда»: свежий вызов ВНЕ старой транзакции видит уже 2 записи.
    const fresh = await getDiaryDay(pool, sessionId, todayMoscow());
    expect(fresh.outcome).toBe('ok');
    if (fresh.outcome !== 'ok') throw new Error('unreachable');
    expect(fresh.entries).toHaveLength(2);
    expect(fresh.totals.totals.kcal).toBe(520);
  }, 30_000);
});
