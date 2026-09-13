// RV-scan-pipeline-11/16: ревью справедливо указал, что `recognize-scan.test.ts` проверяет
// ТОЛЬКО `provider_unavailable` (сетевая ошибка) — отдельного сценария РЕАЛЬНОГО таймаута
// (`AbortSignal` реально сработал по дедлайну, а не инъецированный отказ) и сохранения
// РЕАЛЬНОГО счётчика квоты (не мока) на этом пути НЕТ. Списание (шаг 3) происходит ДО
// вызова модели (шаг 4) — таймаут вызова обязан оставить списание НА МЕСТЕ (это плата за
// использованную попытку, а не откат), и это свойство разделяемого ресурса проверяется
// только настоящей БД (`shared-resource-verification.md`).

import { randomUUID } from 'node:crypto';
import { openSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger } from '@n4/shared';
import { recognizeScan, type RecognizeScanDeps, type RecognizeJob } from '../../../apps/recognizer/src/recognize/recognize-scan.js';
import { recordResult } from '../../../apps/recognizer/src/lease.js';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';
import type { ModelProvider, ModelRequest, ModelResponse } from '../../../apps/recognizer/src/provider/types.js';
import { migratedPool, seedSession, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-provider-timeout-quota');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

/** Провайдер, который НИКОГДА сам не резолвится и НИКОГДА не отклоняется — ждёт РЕАЛЬНОГО
 * `AbortSignal` от `invokeModel` (реальный дедлайн `recognize-scan.ts`, не инъецированный
 * отказ) и отклоняется РОВНО как настоящий SDK-клиент делал бы при отмене запроса. */
function neverResolvingUntilAborted(): ModelProvider {
  return {
    kind: 'fake',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
  };
}

describe('RV-scan-pipeline-16: провайдер РЕАЛЬНО таймаутит — квота остаётся списанной РОВНО один раз', () => {
  it('дедлайн вызова истекает по-настоящему (AbortController) — failed(provider_timeout), used=1 на реальном счётчике', async () => {
    const session = await seedSession(pool, 'provider-timeout');
    const recognitionId = randomUUID();
    await pool.query(
      `INSERT INTO recognition (id, device_session_id, status, idempotency_key, lease_fence) VALUES ($1, $2, 'queued', $3, 2)`,
      [recognitionId, session.id, randomUUID()],
    );

    // fence=2 => `mustChargeAgain` истинно независимо от дня — эта попытка ОБЯЗАНА списать
    // квоту на шаге 3, ДО вызова модели. `createdAt` — СВЕЖИЙ (полный бюджет 30 с
    // остаётся): МАТЕМАТИЧЕСКИ НЕОБХОДИМО, а не выбор удобства — если остаток бюджета К
    // МОМЕНТУ ВЫЗОВА меньше потолка вызова 25 с (`CANON.modelCallDeadlineMs`), дедлайн
    // вызова = ОСТАТКУ БЮДЖЕТА (`Math.min`), и тогда срабатывание таймера СОВПАДАЕТ с
    // границей общего бюджета С ТОЧНОСТЬЮ ДО МИЛЛИСЕКУНД — `finishLate` (шаг 9) детерминированно
    // застаёт `elapsed > budget` (таймер `setTimeout` никогда не срабатывает РАНЬШЕ
    // назначенного, только вовремя/позже) и переписывает причину на общий `timeout`,
    // проверяя другую ветку кода. ПОЭТОМУ здесь дедлайн обязан упереться в ФИКСИРОВАННЫЙ
    // потолок 25 с (запас 5 с ДО общего бюджета) — тест реально ждёт ~25 с.
    const createdAt = new Date();
    const job: RecognizeJob = { id: recognitionId, fence: 2, photoId: null, deviceSessionId: session.id, createdAt };

    const deps: RecognizeScanDeps = {
      pool,
      quotaLimits: { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1000 },
      provider: neverResolvingUntilAborted(),
      matchPort: createNullMatchIngredientPort(),
      normalize: async () => ({ ok: true, normalizedKey: 'stub-key' }),
      recordResult: (target, record) => recordResult(pool, target, record),
      logger: createLogger({ service: 'test', sink: () => {} }),
      modelCallLogFd: openSync('/dev/null', 'w'),
    };

    const outcome = await recognizeScan(job, deps);

    expect(outcome.writeOutcome).toBe('written');
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('provider_timeout');

    // Списание ПЕРЕЖИВАЕТ таймаут — оно уже случилось на шаге 3, ДО вызова модели, и
    // РЕАЛЬНЫЙ счётчик Postgres обязан остаться РОВНО на 1, а не 0 (откат) и не 2 (повтор).
    const counter = await pool.query<{ used: number }>(
      "SELECT used FROM scan_quota_counter WHERE scope = 'global'",
    );
    expect(counter.rows).toHaveLength(1);
    expect(counter.rows[0]?.used).toBe(1);
  }, 35_000);
});
