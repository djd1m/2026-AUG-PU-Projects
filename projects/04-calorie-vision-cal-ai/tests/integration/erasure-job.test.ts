// RunErasureJob (AC-consent-and-telegram-auth-15/16).
//
// `photoStore` — ЗАГЛУШКА S3-клиента с проверкой вызовов (04_completion.md, «Отклонения»):
// реального S3-клиента в кодовой базе нет, а архитектура фичи сознательно не вводит новую
// npm-зависимость (`03_architecture.md`, «Зависимости npm»). Заглушка записывает КАЖДЫЙ вызов
// `purgeObject`, и тест проверяет ИМЕННО эти вызовы — не факт удаления объекта из бакета.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { runErasureJob, type PhotoStorePort } from '../../apps/recognizer/src/consent/erasure-job.js';
import { migratedPool, truncateAll } from '../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-erasure-job');
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

async function seedErasingAccount(telegramUserId: string): Promise<{ accountId: string; sessionId: string }> {
  const account = await pool.query<{ id: string }>(
    `INSERT INTO account (telegram_user_id, tier, status, deletion_requested_at)
     VALUES ($1, 'free', 'erasing', now()) RETURNING id`,
    [telegramUserId],
  );
  const accountId = account.rows[0]!.id;
  const session = await pool.query<{ id: string }>(
    `INSERT INTO device_session (account_id, cookie_token_hash, ip_prefix, anonymous_diary_expires_at)
     VALUES ($1, $2, $3, now() + interval '7 days') RETURNING id`,
    [accountId, `hash-${telegramUserId}`, '203.0.113.0/24'],
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
});
