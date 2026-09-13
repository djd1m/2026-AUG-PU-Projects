// EnforceConsentBeforeDiaryWrite (AC-consent-and-telegram-auth-11) — два прогона: владелец
// account И анонимная device_session, исключения по типу сессии НЕТ (DEC-A-019).
//
// Правка по review-report.md RV-consent-and-telegram-auth-08: `ownerKey` больше не принимается
// отдельным параметром (см. `diary-entry-repository.ts`) — запись ВСЕГДА создаётся на
// `input.owner.id`, том же идентификаторе, для которого проверено согласие. Ниже добавлены:
// тест, доказывающий это по факту записанного `owner_key` (а не только по типам), и конкурентный
// тест «отзыв согласия против записи» — проверка и запись сериализованы `FOR UPDATE`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createDiaryEntryGuarded } from '../../apps/api/src/diary/diary-entry-repository.js';
import { migratedPool, truncateAll } from '../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-enforce-consent');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function seedSessionWithRecognition(): Promise<{ sessionId: string; recognitionId: string }> {
  const session = await pool.query<{ id: string }>(
    `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
     VALUES ($1, $2, now() + interval '7 days') RETURNING id`,
    [`hash-${Math.random()}`, '203.0.113.0/24'],
  );
  const sessionId = session.rows[0]!.id;
  const recognition = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
    [sessionId],
  );
  return { sessionId, recognitionId: recognition.rows[0]!.id };
}

/** Та же заготовка, но для УЖЕ существующей сессии (review3 RV-02: сессия связана заранее). */
async function seedSessionWithRecognitionFor(sessionId: string): Promise<{ recognitionId: string }> {
  const recognition = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, status) VALUES ($1, 'done') RETURNING id`,
    [sessionId],
  );
  return { recognitionId: recognition.rows[0]!.id };
}

async function seedAccount(telegramUserId: string, consentAt: 'now' | null): Promise<string> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, tier, status, consent_at)
     VALUES ($1, 'free', 'active', ${consentAt === 'now' ? 'now()' : 'NULL'}) RETURNING id`,
    [telegramUserId],
  );
  return account.rows[0]!.id;
}

const ENTRY_FIELDS = {
  eatenOn: new Date().toISOString().slice(0, 10),
  mealSlot: 'lunch' as const,
  items: [],
  kcalTotal: 100,
  proteinTotal: 1,
  fatTotal: 1,
  carbTotal: 1,
  sourceSnapshot: {},
};

describe('EnforceConsentBeforeDiaryWrite (через createDiaryEntryGuarded)', () => {
  it('АНОНИМНАЯ device_session без consent_at — 403-эквивалент, строка не создаётся (DEC-A-019)', async () => {
    const { sessionId, recognitionId } = await seedSessionWithRecognition();

    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'device_session', id: sessionId },
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });
    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('account без consent_at — тот же отказ, что анонимная сессия', async () => {
    const accountId = await seedAccount('920001', null);
    const { recognitionId } = await seedSessionWithRecognition();

    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'account', id: accountId },
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });
  });

  it('с согласием (consent_at заполнен) — запись создаётся НА ТОГО ЖЕ владельца, для которого проверено согласие', async () => {
    const { sessionId, recognitionId } = await seedSessionWithRecognition();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);

    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'device_session', id: sessionId },
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result.outcome).toBe('created');
    // RV-08: owner_key записанной строки ОБЯЗАН совпадать с owner.id — нет отдельного
    // параметра, который мог бы разойтись с проверенным владельцем.
    const rows = await pool.query<{ owner_key: string }>('SELECT owner_key FROM diary_entry');
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.owner_key).toBe(sessionId);
  });

  it('конкурентный отзыв согласия против записи — прежний тест (для сравнения, второй обзор): оба исхода легитимны без управляемого барьера', async () => {
    const accountId = await seedAccount('920002', 'now');
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
       VALUES ($1, $2, now() + interval '7 days') RETURNING id`,
      [`hash-${Math.random()}`, '203.0.113.0/24'],
    );
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [session.rows[0]!.id, accountId],
    );
    const recognitionId = recognition.rows[0]!.id;

    const [writeResult] = await Promise.all([
      createDiaryEntryGuarded(pool, { owner: { table: 'account', id: accountId }, recognitionId, ...ENTRY_FIELDS }),
      pool.query(`UPDATE account SET consent_at = NULL WHERE id = $1`, [accountId]),
    ]);

    // Оба исхода легитимны в зависимости от порядка планировщика ОС — RV-consent-and-telegram-auth-08
    // (третий обзор) назвал это НЕДОСТАТОЧНЫМ доказательством сериализации (тест зеленеет и на
    // реализации, где запись НЕ сериализована с отзывом вовсе): см. управляемый тест НИЖЕ,
    // который принудительно ставит отзыв ПЕРВЫМ и требует РОВНО ОДИН исход.
    const diaryCount = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    if (writeResult.outcome === 'created') {
      expect(diaryCount.rows[0]?.n).toBe(1);
    } else {
      expect(diaryCount.rows[0]?.n).toBe(0);
    }
  });

  it('review3 RV-08: УПРАВЛЯЕМЫЙ барьер — отзыв, удерживающий блокировку строки account, коммитится ПЕРВЫМ; запись ОБЯЗАНА увидеть отозванное согласие, единственный легитимный исход', async () => {
    const accountId = await seedAccount('920010', 'now');
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
       VALUES ($1, $2, now() + interval '7 days') RETURNING id`,
      [`hash-${Math.random()}`, '203.0.113.0/24'],
    );
    const recognition = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, account_id, status) VALUES ($1, $2, 'done') RETURNING id`,
      [session.rows[0]!.id, accountId],
    );
    const recognitionId = recognition.rows[0]!.id;

    // Барьер: захватываем блокировку строки account СНАРУЖИ, ДО того как запись вообще
    // начинает свою транзакцию — `enforceConsentBeforeDiaryWrite`'s `SELECT … FOR UPDATE`
    // ГАРАНТИРОВАННО либо встанет в очередь за этим локом (если успеет отправить запрос до
    // COMMIT ниже), либо (если опоздает) прочитает УЖЕ закоммиченное `NULL` напрямую — оба
    // пути под READ COMMITTED дают ОДИН И ТОТ ЖЕ результат: строка перечитывается ПОСЛЕ
    // конкурентного UPDATE, который её изменил, а не отдаёт устаревший снимок.
    const lockClient = await pool.connect();
    try {
      await lockClient.query('BEGIN');
      await lockClient.query('SELECT consent_at FROM account WHERE id = $1 FOR UPDATE', [accountId]);

      const writePromise = createDiaryEntryGuarded(pool, { owner: { table: 'account', id: accountId }, recognitionId, ...ENTRY_FIELDS });

      // Отзыв — и коммит, освобождающий лок, — ПЕРВЫМ по построению: запись не может увидеть
      // строку раньше этого коммита ни при каком порядке планировщика ОС.
      await lockClient.query(`UPDATE account SET consent_at = NULL WHERE id = $1`, [accountId]);
      await lockClient.query('COMMIT');

      const writeResult = await writePromise;

      // РОВНО один легитимный исход теперь — не «оба»: барьер снял неопределённость.
      expect(writeResult).toEqual({ outcome: 'refused', reason: 'consent_required' });
      const diaryCount = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE recognition_id = $1', [recognitionId]);
      expect(diaryCount.rows[0]?.n).toBe(0);
      // Независимое постусловие (RV-08: «независимые постусловия», не только подсчёт diary_entry).
      const account = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM account WHERE id = $1', [accountId]);
      expect(account.rows[0]?.consent_at).toBeNull();
    } finally {
      lockClient.release();
    }
  });

  it('review3 RV-02: сессия СВЯЗАНА с аккаунтом, который отозвал согласие — историческое device_session.consent_at БОЛЬШЕ НЕ разрешает запись', async () => {
    // Воспроизводит ТОЧНЫЙ сценарий находки: анонимный grant → вход → withdraw → прямой вызов
    // репозитория с device_session-owner той же сессии (минуя маршрут, тот самый обход,
    // который эта граница обязана перекрывать — AC-consent-and-telegram-auth-11).
    const accountId = await seedAccount('920020', null);
    const session = await pool.query<{ id: string }>(
      `INSERT INTO device_session (account_id, cookie_token_hash, ip_prefix, anonymous_diary_expires_at, consent_version, consent_text_hash, consent_at)
       VALUES ($1, $2, $3, now() + interval '7 days', '2026-09-v1', 'x', now() - interval '1 hour') RETURNING id`,
      [accountId, `hash-${Math.random()}`, '203.0.113.0/24'],
    );
    const sessionId = session.rows[0]!.id;
    // Перенос согласия при входе (DEC-A-019): аккаунт получает своё consent_at от сессии.
    await pool.query(`UPDATE account SET consent_at = now() - interval '1 hour' WHERE id = $1`, [accountId]);
    // Отзыв (withdraw_consent, account-delete.ts): обнуляет ТОЛЬКО account.consent_at —
    // device_session.consent_at остаётся заполненным (исторический факт, поле не трогается).
    await pool.query(`UPDATE account SET consent_at = NULL WHERE id = $1`, [accountId]);

    const { recognitionId } = await seedSessionWithRecognitionFor(sessionId);

    // РАНЬШЕ: вызов с owner.table='device_session' читал ТОЛЬКО device_session.consent_at
    // (не NULL, потому что withdraw его не трогает) и создавал запись, хотя аккаунт отозвал.
    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'device_session', id: sessionId },
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });
    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE recognition_id = $1', [recognitionId]);
    expect(rows.rows[0]?.n).toBe(0);
    // Независимое постусловие: device_session.consent_at действительно ОСТАЁТСЯ заполненным —
    // отказ произошёл НЕ потому, что поле сессии тоже как-то обнулилось.
    const sessionRow = await pool.query<{ consent_at: Date | null }>('SELECT consent_at FROM device_session WHERE id = $1', [sessionId]);
    expect(sessionRow.rows[0]?.consent_at).not.toBeNull();
  });

  it('review3 RV-05 (проверка со стороны записи): аккаунт erasing с формально заполненным consent_at ВСЁ РАВНО отказывает записи', async () => {
    // withdraw_consent не переводит статус; erase_all переводит в erasing, НЕ трогая
    // consent_at напрямую (он мог быть уже NULL или ещё заполнен на момент запроса удаления).
    // Проверяем ИМЕННО статус как самостоятельное условие отказа — не согласие.
    const account = await pool.query<{ id: string }>(
      `INSERT INTO account (telegram_user_id, tier, status, consent_at, deletion_requested_at)
       VALUES ($1, 'free', 'erasing', now(), now()) RETURNING id`,
      ['920030'],
    );
    const accountId = account.rows[0]!.id;
    const { recognitionId } = await seedSessionWithRecognition();

    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'account', id: accountId },
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });
    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE recognition_id = $1', [recognitionId]);
    expect(rows.rows[0]?.n).toBe(0);
  });
});
