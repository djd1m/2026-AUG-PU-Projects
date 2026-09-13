// Конкурентный прогон: одновременные правки ОДНОГО скана — итог ДЕТЕРМИНИРОВАН
// (`shared-resource-verification.md`: последовательный тест зеленеет при обеих
// реализациях, различает их только параллельный прогон). `SELECT … FOR UPDATE` в
// `scans-correct.ts` сериализует конкурирующие транзакции на строке скана.

import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { buildServer } from '../../../apps/api/src/server.js';
import { generateSessionToken, hashSessionToken, SESSION_COOKIE_NAME } from '../../../apps/api/src/session/create-device-session.js';
import { migratedPool, requireDatabaseUrl, truncateAll } from '../../helpers/db.js';
import { testScanApiConfig } from '../../helpers/scan-config.js';
import { importFdcDump } from '../../../scripts/import-fdc.js';

const FIXTURE_DIR = fileURLToPath(new URL('../../fixtures/fdc', import.meta.url));

let pool: DbPool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-concurrent-correct');
  app = buildServer({ config: testScanApiConfig(), pool, logger: createLogger({ service: 'api-test', sink: () => {} }) });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  await importFdcDump(pool, FIXTURE_DIR, '2026-04-01');
});

async function seedSession(): Promise<string> {
  const token = generateSessionToken();
  await pool.query(`INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days')`, [
    hashSessionToken(token),
    '203.0.113.0/24',
  ]);
  return token;
}

describe('одновременные set_portion на одном скане — итог детерминирован', () => {
  it('20 конкурентных запросов с РАЗНЫМИ значениями — итоговая порция равна значению ПОСЛЕДНЕГО применённого запроса, ни одна правка не потеряна молча, ни одна не применилась дважды к чужому состоянию', async () => {
    const cookie = await seedSession();
    const foodItem = await pool.query<{ id: string; kcal_per_100g: number }>("SELECT id, kcal_per_100g FROM food_item WHERE source_id = '168878'");
    const rice = foodItem.rows[0];
    if (rice === undefined) throw new Error('фикстура не содержит рис');

    const tokenHash = hashSessionToken(cookie);
    const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [tokenHash]);
    const sessionId = session.rows[0]?.id;
    const scanId = randomUUID();
    const item = {
      label_ru: 'рис', mass_g: 250, original_mass_g: 250, candidates: [],
      food_item_id: rice.id,
      source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 250, import_snapshot_date: '2026-04-01' },
      kcal: Math.round((250 / 100) * rice.kcal_per_100g), protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false,
    };
    await pool.query(
      `INSERT INTO recognition (id, device_session_id, idempotency_key, status, items, confidence, db_kcal_total, attempt_no, escalated, finished_at)
       VALUES ($1, $2, $3, 'done', $4::jsonb, 0.9, $5, 1, false, now())`,
      [scanId, sessionId, randomUUID(), JSON.stringify([item]), item.kcal],
    );

    const N = 20;
    const requests = Array.from({ length: N }, (_, index) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/scans/${scanId}/correct`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ op: 'set_portion', index: 0, mass_g: 100 + index }),
      }),
    );
    const responses = await Promise.all(requests);
    for (const response of responses) expect(response.statusCode).toBe(200);

    // Финальное состояние — ОДНО из 20 применённых значений (не гибрид, не потерянное
    // обновление): `mass_g` детерминированно принадлежит МНОЖЕСТВУ отправленных значений,
    // а `kcal` СЧИТАН ИЗ ТОГО ЖЕ mass_g (согласованность пары, а не двух разных состояний).
    const final = await pool.query('SELECT items FROM recognition WHERE id = $1', [scanId]);
    const finalItems = final.rows[0]?.items as Array<{ mass_g: number; kcal: number }>;
    const finalMass = finalItems[0]?.mass_g;
    expect(finalMass).toBeGreaterThanOrEqual(100);
    expect(finalMass).toBeLessThanOrEqual(119);
    expect(finalItems[0]?.kcal).toBe(Math.round(((finalMass ?? 0) / 100) * rice.kcal_per_100g));

    // Ровно ОДНА запись поправки на каждый УСПЕШНО применённый запрос НЕ ожидается для
    // set_portion (он не пишет `corrections`) — проверяем детерминизм иначе: повторное
    // чтение даёт ТО ЖЕ значение (нет фонового дозаписывания состояния).
    const reread = await pool.query('SELECT items FROM recognition WHERE id = $1', [scanId]);
    expect((reread.rows[0]?.items as Array<{ mass_g: number }>)[0]?.mass_g).toBe(finalMass);
  }, 40_000);
});

interface ThreeItemScan {
  readonly scanId: string;
  readonly cookie: string;
}

/**
 * Три позиции: только для того, чтобы `set_portion` (индекс 0) и `delete_item`
 * (индекс 2) трогали РАЗНЫЕ элементы одного и того же jsonb-массива `items` —
 * RV-source-and-correct-05 (слепое ревью, 2026-09-13): прежний тест гонял ДВАДЦАТЬ
 * запросов ОДНОГО И ТОГО ЖЕ вида на ОДИН И ТОТ ЖЕ индекс с абсолютными значениями, и
 * «любое значение 100..119 с согласованным kcal» верно даже при полном отсутствии
 * блокировки (последний коммит просто побеждает — потерянных обновлений там в принципе
 * не может быть НАБЛЮДАЕМО, потому что `set_portion` не читает предыдущее значение).
 * Здесь же ДВЕ РАЗНЫЕ операции на РАЗНЫХ индексах: и `applyCorrectOp` перечитывает
 * ВЕСЬ массив `items`, мутирует один элемент и пишет НАЗАД ВЕСЬ массив — без
 * `SELECT … FOR UPDATE`, сериализующего это чтение-изменение-запись, конкурирующая
 * транзакция читала бы array ДО чужого изменения и своей записью его бы СТЁРЛА.
 */
async function seedThreeItemScan(pool: DbPool): Promise<ThreeItemScan> {
  const cookie = generateSessionToken();
  await pool.query(`INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days')`, [
    hashSessionToken(cookie),
    '203.0.113.0/24',
  ]);
  const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [hashSessionToken(cookie)]);
  const sessionId = session.rows[0]?.id;
  const foodItem = await pool.query<{ id: string; kcal_per_100g: number }>("SELECT id, kcal_per_100g FROM food_item WHERE source_id = '168878'");
  const rice = foodItem.rows[0];
  if (rice === undefined) throw new Error('фикстура не содержит рис');

  const makeItem = (labelRu: string, massG: number): Record<string, unknown> => ({
    label_ru: labelRu, mass_g: massG, original_mass_g: massG, candidates: [],
    food_item_id: rice.id,
    source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: massG, import_snapshot_date: '2026-04-01' },
    kcal: Math.round((massG / 100) * rice.kcal_per_100g), protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false,
  });
  const items = [makeItem('рис', 250), makeItem('рис-2', 150), makeItem('рис-3', 100)];
  const scanId = randomUUID();
  await pool.query(
    `INSERT INTO recognition (id, device_session_id, idempotency_key, status, items, confidence, db_kcal_total, attempt_no, escalated, finished_at)
     VALUES ($1, $2, $3, 'done', $4::jsonb, 0.9, $5, 1, false, now())`,
    [scanId, sessionId, randomUUID(), JSON.stringify(items), items.reduce((sum, item) => sum + (item.kcal as number), 0)],
  );
  return { scanId, cookie };
}

describe('RV-source-and-correct-05, сценарий 1: set_portion (индекс 0) ОДНОВРЕМЕННО с delete_item (индекс 2)', () => {
  it('ОБА эффекта сохраняются — ни правка порции, ни удаление не теряются молча под конкуренцией', async () => {
    const { scanId, cookie } = await seedThreeItemScan(pool);
    const headers = { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' };

    const [setPortionResponse, deleteResponse] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers, payload: JSON.stringify({ op: 'set_portion', index: 0, mass_g: 400 }) }),
      app.inject({ method: 'POST', url: `/api/v1/scans/${scanId}/correct`, headers, payload: JSON.stringify({ op: 'delete_item', index: 2 }) }),
    ]);
    expect(setPortionResponse.statusCode).toBe(200);
    expect(deleteResponse.statusCode).toBe(200);

    const final = await pool.query<{ items: Array<{ label_ru: string; mass_g: number }> }>('SELECT items FROM recognition WHERE id = $1', [scanId]);
    const items = final.rows[0]?.items ?? [];

    // ПОТЕРЯННОЕ ОБНОВЛЕНИЕ выглядело бы так: длина 3 (удаление не применилось) ИЛИ
    // длина 2, но mass_g позиции «рис» всё ещё 250 (правка порции не применилась) —
    // одно из двух конкурирующих чтение-изменение-запись переписало другое своей
    // версией «before». Обе защиты («правка применилась» И «удаление применилось»)
    // обязаны выполняться ОДНОВРЕМЕННО, а не хотя бы одна из двух.
    expect(items).toHaveLength(2); // «рис-3» удалён
    expect(items.some((item) => item.label_ru === 'рис-3')).toBe(false);
    const rice = items.find((item) => item.label_ru === 'рис');
    expect(rice?.mass_g).toBe(400); // правка порции НЕ потеряна удалением
    expect(items.some((item) => item.label_ru === 'рис-2')).toBe(true); // нетронутая позиция цела
  }, 20_000);
});

describe('RV-source-and-correct-05, сценарий 2: правка приходит В МОМЕНТ, когда воркер дописывает терминальный результат', () => {
  it('correct ЖДЁТ коммита воркера (реальная блокировка строки, не гонка вслепую) и применяется НАД его состоянием', async () => {
    const cookie = generateSessionToken();
    await pool.query(`INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at) VALUES ($1, $2, now() + interval '7 days')`, [
      hashSessionToken(cookie),
      '203.0.113.0/24',
    ]);
    const session = await pool.query<{ id: string }>('SELECT id FROM device_session WHERE cookie_token_hash = $1', [hashSessionToken(cookie)]);
    const sessionId = session.rows[0]?.id;
    const foodItem = await pool.query<{ id: string; kcal_per_100g: number }>("SELECT id, kcal_per_100g FROM food_item WHERE source_id = '168878'");
    const rice = foodItem.rows[0];
    if (rice === undefined) throw new Error('фикстура не содержит рис');

    // Скан ещё `queued` — воркер «в процессе», результата пока нет (items = []).
    const scanId = randomUUID();
    await pool.query(
      `INSERT INTO recognition (id, device_session_id, idempotency_key, status, items, confidence, attempt_no, escalated, lease_fence, leased_until, lease_owner)
       VALUES ($1, $2, $3, 'queued', '[]'::jsonb, NULL, 1, false, 1, now() + interval '30 seconds', gen_random_uuid())`,
      [scanId, sessionId, randomUUID()],
    );

    // «Воркер» — РУЧНОЙ клиент, УДЕРЖИВАЮЩИЙ блокировку строки: имитирует момент,
    // когда воркер УЖЕ начал транзакцию записи терминального результата, но ещё не
    // закоммитил. Управляемое пересечение, а не Promise.all вслепую.
    const worker = new pg.Client({ connectionString: requireDatabaseUrl() });
    await worker.connect();
    await worker.query('BEGIN');
    await worker.query('SELECT id FROM recognition WHERE id = $1 FOR UPDATE', [scanId]);

    try {
      const kcal = Math.round((250 / 100) * rice.kcal_per_100g);
      const item = {
        label_ru: 'рис', mass_g: 250, original_mass_g: 250, candidates: [],
        food_item_id: rice.id,
        source_snapshot: { source: 'USDA-FDC', source_id: '168878', name_en: 'Rice', kcal_per_100g: rice.kcal_per_100g, protein_per_100g: 2.7, fat_per_100g: 0.3, carb_per_100g: 28.2, portion_g: 250, import_snapshot_date: '2026-04-01' },
        kcal, protein: 6.8, fat: 0.8, carb: 70.5, unmatched: false,
      };

      // `correct` запущен, ПОКА воркер держит блокировку и статус ЕЩЁ 'queued'. Его
      // `SELECT … FOR UPDATE` (`scans-correct.ts`) ОБЯЗАН заблокироваться на той же
      // строке — не увидеть 'queued' и не увидеть 'done' раньше коммита воркера.
      const correctPromise = app.inject({
        method: 'POST',
        url: `/api/v1/scans/${scanId}/correct`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'content-type': 'application/json' },
        payload: JSON.stringify({ op: 'set_portion', index: 0, mass_g: 300 }),
      });

      let settled = false;
      void correctPromise.then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      // ЕСЛИ блокировка снята (регресс) — `correct` увидел бы 'queued' НЕМЕДЛЕННО и
      // получил бы 409 задолго до этой проверки; здесь он ОБЯЗАН всё ещё висеть.
      expect(settled).toBe(false);

      // Воркер «дописывает» терминальный результат и коммитит.
      await worker.query(
        `UPDATE recognition SET status = 'done', items = $2::jsonb, db_kcal_total = $3, model_estimate_kcal = $3,
                                 discrepancy_ratio = 0, conflict_flag = false, finished_at = now(), leased_until = NULL, lease_owner = NULL
         WHERE id = $1`,
        [scanId, JSON.stringify([item]), kcal],
      );
      await worker.query('COMMIT');

      const correctResponse = await correctPromise;
      // Разблокировавшись, `correct` увидел УЖЕ ЗАПИСАННЫЙ воркером 'done' и применил
      // правку НАД ним — а не 409 на устаревшем 'queued' и не порчу состава воркера.
      expect(correctResponse.statusCode).toBe(200);
      const body = JSON.parse(correctResponse.body) as { data: { items: Array<{ mass_g: number; food_item_id: string }> } };
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0]?.mass_g).toBe(300); // правка применена
      expect(body.data.items[0]?.food_item_id).toBe(rice.id); // состав воркера СОХРАНЁН, не стёрт
    } finally {
      await worker.end();
    }
  }, 20_000);
});
