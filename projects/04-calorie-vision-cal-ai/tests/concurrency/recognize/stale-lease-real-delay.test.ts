// AC-scan-pipeline-17: устаревшая аренда С РЕАЛЬНЫМ ВЫЗОВОМ ПРОВАЙДЕРА (управляемая
// задержка), через ПОЛНЫЙ `RecognizeScanWithinScanPipeline` — не только `acquireLease`
// (это уже покрыто `foundation`'s `lease.test.ts`). Гонка ВОСПРОИЗВОДИТСЯ ТОЧНО: провайдер
// воркера A ждёт управляемый `Deferred`, а не таймер — иначе тест зеленел бы через раз.

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { acquireLease, recordResult } from '../../../apps/recognizer/src/lease.js';
import { recognizeScan, type RecognizeScanDeps } from '../../../apps/recognizer/src/recognize/recognize-scan.js';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';
import type { ModelProvider, ModelResponse } from '../../../apps/recognizer/src/provider/types.js';
import { migratedPool, seedPhoto, seedSession, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-stale-lease-real');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fixedResponse(): ModelResponse {
  return { items: [{ labelRu: 'борщ', massG: 200, candidates: [] }], confidence: 0.9, modelEstimateKcal: 300, model: 'haiku-4.5' };
}

const GENEROUS_QUOTA = { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1000 };

function baseDeps(provider: ModelProvider): RecognizeScanDeps {
  return {
    pool,
    quotaLimits: GENEROUS_QUOTA,
    provider,
    matchPort: createNullMatchIngredientPort(),
    normalize: async () => ({ ok: true, normalizedKey: 'stub-key' }),
    recordResult: (target, record) => recordResult(pool, target, record),
    logger: createLogger({ service: 'test', sink: () => {} }),
  };
}

describe('устаревшая аренда с реальным вызовом провайдера (AC-scan-pipeline-17)', () => {
  it('воркер A получает ответ ПОЗЖЕ, чем B успевает захватить и завершить задание: запись A затрагивает НОЛЬ строк, результат B не тронут, аудит несёт stale_lease_result', async () => {
    const session = await seedSession(pool, 'stale-real-delay');
    // Кадр ОБЯЗАН быть опубликован: предикат выборки `foundation` несёт `photo_id IS NOT
    // NULL` — заявленная, но незавершённая публикация воркеру не предлагается (DEC-A-015),
    // иначе он позвал бы модель на кадр, которого ещё нет. Ветка `scan-pipeline` писала
    // фикстуру без кадра и потому это условие в предикат не вносила; при слиянии условие
    // сохранено, а фикстура приведена к состоянию, которое она и изображает, — к заданию,
    // ГОТОВОМУ к работе.
    const photoId = await seedPhoto(pool, session.id, 'stale-real-delay');
    const created = await pool.query<{ id: string }>(
      `INSERT INTO recognition (device_session_id, photo_id, status, idempotency_key) VALUES ($1, $2, 'queued', $3) RETURNING id`,
      [session.id, photoId, randomUUID()],
    );
    const scanId = created.rows[0]?.id;
    if (scanId === undefined) throw new Error('задание не создано');

    const jobA = await acquireLease(pool, randomUUID());
    expect(jobA?.fence).toBe(1);

    const gate = deferred<ModelResponse>();
    const providerA: ModelProvider = { kind: 'fake', recognize: async () => gate.promise };
    const recognizeAPromise = recognizeScan(jobA!, baseDeps(providerA));

    // ПОКА A «ждёт ответ провайдера» (на самом деле — наш Deferred), аренда искусственно
    // истекает, и B захватывает то же задание и ЗАВЕРШАЕТ его первым — целиком, полным
    // конвейером, с быстрым (не отложенным) фейком.
    await pool.query("UPDATE recognition SET leased_until = now() - interval '1 minute' WHERE id = $1", [scanId]);
    const jobB = await acquireLease(pool, randomUUID());
    expect(jobB?.id).toBe(scanId);
    expect(jobB?.fence).toBe(2);

    const providerB: ModelProvider = { kind: 'fake', recognize: async () => fixedResponse() };
    const outcomeB = await recognizeScan(jobB!, baseDeps(providerB));
    expect(outcomeB.writeOutcome).toBe('written');
    expect(outcomeB.status).toBe('failed'); // NullMatchIngredientPort — done недостижим
    expect(outcomeB.failureReason).toBe('no_food_matched');

    // ТЕПЕРЬ отпускаем ответ A — он приходит ПОЗЖЕ, чем задание уже закрыто B.
    gate.resolve(fixedResponse());
    const outcomeA = await recognizeAPromise;

    expect(outcomeA.writeOutcome).toBe('stale_lease_result');

    const row = await pool.query<{ status: string; lease_fence: number }>('SELECT status::text AS status, lease_fence FROM recognition WHERE id = $1', [scanId]);
    // Результат B остаётся НЕТРОНУТЫМ: fence в базе — B'шный (2), статус — его результат.
    expect(row.rows[0]?.lease_fence).toBe(2);
    expect(row.rows[0]?.status).toBe('failed');

    // Денежная цена fencing (fence=2 списывает ВТОРУЮ попытку primary — FR-scan-pipeline-15,
    // DEC-A-008) проверена ОТДЕЛЬНО, юнит-тестом `recognize-scan.test.ts` (шаг 3, с
    // инъецированным `consumeQuota`) — предмет ЭТОГО теста именно гонка РЕЗУЛЬТАТА, не квота.
  }, 20_000);
});
