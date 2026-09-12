// EnforceConsentBeforeDiaryWrite (AC-consent-and-telegram-auth-11) — два прогона: владелец
// account И анонимная device_session, исключения по типу сессии НЕТ (DEC-A-019).

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
      ownerKey: sessionId,
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });
    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry');
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('account без consent_at — тот же отказ, что анонимная сессия', async () => {
    const account = await pool.query<{ id: string }>(
      `INSERT INTO account (telegram_user_id, tier, status) VALUES ($1, 'free', 'active') RETURNING id`,
      ['920001'],
    );
    const accountId = account.rows[0]!.id;
    const { recognitionId } = await seedSessionWithRecognition();

    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'account', id: accountId },
      ownerKey: accountId,
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result).toEqual({ outcome: 'refused', reason: 'consent_required' });
  });

  it('с согласием (consent_at заполнен) — запись создаётся', async () => {
    const { sessionId, recognitionId } = await seedSessionWithRecognition();
    await pool.query(`UPDATE device_session SET consent_at = now() WHERE id = $1`, [sessionId]);

    const result = await createDiaryEntryGuarded(pool, {
      owner: { table: 'device_session', id: sessionId },
      ownerKey: sessionId,
      recognitionId,
      ...ENTRY_FIELDS,
    });

    expect(result.outcome).toBe('created');
    const rows = await pool.query('SELECT count(*)::int AS n FROM diary_entry WHERE owner_key = $1', [sessionId]);
    expect(rows.rows[0]?.n).toBe(1);
  });
});
