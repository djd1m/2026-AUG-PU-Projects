// AC-share-card-and-growth-events-17 — 20 одновременных создателей на ОДИН recognition_id:
// ровно одна строка share_card, все ответы с одним card_id, ни один вызов не завершается
// неучтённой ошибкой (конфликт `ON CONFLICT DO NOTHING` обработан как «уже создано»).
//
// Проверяется на уровне `createShareCardGuarded` (репозиторий, где живёт `ON CONFLICT DO
// NOTHING` — `share-card-repository.ts`), а не полным HTTP-путём через `POST
// /api/v1/share-cards`: полный путь рендерит файл (`sharp` + сетевой `fetch` presigned-URL)
// ДО вставки, и рендер уже сериализован каждым вызывающим кодом отдельно (`create-share-card.ts`
// проверяет идемпотентность ВНЕ транзакции первым же SELECT, шаг 3 псевдокода) — 20 параллельных
// рендеров одного и того же Snapshot проверяли бы `sharp`/сеть, а не разделяемый ресурс базы,
// который и называет NFR-1 («Уникальность и блокировка строки владельца проверяются
// параллельным прогоном на настоящем PostgreSQL»). Последовательный тест здесь НЕ отличил бы
// атомарный `ON CONFLICT` от «прочитать, потом записать» — только 20 РЕАЛЬНО одновременных
// вызовов делают это.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { createShareCardGuarded, type CreateShareCardResult } from '../../apps/api/src/share/share-card-repository.js';
import { generateSessionToken, hashSessionToken } from '../../apps/api/src/session/create-device-session.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-share-card-idempotency');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

describe('AC-17: 20 одновременных createShareCardGuarded на один recognition_id', () => {
  it('ровно одна строка share_card, все 20 результатов несут ОДИН card_id, ни один не бросает исключение', async () => {
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at, consent_at)
       VALUES ($1, '203.0.113.0/24', now() + interval '7 days', now()) RETURNING id`,
      [hashSessionToken(generateSessionToken())],
    );
    const sessionId = session.rows[0]!.id;
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
      [sessionId],
    );
    const recognitionId = recognition.rows[0]!.id;

    const CONCURRENT = 20;
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, () =>
        createShareCardGuarded(pool, {
          owner: { table: 'device_session', id: sessionId },
          recognitionId,
          objectKey: `share-cards/${recognitionId}.jpg`,
          badgeRendered: true,
        }),
      ),
    );

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.map((r) => r.reason)).toEqual([]); // ни один вызов не завершился неучтённой ошибкой

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<CreateShareCardResult> => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(CONCURRENT);

    // Ни один из 20 не должен получить `refused` — все читают ОДНО и то же выданное согласие,
    // а `refused` здесь означал бы, что fail-closed-проверка ошибочно сработала под конкуренцией.
    const withId = fulfilled.filter((r): r is PromiseFulfilledResult<Extract<CreateShareCardResult, { outcome: 'created' | 'existing' }>> => r.value.outcome !== 'refused');
    expect(withId).toHaveLength(CONCURRENT);

    const cardIds = new Set(withId.map((r) => r.value.id));
    expect(cardIds.size).toBe(1); // ОДИН и тот же card_id у всех 20

    const outcomes = new Set(withId.map((r) => r.value.outcome));
    expect(outcomes.has('created')).toBe(true);
    for (const outcome of outcomes) expect(['created', 'existing']).toContain(outcome);

    const rows = await pool.query('SELECT id FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(rows.rowCount).toBe(1); // РОВНО одна строка в базе, не 20
  }, 30_000);
});
