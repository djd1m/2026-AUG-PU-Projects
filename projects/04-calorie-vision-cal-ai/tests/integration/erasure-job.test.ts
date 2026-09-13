// RunErasureJob (AC-consent-and-telegram-auth-15/16).
//
// Часть тестов ниже использует ЗАГЛУШКУ-«шпион» (быстрая проверка порядка вызовов, самих
// строк БД), часть — НАСТОЯЩИЙ MinIO профиля `test` (RV-consent-and-telegram-auth-02: заглушка
// сама по себе не доказывает, что объект физически удаляется из бакета).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { runErasureJob, type PhotoStorePort } from '../../apps/recognizer/src/consent/erasure-job.js';
import { createMinioPhotoStore } from '../../apps/recognizer/src/storage/photo-store-minio.js';
import { createShareCardGuarded } from '../../apps/api/src/share/share-card-repository.js';
import { migratedPool, truncateAll } from '../helpers/db.js';
import { ensureTestBucket, objectExists, testStorageConfig, uploadTestObject } from '../helpers/minio.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-erasure-job');
  await ensureTestBucket();
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function spyPhotoStore(): PhotoStorePort & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async purgeObject(objectKey: string): Promise<void> {
      calls.push(objectKey);
    },
  };
}

async function seedErasingAccount(telegramUserId: string, requestedSecondsAgo = 0): Promise<{ accountId: string; sessionId: string }> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, tier, status, deletion_requested_at)
     VALUES ($1, 'free', 'erasing', now() - ($2 || ' seconds')::interval) RETURNING id`,
    [telegramUserId, requestedSecondsAgo],
  );
  const accountId = account.rows[0]!.id;
  const session = await pool.query<{ id: string }>(
    `INSERT INTO device_session (account_id, cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
     VALUES ($1, $2, $3, now() + interval '7 days') RETURNING id`,
    [accountId, `hash-${telegramUserId}-${Math.random()}`, '203.0.113.0/24'],
  );
  return { accountId, sessionId: session.rows[0]!.id };
}

describe('RunErasureJob', () => {
  it('AC-15: завершает удаление, переводит erasing → erased, идемпотентен при повторном запуске', async () => {
    const { accountId, sessionId } = await seedErasingAccount('950001');
    const photo = await pool.query<{ id: string }>(
      `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on)
       VALUES ($1, 'photo-key-1', 'image/jpeg', 1000, 800, 800, CURRENT_DATE + 30) RETURNING id`,
      [sessionId],
    );
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, photo_id, status) VALUES ($1, $2, $3, 'done') RETURNING id`,
      [sessionId, accountId, photo.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO diary_entry (owner_key, recognition_id, eaten_on, meal_slot, items, kcal_total, protein_total, fat_total, carb_total, source_snapshot)
       VALUES ($1, $2, CURRENT_DATE, 'lunch', '[]'::jsonb, 100, 1, 1, 1, '{}'::jsonb)`,
      [accountId, recognition.rows[0]!.id],
    );

    const photoStore = spyPhotoStore();
    const logger = createLogger({ service: 'test', sink: () => {} });

    const result = await runErasureJob({ pool, photoStore, logger });

    expect(result.erased).toBe(1);
    expect(photoStore.calls).toEqual(['photo-key-1']);

    const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.status).toBe('erased');
    const diary = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [accountId]);
    expect(diary.rows[0]?.n).toBe(0);
    const recognitions = await pool.query('SELECT count(*)::int AS n FROM recognition WHERE account_id = $1', [accountId]);
    expect(recognitions.rows[0]?.n).toBe(0);

    // Повторный прогон — идемпотентно: ничего не меняется, не ошибка.
    const secondPhotoStore = spyPhotoStore();
    const secondResult = await runErasureJob({ pool, photoStore: secondPhotoStore, logger });
    expect(secondResult.erased).toBe(0);
    expect(secondPhotoStore.calls).toEqual([]);
  });

  it('AC-16: активный скан откладывает удаление аккаунта, не блокирует батч остальных', async () => {
    const active = await seedErasingAccount('950002');
    await pool.query(`INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'queued')`, [active.sessionId, active.accountId]);

    const other = await seedErasingAccount('950003');

    const photoStore = spyPhotoStore();
    const logger = createLogger({ service: 'test', sink: () => {} });

    const result = await runErasureJob({ pool, photoStore, logger });

    expect(result.skippedActiveScan).toBe(1);
    expect(result.erased).toBe(1);

    const activeAccount = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [active.accountId]);
    expect(activeAccount.rows[0]?.status).toBe('erasing');
    const otherAccount = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [other.accountId]);
    expect(otherAccount.rows[0]?.status).toBe('erased');
  });

  it('RV-06: анонимный recognition, перенесённый на аккаунт входом, ТОЖЕ откладывает удаление (не только созданный с account_id сразу)', async () => {
    // Раньше активный скан искался ТОЛЬКО по recognition.account_id, заполненному сразу — этот
    // тест воспроизводит путь «anonymous → login» через ту же ситуацию, что видит erasure-job:
    // recognition.account_id заполнен (как после TelegramLogin), а не NULL.
    const active = await seedErasingAccount('950004');
    await pool.query(`INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'queued')`, [active.sessionId, active.accountId]);

    const photoStore = spyPhotoStore();
    const logger = createLogger({ service: 'test', sink: () => {} });
    const result = await runErasureJob({ pool, photoStore, logger });

    expect(result.skippedActiveScan).toBe(1);
    expect(result.erased).toBe(0);
  });

  it('RV-01: аккаунт с ОПУБЛИКОВАННОЙ и ОТОЗВАННОЙ карточками удаляется без ошибки внешнего ключа', async () => {
    // diary_entry И share_card ссылаются на recognition через ON DELETE RESTRICT (миграция 001).
    // Прежний порядок удалял recognition МЕЖДУ diary_entry и share_card — эта карточка вызывала
    // бы ошибку внешнего ключа на КАЖДОМ прогоне.
    const { accountId, sessionId } = await seedErasingAccount('950005');
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [sessionId, accountId],
    );
    const recognitionId = recognition.rows[0]!.id;
    await pool.query(`INSERT INTO share_card (owner_key, recognition_id, object_key) VALUES ($1, $2, 'card-published')`, [accountId, recognitionId]);
    await pool.query(
      `INSERT INTO share_card (owner_key, recognition_id, object_key, revoked_at) VALUES ($1, $2, 'card-revoked', now())`,
      [accountId, recognitionId],
    );

    const photoStore = spyPhotoStore();
    const logger = createLogger({ service: 'test', sink: () => {} });
    const result = await runErasureJob({ pool, photoStore, logger });

    expect(result.erased).toBe(1);
    const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.status).toBe('erased');
    const cards = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE owner_key = $1', [accountId]);
    expect(cards.rows[0]?.n).toBe(0);
    const recognitions = await pool.query('SELECT count(*)::int AS n FROM recognition WHERE id = $1', [recognitionId]);
    expect(recognitions.rows[0]?.n).toBe(0);
  });

  it('review4 RV-01: карточка, созданная ЧЕРЕЗ связанную сессию, физически принадлежит аккаунту и не блокирует эразуру', async () => {
    // Четвёртый обзор: enforceConsentBeforeDiaryWrite проверял согласие СВЯЗАННОГО аккаунта
    // (RV-02 третьего обзора), но createShareCardGuarded/createDiaryEntryGuarded всё ещё писали
    // owner_key = input.owner.id — исходный session_id, а не проверенный account_id. Карточка,
    // созданная через уже связанную сессию, физически принадлежала session_id: withdraw/erase_all
    // (owner_key = accountId) её не находили, а RunErasureJob падал на ON DELETE RESTRICT —
    // share_card продолжал ссылаться на recognition, который `DELETE FROM recognition` пытался
    // удалить. Воспроизводит ТОЧНУЮ последовательность из находки: связать сессию с аккаунтом →
    // дать согласие → создать карточку ЧЕРЕЗ СЕССИЮ (не через account) → отозвать → эразура.
    const account = await pool.query<{ id: string }>(
      `INSERT INTO account (telegram_user_id, tier, status, consent_at) VALUES ($1, 'free', 'active', now()) RETURNING id`,
      ['950010'],
    );
    const accountId = account.rows[0]!.id;
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (account_id, cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
       VALUES ($1, $2, $3, now() + interval '7 days') RETURNING id`,
      [accountId, `hash-950010-${Math.random()}`, '203.0.113.0/24'],
    );
    const sessionId = session.rows[0]!.id;
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [sessionId, accountId],
    );
    const recognitionId = recognition.rows[0]!.id;

    const created = await createShareCardGuarded(pool, {
      owner: { table: 'device_session', id: sessionId },
      recognitionId,
      objectKey: 'card-via-linked-session',
      badgeRendered: true,
    });
    expect(created.outcome).toBe('created');

    // РЕГРЕССИЯ RV-01: owner_key физической строки — accountId (проверенный канонический
    // владелец), а НЕ sessionId (исходный owner.id, переданный в запрос).
    const cardRow = await pool.query<{ owner_key: string }>('SELECT owner_key FROM share_card WHERE recognition_id = $1', [recognitionId]);
    expect(cardRow.rows[0]?.owner_key).toBe(accountId);
    expect(cardRow.rows[0]?.owner_key).not.toBe(sessionId);

    // Отзыв согласия закрывает карточку — находит её по owner_key = accountId; до фикса
    // owner_key = sessionId эту строку не находил.
    await pool.query(`UPDATE account SET consent_at = NULL WHERE id = $1`, [accountId]);
    await pool.query(`UPDATE share_card SET revoked_at = now() WHERE owner_key = $1 AND revoked_at IS NULL`, [accountId]);
    const revoked = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE owner_key = $1 AND revoked_at IS NOT NULL', [
      accountId,
    ]);
    expect(revoked.rows[0]?.n).toBe(1);

    // Эразура: без фикса оставшаяся ссылка share_card→recognition (owner_key=sessionId, вне
    // предиката `DELETE FROM share_card WHERE owner_key = accountId`) заблокировала бы
    // `DELETE FROM recognition` ошибкой внешнего ключа (ON DELETE RESTRICT, миграция 001), и
    // аккаунт остался бы `erasing` навсегда (`guard-must-be-able-to-fail`: это тест на реальном
    // Postgres, ошибка внешнего ключа не подменяется заглушкой).
    await pool.query(`UPDATE account SET status = 'erasing', deletion_requested_at = now() WHERE id = $1`, [accountId]);
    const result = await runErasureJob({ pool, photoStore: spyPhotoStore(), logger: createLogger({ service: 'test', sink: () => {} }) });

    expect(result.erased).toBe(1);
    const erasedAccount = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(erasedAccount.rows[0]?.status).toBe('erased');
    const remainingCards = await pool.query('SELECT count(*)::int AS n FROM share_card WHERE owner_key = $1', [accountId]);
    expect(remainingCards.rows[0]?.n).toBe(0);
    const remainingRecognition = await pool.query('SELECT count(*)::int AS n FROM recognition WHERE id = $1', [recognitionId]);
    expect(remainingRecognition.rows[0]?.n).toBe(0);
  });

  it('старый deletion_requested_at (73 часа назад) обрабатывается штатно — НЕ доказательство дедлайна 72 ч', async () => {
    // RV-consent-and-telegram-auth-08 (третий обзор), медиана: название теста внушало проверку
    // «дедлайна», но `RunErasureJob` НЕ ИМЕЕТ шлюза по времени вообще — предикат шага 1 это
    // `WHERE status = 'erasing'`, БЕЗ `deletion_requested_at`. 72 часа — обещание срока
    // владельцу данных (`erase_deadline` в ответе `DELETE /api/v1/account`, проверено
    // `AC-13`/`AC-14` в `account-delete.test.ts`, где дедлайн реально ВЫЧИСЛЯЕТСЯ), а не
    // условие, которое эта задача проверяет. Этот тест доказывает РОВНО ОДНО: старый
    // `deletion_requested_at` не ломает обработку — не больше и не меньше.
    const { accountId } = await seedErasingAccount('950006', 73 * 60 * 60);

    const result = await runErasureJob({ pool, photoStore: spyPhotoStore(), logger: createLogger({ service: 'test', sink: () => {} }) });

    expect(result.erased).toBe(1);
    const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
    expect(account.rows[0]?.status).toBe('erased');
  });

  it('review3 RV-07 (high): 50 заблокированных активным сканом аккаунтов НЕ мешают 51-му готовому обработаться В ЭТОМ ЖЕ прогоне', async () => {
    // РАНЬШЕ: `SELECT … LIMIT 50` без учёта уже виденных в прогоне — если ВСЕ 50 первых по
    // `deletion_requested_at` пропускались активным сканом, 51-й (готовый, но с БОЛЕЕ ПОЗДНИМ
    // `deletion_requested_at`, то есть за пределами первой страницы) не обрабатывался НИКОГДА.
    const blockedIds: string[] = [];
    for (let i = 0; i < 50; i += 1) {
      // Более РАННИЙ deletion_requested_at — первая страница (ORDER BY deletion_requested_at).
      const blocked = await seedErasingAccount(`95100${i}-blocked`, 1000 - i);
      await pool.query(`INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'queued')`, [
        blocked.sessionId,
        blocked.accountId,
      ]);
      blockedIds.push(blocked.accountId);
    }
    // Готовый аккаунт — БОЛЕЕ ПОЗДНИЙ deletion_requested_at, чем у всех 50 заблокированных:
    // без пагинации по страницам он остаётся ЗА пределами первого `LIMIT 50`.
    const ready = await seedErasingAccount('951999-ready', 10);

    const result = await runErasureJob({ pool, photoStore: spyPhotoStore(), logger: createLogger({ service: 'test', sink: () => {} }) });

    expect(result.skippedActiveScan).toBe(50);
    expect(result.erased).toBe(1);

    const readyAccount = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [ready.accountId]);
    expect(readyAccount.rows[0]?.status).toBe('erased');
    for (const blockedId of blockedIds) {
      const blockedAccount = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [blockedId]);
      expect(blockedAccount.rows[0]?.status).toBe('erasing');
    }
  }, 30_000);

  describe('RV-02: НАСТОЯЩИЙ MinIO — объект физически удаляется, коммит erased только после подтверждения', () => {
    it('объект, реально загруженный в бакет, физически исчезает после runErasureJob с MinioPhotoStore', async () => {
      const { accountId, sessionId } = await seedErasingAccount('950101');
      const objectKey = `erasure-job-real-${Date.now()}`;
      await uploadTestObject(objectKey, 'фотография для теста удаления');
      await pool.query(
        `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on)
         VALUES ($1, $2, 'image/jpeg', 1000, 800, 800, CURRENT_DATE + 30)`,
        [sessionId, objectKey],
      );
      expect(await objectExists(objectKey)).toBe(true);

      const photoStore = createMinioPhotoStore({ storage: testStorageConfig() });
      const result = await runErasureJob({ pool, photoStore, logger: createLogger({ service: 'test', sink: () => {} }) });

      expect(result.erased).toBe(1);
      expect(await objectExists(objectKey)).toBe(false);
      const photo = await pool.query<{ file_state: string }>('SELECT file_state FROM photo WHERE object_key = $1', [objectKey]);
      expect(photo.rows[0]?.file_state).toBe('purged');
      const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
      expect(account.rows[0]?.status).toBe('erased');
    });

    it('ДЕФЕКТ СТЫКА (слияние consent × scan-pipeline): НОРМАЛИЗОВАННАЯ копия удаляется вместе с оригиналом', async () => {
      // Ветка consent писалась до того, как `scan-pipeline` начал создавать вторую копию
      // снимка (`photo.normalized_object_key`). По отдельности обе фичи зелёные; вместе
      // аккаунт объявлялся `erased`, а изображение тарелки оставалось в бакете.
      const { accountId, sessionId } = await seedErasingAccount('950105');
      const objectKey = `erasure-job-orig-${Date.now()}`;
      const normalizedKey = `${objectKey}.normalized.jpg`;
      await uploadTestObject(objectKey, 'оригинал снимка');
      await uploadTestObject(normalizedKey, 'нормализованная копия того же снимка');
      await pool.query(
        `INSERT INTO photo (device_session_id, object_key, normalized_object_key, mime, bytes, width, height, expires_on)
         VALUES ($1, $2, $3, 'image/jpeg', 1000, 800, 800, CURRENT_DATE + 30)`,
        [sessionId, objectKey, normalizedKey],
      );
      expect(await objectExists(objectKey)).toBe(true);
      expect(await objectExists(normalizedKey)).toBe(true);

      const photoStore = createMinioPhotoStore({ storage: testStorageConfig() });
      const result = await runErasureJob({ pool, photoStore, logger: createLogger({ service: 'test', sink: () => {} }) });

      expect(result.erased).toBe(1);
      expect(await objectExists(objectKey)).toBe(false);
      expect(await objectExists(normalizedKey)).toBe(false);
      const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
      expect(account.rows[0]?.status).toBe('erased');
    });

    it('сбой удаления НОРМАЛИЗОВАННОЙ копии оставляет строку present и аккаунт erasing', async () => {
      // Отметка `purged` не имеет права опережать ВТОРОЙ объект: иначе повторный прогон
      // строку уже не выберет, и копия останется в бакете навсегда.
      const { accountId, sessionId } = await seedErasingAccount('950106');
      const objectKey = `erasure-job-orig-fail-${Date.now()}`;
      const normalizedKey = `${objectKey}.normalized.jpg`;
      await pool.query(
        `INSERT INTO photo (device_session_id, object_key, normalized_object_key, mime, bytes, width, height, expires_on)
         VALUES ($1, $2, $3, 'image/jpeg', 1000, 800, 800, CURRENT_DATE + 30)`,
        [sessionId, objectKey, normalizedKey],
      );
      const failingOnNormalized: PhotoStorePort = {
        async purgeObject(key: string): Promise<void> {
          if (key === normalizedKey) throw new Error('storage недоступен на нормализованной копии');
        },
      };

      const result = await runErasureJob({ pool, photoStore: failingOnNormalized, logger: createLogger({ service: 'test', sink: () => {} }) });

      expect(result.erased).toBe(0);
      expect(result.incomplete).toBe(1);
      const photo = await pool.query<{ file_state: string }>('SELECT file_state FROM photo WHERE object_key = $1', [objectKey]);
      expect(photo.rows[0]?.file_state).toBe('present');
      const account = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
      expect(account.rows[0]?.status).toBe('erasing');
    });

    it('удаление объекта, которого уже нет в бакете, — тоже успех (идемпотентность MinIO removeObject)', async () => {
      const { sessionId } = await seedErasingAccount('950102');
      const objectKey = `erasure-job-missing-${Date.now()}`;
      // НЕ загружаем объект — строка photo ссылается на ключ, которого в бакете нет.
      await pool.query(
        `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on)
         VALUES ($1, $2, 'image/jpeg', 1000, 800, 800, CURRENT_DATE + 30)`,
        [sessionId, objectKey],
      );

      const photoStore = createMinioPhotoStore({ storage: testStorageConfig() });
      const result = await runErasureJob({ pool, photoStore, logger: createLogger({ service: 'test', sink: () => {} }) });

      expect(result.erased).toBe(1);
    });

    it('сбой удаления ОДНОГО объекта оставляет аккаунт erasing (не erased); повтор с рабочим хранилищем завершает', async () => {
      const { accountId, sessionId } = await seedErasingAccount('950103');
      const failingKey = `erasure-job-flaky-${Date.now()}`;
      await uploadTestObject(failingKey, 'объект, на котором симулируется сбой хранилища');
      await pool.query(
        `INSERT INTO photo (device_session_id, object_key, mime, bytes, width, height, expires_on)
         VALUES ($1, $2, 'image/jpeg', 1000, 800, 800, CURRENT_DATE + 30)`,
        [sessionId, failingKey],
      );

      const flakyStore: PhotoStorePort = {
        async purgeObject(): Promise<void> {
          throw new Error('симулированный сбой хранилища (RV-02)');
        },
      };
      const logger = createLogger({ service: 'test', sink: () => {} });

      const firstAttempt = await runErasureJob({ pool, photoStore: flakyStore, logger });
      expect(firstAttempt.erased).toBe(0);
      expect(firstAttempt.incomplete).toBe(1);
      // Коммит erased ЗАПРЕЩЁН: строки БД удалены (шаг 1), но account.status остаётся erasing —
      // сбой хранилища НЕВОССТАНОВИМ штатным повтором был бы, если бы erased уже зафиксировался.
      const afterFirst = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
      expect(afterFirst.rows[0]?.status).toBe('erasing');
      expect(await objectExists(failingKey)).toBe(true);

      // Повтор с РАБОЧИМ (настоящим) хранилищем — резюмируется: находит ТУ ЖЕ present-фотографию.
      const workingStore = createMinioPhotoStore({ storage: testStorageConfig() });
      const secondAttempt = await runErasureJob({ pool, photoStore: workingStore, logger });
      expect(secondAttempt.erased).toBe(1);
      expect(await objectExists(failingKey)).toBe(false);
      const afterSecond = await pool.query<{ status: string }>('SELECT status FROM account WHERE id = $1', [accountId]);
      expect(afterSecond.rows[0]?.status).toBe('erased');
    });
  });
});
