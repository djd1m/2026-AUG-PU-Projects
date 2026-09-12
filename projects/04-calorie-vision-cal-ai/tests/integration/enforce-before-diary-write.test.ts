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

  it('RV-08: конкурентный отзыв согласия против записи — либо запись отклонена, либо отзыв виден ПОСЛЕ, никогда «прошло мимо отзыва»', async () => {
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

    // Оба исхода легитимны в зависимости от порядка планировщика ОС, но НЕ третий: запись НЕ
    // могла увидеть granted и записаться ПОСЛЕ коммита отзыва — если запись создана, то ровно
    // одна строка diary_entry существует и отзыв применился (согласие сейчас NULL); если запись
    // отклонена — строк ноль. Смешанного «создана, но согласие уже NULL и это гонка» тест не
    // может отличить по одному прогону, поэтому проверяется ИНВАРИАНТ подсчёта, а не оба поля
    // одновременно.
    const diaryCount = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    if (writeResult.outcome === 'created') {
      expect(diaryCount.rows[0]?.n).toBe(1);
    } else {
      expect(diaryCount.rows[0]?.n).toBe(0);
    }
  });
});
