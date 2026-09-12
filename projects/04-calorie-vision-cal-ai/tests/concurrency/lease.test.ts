// КОНКУРЕНТНЫЙ прогон аренды, fencing и уборки (AC-foundation-10, AC-foundation-17,
// AC-foundation-18).
//
// Разные отказы закрываются РАЗНЫМИ механизмами, поэтому проверяются порознь:
//   * двойной захват ОДНОВРЕМЕННО — `FOR UPDATE SKIP LOCKED`;
//   * двойной захват ПОСЛЕ закрытия транзакции аренды — предикат `leased_until`, и только
//     он: блокировки строки после COMMIT уже нет;
//   * запись устаревшего владельца — `lease_fence`, а не время;
//   * незавершённая публикация — `photo_id IS NOT NULL`;
//   * бесконечный перезахват — `lease_fence < 3` вместе с уборщиком.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { acquireLease, MAX_LEASE_ATTEMPTS, recordResult, sweepStuckScans } from '../../apps/recognizer/src/lease.js';

/**
 * Предел захватов ИЗ СПЕЦИФИКАЦИИ (`FR-foundation-6`, DEC-A-015), ЛИТЕРАЛОМ.
 *
 * Брать здесь рабочую константу нельзя: смена `MAX_LEASE_ATTEMPTS` с 3 на 4 сдвинула бы
 * тест ВМЕСТЕ с кодом — он остался бы зелёным и проверял бы уже другое утверждение,
 * «предел равен самому себе». Тест обязан проверять ЧИСЛО, о котором договорились, а не
 * значение, прочитанное из проверяемого кода.
 *
 * `MAX_LEASE_ATTEMPTS` при этом импортируется намеренно: отдельное утверждение ниже сверяет
 * рабочую константу с этим литералом и краснеет, если код разошёлся со спецификацией.
 */
const SPEC_MAX_LEASE_ATTEMPTS = 3;
import { createWorker } from '../../apps/recognizer/src/worker.js';
import { createFakeModelProvider } from '../../apps/recognizer/src/provider/fake.js';
import { ModelDeadlineExceeded } from '../../apps/recognizer/src/provider/types.js';
import { migratedPool, seedPhoto, seedSession, truncateAll } from '../helpers/db.js';

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

/** Задание, готовое к работе: кадр уже опубликован, поэтому оно ВИДИМО воркеру. */
async function queueJob(marker: string): Promise<string> {
  const session = await seedSession(pool, marker);
  const photoId = await seedPhoto(pool, session.id, marker);
  const created = await pool.query<{ id: string }>(
    `INSERT INTO recognition (device_session_id, photo_id, status, idempotency_key)
     VALUES ($1, $2, 'queued', $3) RETURNING id`,
    [session.id, photoId, randomUUID()],
  );
  const id = created.rows[0]?.id;
  if (id === undefined) throw new Error('задание не создано');
  return id;
}

/** Заявленная строка БЕЗ кадра: публикация ещё не завершена. */
async function queueUnpublishedJob(marker: string): Promise<string> {
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

describe('предел захватов соответствует спецификации', () => {
  it('рабочая константа равна трём — числу из FR-foundation-6', () => {
    // ЕДИНСТВЕННОЕ место, где эти два числа сравниваются. Поменяли предел в коде — красным
    // станет именно это утверждение, а не десяток сценариев ниже, и будет видно: поменяли
    // решение, а спецификацию — нет.
    expect(MAX_LEASE_ATTEMPTS).toBe(SPEC_MAX_LEASE_ATTEMPTS);
  });
});

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

  it('задание без опубликованного кадра невидимо воркеру', async () => {
    const unpublished = await queueUnpublishedJob('lease-unpublished');

    // Строка заявляется ключом повторности РАНЬШЕ, чем кадр лёг в бакет. Воркер, взявший
    // её в этом окне, позвал бы модель на кадр, которого ещё нет: платная работа впустую.
    expect(await acquireLease(pool, randomUUID())).toBeUndefined();

    const row = await pool.query<{ lease_fence: number }>('SELECT lease_fence FROM recognition WHERE id = $1', [unpublished]);
    expect(row.rows[0]?.lease_fence).toBe(0);

    // Как только кадр опубликован, задание становится видимым — предикат не «теряет» его
    // навсегда, а ждёт завершения публикации.
    const session = await pool.query<{ device_session_id: string }>('SELECT device_session_id FROM recognition WHERE id = $1', [unpublished]);
    const photoId = await seedPhoto(pool, session.rows[0]!.device_session_id, 'lease-unpublished-late');
    await pool.query('UPDATE recognition SET photo_id = $2 WHERE id = $1', [unpublished, photoId]);

    const taken = await acquireLease(pool, randomUUID());
    expect(taken?.id).toBe(unpublished);
  }, 60_000);

  it('четвёртого захвата не бывает: при трёх исчерпанных задание больше не предлагается', async () => {
    const jobId = await queueJob('lease-cap');

    // ТРИ захвата — число из спецификации, а не из кода.
    for (const expectedFence of [1, 2, 3]) {
      const taken = await acquireLease(pool, randomUUID());
      expect(taken?.fence, `захват ${expectedFence}`).toBe(expectedFence);
      // Аренда истекает — задание снова свободно, и следующий воркер его законно берёт.
      await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
    }

    // ЧЕТВЁРТЫЙ захват — ОТДЕЛЬНОЕ утверждение: каждый захват оплачен, и у числа попыток
    // обязана быть верхняя граница, а не надежда.
    expect(await acquireLease(pool, randomUUID())).toBeUndefined();
    const row = await pool.query<{ lease_fence: number; status: string }>(
      'SELECT lease_fence, status::text AS status FROM recognition WHERE id = $1',
      [jobId],
    );
    // Ожидаемый номер — ЛИТЕРАЛ 3: при пределе 4 здесь стало бы 4, и тест обязан покраснеть.
    expect(row.rows[0]?.lease_fence).toBe(3);
    expect(row.rows[0]?.status).toBe('queued');
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
    expect(secondWritten).toBe('written');

    const staleWritten = await recordResult(pool, { id: jobId, fence: first!.fence }, {
      status: 'failed',
      confidence: 0.99,
      items: [],
      modelEstimateKcal: 999,
      modelUsed: 'haiku-4.5',
      failureReason: 'provider_timeout',
    });
    // НОЛЬ затронутых строк: проигравший записи не делает и чужой результат не трёт.
    // И случай назван ЧЕСТНО: номер захвата вырос, значит задание перезахватили — это
    // устаревшая аренда, а не работа уборщика.
    expect(staleWritten).toBe('stale_lease');

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
      async recognize(...args: Parameters<typeof fake.recognize>) {
        await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
        const stealer = await acquireLease(pool, randomUUID());
        expect(stealer?.id).toBe(jobId);
        return fake.recognize(...args);
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

describe('уборщик застрявших заданий', () => {
  it('задание, не взятое ни одним воркером за пять минут, закрывается failed timeout', async () => {
    const stuck = await queueJob('sweep-never-leased');
    const fresh = await queueJob('sweep-fresh');
    await pool.query("UPDATE recognition SET created_at = now() - interval '6 minutes' WHERE id = $1", [stuck]);

    const swept = await sweepStuckScans(pool);
    expect(swept.neverLeased).toBe(1);

    const rows = await pool.query<{ id: string; status: string; failure_reason: string | null }>(
      'SELECT id, status::text AS status, failure_reason::text AS failure_reason FROM recognition',
    );
    const closed = rows.rows.find((row) => row.id === stuck);
    const untouched = rows.rows.find((row) => row.id === fresh);
    expect(closed?.status).toBe('failed');
    expect(closed?.failure_reason).toBe('timeout');
    // Свежее задание уборщик не трогает: пять минут — это срок, а не повод закрыть всё.
    expect(untouched?.status).toBe('queued');

    // Повторный прогон идемпотентен: уже переведённых строк он не находит.
    expect((await sweepStuckScans(pool)).neverLeased).toBe(0);
  }, 60_000);

  it('задание с исчерпанными захватами и истёкшей арендой закрывается failed timeout', async () => {
    const jobId = await queueJob('sweep-exhausted');
    // Те же ТРИ захвата литералом: сценарий уборщика проверяет поведение при пределе из
    // спецификации, а не при том, что сейчас стоит в коде.
    for (const expectedFence of [1, 2, 3]) {
      const taken = await acquireLease(pool, randomUUID());
      expect(taken?.fence).toBe(expectedFence);
      await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
    }
    // Без уборщика такое задание не предложится НИ ОДНОМУ воркеру и провисит вечно.
    expect(await acquireLease(pool, randomUUID())).toBeUndefined();

    const swept = await sweepStuckScans(pool);
    expect(swept.attemptsExhausted).toBe(1);

    const row = await pool.query<{ status: string; failure_reason: string | null; finished_at: Date | null }>(
      'SELECT status::text AS status, failure_reason::text AS failure_reason, finished_at FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.status).toBe('failed');
    expect(row.rows[0]?.failure_reason).toBe('timeout');
    expect(row.rows[0]?.finished_at).not.toBeNull();
  }, 60_000);

  it('уборщик НЕ трогает задание с действующей арендой', async () => {
    const jobId = await queueJob('sweep-live-lease');
    await pool.query("UPDATE recognition SET created_at = now() - interval '6 minutes' WHERE id = $1", [jobId]);
    const taken = await acquireLease(pool, randomUUID());
    expect(taken?.fence).toBe(1);

    // Живой воркер внутри СВОЕЙ аренды следит за своим бюджетом сам. «Завершить задание,
    // не прекратив платную работу» — худший исход, чем задержка.
    const swept = await sweepStuckScans(pool);
    expect(swept).toEqual({ neverLeased: 0, attemptsExhausted: 0 });

    const row = await pool.query<{ status: string }>('SELECT status::text AS status FROM recognition WHERE id = $1', [jobId]);
    expect(row.rows[0]?.status).toBe('queued');
  }, 60_000);

  it('отказ по дедлайну ПОСЛЕ уборки пишет swept_as_timeout, а не только событие вызова', async () => {
    // Ветка таймаута возвращалась сразу после записи, поэтому события о нулевой записи на
    // ней не появлялись НИКОГДА (RV-foundation-01). Здесь адаптер отказывает по дедлайну в
    // тот момент, когда строку уже закрыл уборщик: в журнале обязаны быть ОБА события —
    // о вызове (попытка оплачена) и о судьбе записи (её отбросили).
    const jobId = await queueJob('timeout-after-sweep');
    // Два захвата израсходованы: следующий — последний разрешённый, ТРЕТИЙ.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await acquireLease(pool, randomUUID());
      await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
    }

    const lines: string[] = [];
    const logger = createLogger({ service: 'recognizer-test', sink: (line) => lines.push(line) });
    const timingOutAfterSweep = {
      kind: 'fake' as const,
      async recognize(): Promise<never> {
        await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
        expect((await sweepStuckScans(pool)).attemptsExhausted).toBe(1);
        throw new ModelDeadlineExceeded(30_000);
      },
    };

    const worker = createWorker({ pool, provider: timingOutAfterSweep, logger });
    expect(await worker.tick()).toBe(true);

    const events = lines.map((line) => JSON.parse(line).event);
    expect(events).toContain('model_call_deadline_exceeded');
    expect(events).toContain('swept_as_timeout');
    expect(events).not.toContain('scan_finished');

    // Терминальный статус уборщика не тронут: воркер не воскресил задание.
    const row = await pool.query<{ status: string; failure_reason: string | null; lease_fence: number }>(
      'SELECT status::text AS status, failure_reason::text AS failure_reason, lease_fence FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.status).toBe('failed');
    expect(row.rows[0]?.failure_reason).toBe('timeout');
    expect(row.rows[0]?.lease_fence).toBe(3);
  }, 60_000);

  it('отказ по дедлайну ПОСЛЕ перезахвата пишет stale_lease_result', async () => {
    // Второй потерянный случай той же ветки: пока воркер ждал модель, аренда истекла и
    // задание забрал другой. Его запись обязана быть отброшена, и это обязано быть НАЗВАНО.
    const jobId = await queueJob('timeout-after-steal');

    const lines: string[] = [];
    const logger = createLogger({ service: 'recognizer-test', sink: (line) => lines.push(line) });
    const timingOutAfterSteal = {
      kind: 'fake' as const,
      async recognize(): Promise<never> {
        await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
        const stealer = await acquireLease(pool, randomUUID());
        expect(stealer?.fence).toBe(2);
        throw new ModelDeadlineExceeded(30_000);
      },
    };

    const worker = createWorker({ pool, provider: timingOutAfterSteal, logger });
    expect(await worker.tick()).toBe(true);

    const events = lines.map((line) => JSON.parse(line).event);
    expect(events).toContain('model_call_deadline_exceeded');
    expect(events).toContain('stale_lease_result');
    expect(events).not.toContain('scan_finished');

    // Задание осталось за тем, кто держит актуальный номер захвата.
    const row = await pool.query<{ status: string; lease_fence: number }>(
      'SELECT status::text AS status, lease_fence FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.status).toBe('queued');
    expect(row.rows[0]?.lease_fence).toBe(2);
  }, 60_000);

  it('воркер не затирает статус, уже закрытый уборщиком', async () => {
    const jobId = await queueJob('sweep-vs-worker');
    // Два захвата уже израсходованы: следующий — последний разрешённый, ТРЕТИЙ (литерал).
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await acquireLease(pool, randomUUID());
      await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
    }
    const lines: string[] = [];
    const logger = createLogger({ service: 'recognizer-test', sink: (line) => lines.push(line) });

    const fake = createFakeModelProvider();
    const gatedProvider = {
      kind: fake.kind,
      async recognize(...args: Parameters<typeof fake.recognize>) {
        // Пока воркер «думает», его СОБСТВЕННАЯ аренда истекает. Захват у него последний,
        // третий, поэтому задание попадает под правило Б уборщика. Номер захвата при этом
        // НЕ меняется — значит различить уборщика и чужой перезахват можно только так.
        await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [jobId]);
        expect((await sweepStuckScans(pool)).attemptsExhausted).toBe(1);
        return fake.recognize(...args);
      },
    };

    const worker = createWorker({ pool, provider: gatedProvider, logger });
    await worker.tick();

    const events = lines.map((line) => JSON.parse(line).event);
    expect(events).toContain('swept_as_timeout');
    expect(events).not.toContain('scan_finished');

    // Терминальный статус уборщика остался: воркер не вернул задание к жизни задним числом.
    const row = await pool.query<{ status: string; failure_reason: string | null }>(
      'SELECT status::text AS status, failure_reason::text AS failure_reason FROM recognition WHERE id = $1',
      [jobId],
    );
    expect(row.rows[0]?.status).toBe('failed');
    expect(row.rows[0]?.failure_reason).toBe('timeout');
  }, 60_000);
});
