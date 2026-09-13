// RV-scan-pipeline-11/13: ревью справедливо указал, что `escalation-parallel.test.ts`
// (Попытка 2) проверяет ТОЛЬКО атомарность счётчика `checkAndConsumeQuota(reason=
// 'escalation')`, вызванного НАПРЯМУЮ — а не то, что заявляет AC-scan-pipeline-13: «ровно
// один вызов получает granted» ДОЛЖНО означать «ровно ОДИН вызов реально доходит до
// провайдера со вторым (эскалационным) запросом», а 19 остальных — НЕТ. Тест, проверяющий
// только счётчик, не отличает «квота решила верно, но код всё равно позвонил провайдеру
// 20 раз» от настоящей защиты. Этот тест прогоняет ПОЛНЫЙ `recognizeScan` 20 раз
// КОНКУРЕНТНО с настоящей БД (реальная атомарность `scan_quota_counter`) и считает
// РЕАЛЬНЫЕ обращения к `ModelProvider.recognize` с моделью эскалации.

import { randomUUID } from 'node:crypto';
import { openSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DbPool } from '@n4/db';
import { createLogger, CANON } from '@n4/shared';
import { recognizeScan, type RecognizeScanDeps, type RecognizeJob } from '../../../apps/recognizer/src/recognize/recognize-scan.js';
import { recordResult } from '../../../apps/recognizer/src/lease.js';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';
import type { ModelProvider, ModelRequest, ModelResponse } from '../../../apps/recognizer/src/provider/types.js';
import { migratedPool, seedSession, truncateAll } from '../../helpers/db.js';

let pool: DbPool;

beforeAll(async () => {
  pool = await migratedPool('n4-tests-escalation-provider-concurrency');
}, 60_000);

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
});

function countingProvider(escalationCalls: { count: number }): ModelProvider {
  return {
    kind: 'fake',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      if (request.model === CANON.modelEscalation) {
        escalationCalls.count += 1;
        return { items: [{ labelRu: 'плов', massG: 300, candidates: [] }], confidence: 0.95, modelEstimateKcal: 450, model: request.model };
      }
      // Первичный вызов — НИЗКАЯ уверенность, чтобы КАЖДАЯ из 20 попыток претендовала на
      // эскалацию (иначе тест ничего не докажет о конкурентности самой эскалации).
      return { items: [{ labelRu: 'плов', massG: 300, candidates: [] }], confidence: 0.3, modelEstimateKcal: 450, model: request.model };
    },
  };
}

describe('RV-scan-pipeline-13: конкурентная эскалация РЕАЛЬНО зовёт провайдера РОВНО один раз', () => {
  it('20 параллельных recognizeScan с confidence < порога — РОВНО 1 реальный вызов эскалационной модели', async () => {
    const limits = { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1 };
    const escalationCalls = { count: 0 };
    const provider = countingProvider(escalationCalls);
    const now = new Date();

    const jobs: RecognizeJob[] = [];
    for (let i = 0; i < 20; i += 1) {
      const session = await seedSession(pool, `escalation-provider-${i}`);
      const recognitionId = randomUUID();
      await pool.query(
        `INSERT INTO recognition (id, device_session_id, status, idempotency_key, lease_fence) VALUES ($1, $2, 'queued', $3, 1)`,
        [recognitionId, session.id, randomUUID()],
      );
      jobs.push({ id: recognitionId, fence: 1, photoId: null, deviceSessionId: session.id, createdAt: now });
    }

    const runOne = (job: RecognizeJob): ReturnType<typeof recognizeScan> => {
      const deps: RecognizeScanDeps = {
        pool,
        quotaLimits: limits,
        provider,
        matchPort: createNullMatchIngredientPort(),
        normalize: async () => ({ ok: true, normalizedKey: 'stub-key' }),
        recordResult: (target, record) => recordResult(pool, target, record),
        logger: createLogger({ service: 'test', sink: () => {} }),
        modelCallLogFd: openSync('/dev/null', 'w'),
        // БЕЗ lookupIpPrefix — реальный SELECT по device_session (RV-scan-pipeline-02).
      };
      return recognizeScan(job, deps);
    };

    const outcomes = await Promise.all(jobs.map((job) => runOne(job)));

    // Инвариант AC-13, В ТОЧНОСТИ как заявлено ревью: РОВНО один РЕАЛЬНЫЙ вызов провайдера
    // со второй (эскалационной) моделью — не 20, не 0.
    expect(escalationCalls.count).toBe(1);

    // Атомарность счётчика — то же свойство, что уже проверял escalation-parallel.test.ts,
    // теперь как СЛЕДСТВИЕ полного конвейера, а не изолированного вызова функции.
    const counter = await pool.query<{ used: number }>("SELECT used FROM scan_quota_counter WHERE scope = 'escalation'");
    expect(counter.rows).toHaveLength(1);
    expect(counter.rows[0]?.used).toBe(1);

    // Ни одна попытка не потеряна: ВСЕ 20 получили терминальный статус (done — эскалация
    // подняла уверенность у победителя выше порога; у остальных 19 эскалация ОТКАЗАНА
    // квотой, но исходный ПЕРВИЧНЫЙ (низкоуверенный) результат всё равно записывается —
    // NullMatchIngredientPort всегда возвращает foodItemId=null, поэтому итог 'failed').
    expect(outcomes).toHaveLength(20);
    for (const outcome of outcomes) expect(outcome.writeOutcome).toBe('written');
  }, 30_000);
});
