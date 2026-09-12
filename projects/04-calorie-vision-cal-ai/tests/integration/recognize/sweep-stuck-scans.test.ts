// `SweepStuckScans` (FR-scan-pipeline-16) — AC-scan-pipeline-22, -23, -36. Три независимых,
// идемпотентных правила проверяются на РЕАЛЬНОМ Postgres: вставляем строку в нужном
// состоянии напрямую (минуя `acquireLease`, который создавал бы состояние окольным путём) и
// проверяем эффект `sweepStuckScans`.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { sweepStuckScans } from '../../../apps/recognizer/src/recognize/sweep-stuck-scans.js';
import { migratedPool, seedSession, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-sweep');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function insertRecognition(overrides: {
  sessionId: string;
  createdAgoSeconds: number;
  leaseFence: number;
  leasedUntilAgoSeconds: number | null; // null = NULL (никогда не арендовано); отрицательное = в будущем (живая аренда)
}): Promise<string> {
  const row = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, status, idempotency_key, created_at, lease_fence, leased_until)
     VALUES ($1, 'queued', $2,
             now() - ($3 || ' seconds')::interval,
             $4,
             CASE WHEN $5::float IS NULL THEN NULL ELSE now() - ($5 || ' seconds')::interval END)
     RETURNING id`,
    [overrides.sessionId, randomUUID(), overrides.createdAgoSeconds, overrides.leaseFence, overrides.leasedUntilAgoSeconds],
  );
  const id = row.rows[0]?.id;
  if (id === undefined) throw new Error('строка не создана');
  return id;
}

async function statusOf(id: string): Promise<{ status: string; failure_reason: string | null }> {
  const result = await pool.query<{ status: string; failure_reason: string | null }>(
    'SELECT status::text AS status, failure_reason::text AS failure_reason FROM recognition WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('строка не найдена');
  return row;
}

describe('Правило А — никогда не захвачено (AC-scan-pipeline-23)', () => {
  it('queued дольше 5 минут без единого захвата — сметается в failed(timeout)', async () => {
    const session = await seedSession(pool, 'sweep-a-old');
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 301, leaseFence: 0, leasedUntilAgoSeconds: null });

    await sweepStuckScans(pool);

    const after = await statusOf(id);
    expect(after.status).toBe('failed');
    expect(after.failure_reason).toBe('timeout');
  });

  it('queued МОЛОЖЕ 5 минут без захвата — НЕ трогается', async () => {
    const session = await seedSession(pool, 'sweep-a-fresh');
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 60, leaseFence: 0, leasedUntilAgoSeconds: null });

    await sweepStuckScans(pool);

    const after = await statusOf(id);
    expect(after.status).toBe('queued');
  });

  it('повторный прогон в ту же секунду не находит уже переведённую строку снова (идемпотентность)', async () => {
    const session = await seedSession(pool, 'sweep-a-idempotent');
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 301, leaseFence: 0, leasedUntilAgoSeconds: null });

    const first = await sweepStuckScans(pool);
    const second = await sweepStuckScans(pool);

    expect(first.neverLeased).toBe(1);
    expect(second.neverLeased).toBe(0);
    expect((await statusOf(id)).status).toBe('failed');
  });
});

describe('Правило Б — предел захватов исчерпан (AC-scan-pipeline-22)', () => {
  it('lease_fence = 3, аренда истекла — сметается в failed(timeout)', async () => {
    const session = await seedSession(pool, 'sweep-b');
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 10, leaseFence: 3, leasedUntilAgoSeconds: 5 });

    await sweepStuckScans(pool);

    expect((await statusOf(id)).status).toBe('failed');
    expect((await statusOf(id)).failure_reason).toBe('timeout');
  });

  it('lease_fence = 3, но аренда ЕЩЁ действует — НЕ трогается (это уже Правило В/живая аренда)', async () => {
    const session = await seedSession(pool, 'sweep-b-live');
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 10, leaseFence: 3, leasedUntilAgoSeconds: -30 });

    await sweepStuckScans(pool);

    expect((await statusOf(id)).status).toBe('queued');
  });
});

describe('Правило В — общий дедлайн задачи, ТОЛЬКО без живой аренды (AC-scan-pipeline-36)', () => {
  it('sweeper НЕ изменяет задание с ЖИВОЙ арендой, даже если created_at старше 30 с', async () => {
    const session = await seedSession(pool, 'sweep-c-live-lease');
    // Захвачено (fence=1), created_at 45с назад (> бюджета 30с), но leased_until ЕЩЁ в будущем —
    // живой воркер продолжает работу под своим AbortController.
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 45, leaseFence: 1, leasedUntilAgoSeconds: -20 });

    const result = await sweepStuckScans(pool);

    expect((await statusOf(id)).status).toBe('queued');
    expect(result.taskBudgetExpired).toBe(0);
  });

  it('задание с истёкшей арендой старше 30 с — сметается в failed(timeout)', async () => {
    const session = await seedSession(pool, 'sweep-c-expired-lease');
    const id = await insertRecognition({ sessionId: session.id, createdAgoSeconds: 45, leaseFence: 1, leasedUntilAgoSeconds: 10 });

    const result = await sweepStuckScans(pool);

    expect((await statusOf(id)).status).toBe('failed');
    expect((await statusOf(id)).failure_reason).toBe('timeout');
    expect(result.taskBudgetExpired).toBe(1);
  });
});
