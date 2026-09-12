// КОНКУРЕНТНЫЙ прогон аренды и fencing (AC-foundation-10).
//
// Два разных отказа проверяются отдельно, потому что закрываются РАЗНЫМИ механизмами:
//   * двойной захват ОДНОВРЕМЕННО — закрывает `FOR UPDATE SKIP LOCKED`;
//   * двойной захват ПОСЛЕ закрытия транзакции аренды — закрывает предикат `leased_until`,
//     и только он: блокировки строки после COMMIT уже нет.
// Устаревший владелец обязан написать НОЛЬ строк — это `lease_fence`, а не время.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { acquireLease, recordResult } from '../../apps/recognizer/src/lease.js';
import { createWorker } from '../../apps/recognizer/src/worker.js';
import { createFakeModelProvider } from '../../apps/recognizer/src/provider/fake.js';
import { migratedPool, seedSession, truncateAll } from '../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-lease');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

async function queueJob(marker: string): Promise<string> {
  const session = await seedSession(pool, marker);
  const created = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, status, idempotency_key)
     VALUES ($1, 'queued', $2) RETURNING id`,
    [session.id, randomUUID()],
  );
  const id = created.rows[0]?.id;
  if (id === undefined) throw new Error('задание не создано');
  return id;
}

describe('аренда задания', () => {
  it('два воркера на одно задание дают ровно один захват', async () => {
    const jobId = await queueJob('lease-single');

    const [first, second] = await Promise.all([acquireLease(pool, randomUUID()), acquireLease(pool, randomUUID())]);
    const taken = [first, second].filter((job) => job !== undefined);

    expect(taken).toHaveLength(1);
    expect(taken[0]?.id).toBe(jobId);
    // Счётчик захватов увеличен РОВНО на один.
    expect(taken[0]?.fence).toBe(1);

    const row = await pool.query<{ lease_fence: number; lease_owner: string | null }>(
      'SELECT lease_fence, lease_owner FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.lease_fence).toBe(1);
    expect(row.rows[0]?.lease_owner).not.toBeNull();
  }, 60_000);

  it('десять воркеров на три задания не берут ни одно дважды и не теряют ни одного', async () => {
    const jobs = await Promise.all([queueJob('lease-a'), queueJob('lease-b'), queueJob('lease-c')]);

    const results = await Promise.all(Array.from({ length: 10 }, () => acquireLease(pool, randomUUID())));
    const taken = results.filter((job) => job !== undefined).map((job) => job!.id);

    expect(taken.sort()).toEqual([...jobs].sort());
    expect(new Set(taken).size).toBe(3);
  }, 60_000);

  it('результат с устаревшим fence затрагивает ноль строк и пишет stale_lease_result', async () => {
    const jobId = await queueJob('lease-stale');

    const firstOwner = randomUUID();
    const first = await acquireLease(pool, firstOwner);
    expect(first?.fence).toBe(1);

    // Аренда истекает искусственно. Первый воркер при этом ЖИВ — и именно поэтому
    // различать их временем нельзя, только номером захвата.
    await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);

    const second = await acquireLease(pool, randomUUID());
    expect(second?.id).toBe(jobId);
    expect(second?.fence).toBe(2);

    const secondWritten = await recordResult(pool, { id: jobId, fence: second!.fence }, {
      status: 'refused',
      confidence: 0.42,
      items: [],
      modelEstimateKcal: 321,
      modelUsed: 'haiku-4.5',
      failureReason: 'no_food_matched',
    });
    expect(secondWritten).toBe(true);

    const staleWritten = await recordResult(pool, { id: jobId, fence: first!.fence }, {
      status: 'failed',
      confidence: 0.99,
      items: [],
      modelEstimateKcal: 999,
      modelUsed: 'haiku-4.5',
      failureReason: 'provider_timeout',
    });
    // НОЛЬ затронутых строк: проигравший записи не делает и чужой результат не трёт.
    expect(staleWritten).toBe(false);

    const row = await pool.query<{ status: string; model_estimate_kcal: number; failure_reason: string }>(
      'SELECT status::text AS status, model_estimate_kcal, failure_reason::text AS failure_reason FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.status).toBe('refused');
    expect(row.rows[0]?.model_estimate_kcal).toBe(321);
    expect(row.rows[0]?.failure_reason).toBe('no_food_matched');
  }, 60_000);

  it('воркер с устаревшим захватом пишет событие stale_lease_result в журнал', async () => {
    const jobId = await queueJob('lease-worker-log');
    const lines: string[] = [];
    const logger = createLogger({ service: 'recognizer-test', sink: (line) => lines.push(line) });

    // Поставщик-«ворота»: пока он думает, задание перехватывает другой воркер. Гонка здесь
    // ВОСПРОИЗВОДИТСЯ ТОЧНО, а не подгадывается таймингом — иначе тест зеленел бы через раз
    // и ничего бы не доказывал.
    const fake = createFakeModelProvider();
    const gatedProvider = {
      kind: fake.kind,
      async recognize(request: Parameters<typeof fake.recognize>[0]) {
        await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
        const stealer = await acquireLease(pool, randomUUID());
        expect(stealer?.id).toBe(jobId);
        return fake.recognize(request);
      },
    };

    const worker = createWorker({ pool, provider: gatedProvider, logger });
    const handled = await worker.tick();

    expect(handled).toBe(true);
    const events = lines.map((line) => JSON.parse(line).event);
    expect(events).toContain('stale_lease_result');
    expect(events).not.toContain('scan_finished');

    // Результат отброшен: задание осталось за тем, кто держит актуальный номер захвата.
    const row = await pool.query<{ status: string; lease_fence: number }>(
      'SELECT status::text AS status, lease_fence FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.lease_fence).toBe(2);
    expect(row.rows[0]?.status).toBe('queued');
  }, 60_000);
});
