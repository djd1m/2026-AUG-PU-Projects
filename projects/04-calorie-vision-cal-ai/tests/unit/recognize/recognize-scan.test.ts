// `RecognizeScanWithinScanPipeline` — юнит-тест БЕЗ базы: провайдер, порт сопоставления,
// нормализация, запись результата и списание квоты — все ИНЪЕЦИРОВАНЫ (см. комментарий
// в `recognize-scan.ts`). Конкурентность самого счётчика квоты проверяется ОТДЕЛЬНО,
// интеграционным прогоном на настоящем Postgres (`shared-resource-verification.md`).

import { describe, expect, it, vi } from 'vitest';
import { CANON } from '@n4/shared';
import { recognizeScan, type QuotaConsumeFn, type RecognizeJob, type RecognizeScanDeps } from '../../../apps/recognizer/src/recognize/recognize-scan.js';
import { createNullMatchIngredientPort } from '../../../apps/recognizer/src/match/null-port.js';
import type { MatchIngredientPort, MatchedItem } from '../../../apps/recognizer/src/match/port.js';
import type { ModelProvider, ModelRequest, ModelResponse } from '../../../apps/recognizer/src/provider/types.js';
import type { ResultRecord } from '../../../apps/recognizer/src/lease.js';

const GENEROUS_LIMITS = { scanLimitUser: 1000, scanLimitDay: 1000, escalationLimitDay: 1000 };

function job(overrides: Partial<RecognizeJob> = {}): RecognizeJob {
  return { id: 'scan-1', fence: 1, photoId: 'photo-1', deviceSessionId: 'session-1', createdAt: new Date('2026-09-12T10:00:00.000Z'), ...overrides };
}

function fixedResponse(overrides: Partial<ModelResponse> = {}): ModelResponse {
  return { items: [{ labelRu: 'борщ', massG: 200, candidates: [] }], confidence: 0.9, modelEstimateKcal: 300, model: 'haiku-4.5', ...overrides };
}

function stubProvider(handler: (request: ModelRequest) => Promise<ModelResponse> | ModelResponse): ModelProvider {
  return { kind: 'fake', recognize: async (request) => handler(request) };
}

function noopNormalize() {
  return async () => ({ ok: true as const, normalizedKey: 'normalized-key' });
}

function grantingQuota(): QuotaConsumeFn {
  return async () => ({ outcome: 'granted' });
}

function refusingQuota(scope: 'user' | 'global' | 'escalation' = 'escalation'): QuotaConsumeFn {
  return async () => ({ outcome: 'refused', scope });
}

function baseDeps(overrides: Partial<RecognizeScanDeps> = {}): RecognizeScanDeps {
  const recorded: Array<{ target: { id: string; fence: number }; record: ResultRecord }> = [];
  const logger = { debug() {}, info() {}, warn() {}, error() {}, child() { return this as never; } };
  return {
    pool: {} as never,
    quotaLimits: GENEROUS_LIMITS,
    provider: stubProvider(() => fixedResponse()),
    matchPort: createNullMatchIngredientPort(),
    normalize: noopNormalize(),
    recordResult: async (target, record) => {
      recorded.push({ target, record });
      return 'written';
    },
    logger,
    now: () => job().createdAt,
    ipPrefix: '203.0.113.0/24',
    ...overrides,
    // @ts-expect-error — служебное поле для чтения из тестов, не часть контракта деп.
    __recorded: recorded,
  };
}

function recordedOf(deps: RecognizeScanDeps): Array<{ target: { id: string; fence: number }; record: ResultRecord }> {
  return (deps as unknown as { __recorded: Array<{ target: { id: string; fence: number }; record: ResultRecord }> }).__recorded;
}

describe('шаг 1а — бюджет задачи на захвате (AC-scan-pipeline-38)', () => {
  it('задание старше 30 с на момент захвата — немедленный failed(timeout), без нормализации и без вызова модели', async () => {
    const normalizeSpy = vi.fn(async () => ({ ok: true as const, normalizedKey: 'x' }));
    const recognizeSpy = vi.fn(async () => fixedResponse());
    const createdAt = new Date('2026-09-12T23:59:00.000Z');
    const deps = baseDeps({
      normalize: normalizeSpy,
      provider: { kind: 'fake', recognize: recognizeSpy },
      now: () => new Date('2026-09-12T23:59:35.000Z'), // возраст 35с > бюджет 30с
    });

    const outcome = await recognizeScan(job({ createdAt }), deps);

    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('timeout');
    expect(normalizeSpy).not.toHaveBeenCalled();
    expect(recognizeSpy).not.toHaveBeenCalled();
    expect(recordedOf(deps)[0]?.record.failureReason).toBe('timeout');
  });
});

describe('шаг 2 — нормализация (AC-scan-pipeline-10)', () => {
  it('нормализация упавшая на normalize — failed(normalize), модель не вызывается', async () => {
    const recognizeSpy = vi.fn(async () => fixedResponse());
    const deps = baseDeps({
      normalize: async () => ({ ok: false as const, reason: 'normalize' as const }),
      provider: { kind: 'fake', recognize: recognizeSpy },
    });
    const outcome = await recognizeScan(job(), deps);
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('normalize');
    expect(recognizeSpy).not.toHaveBeenCalled();
  });
});

describe('шаг 3 — квота primary: fence=1 в тот же день уже оплачен POSTом (не списывается повторно)', () => {
  it('fence=1, тот же день — CheckAndConsumeQuota НЕ вызывается', async () => {
    const consumeSpy = vi.fn(grantingQuota());
    const deps = baseDeps({ consumeQuota: consumeSpy });
    await recognizeScan(job({ fence: 1 }), deps);
    expect(consumeSpy).not.toHaveBeenCalled();
  });

  it('fence=2 (повторный захват) — списывается ВСЕГДА (AC-scan-pipeline-21)', async () => {
    const consumeSpy = vi.fn(grantingQuota());
    const deps = baseDeps({ consumeQuota: consumeSpy });
    await recognizeScan(job({ fence: 2 }), deps);
    expect(consumeSpy).toHaveBeenCalledTimes(1);
    expect(consumeSpy.mock.calls[0]?.[0]).toMatchObject({ reason: 'primary' });
  });

  it('fence=2, квота отказала — refused(quota_exhausted_${scope}), модель не вызывается (AC-scan-pipeline-21)', async () => {
    const recognizeSpy = vi.fn(async () => fixedResponse());
    const deps = baseDeps({ consumeQuota: refusingQuota('user'), provider: { kind: 'fake', recognize: recognizeSpy } });
    const outcome = await recognizeScan(job({ fence: 2 }), deps);
    expect(outcome.status).toBe('refused');
    expect(outcome.failureReason).toBe('quota_exhausted_user');
    expect(recognizeSpy).not.toHaveBeenCalled();
  });

  it('пересечение полуночи: fence=1, но day(now) ≠ day(created_at) — списывается ВСЕГДА (AC-scan-pipeline-26/32, DEC-A-017)', async () => {
    const consumeSpy = vi.fn(grantingQuota());
    const createdAt = new Date('2026-09-12T20:59:50.000Z'); // 23:59:50 Europe/Moscow (UTC+3)
    const nowAcrossMidnight = new Date('2026-09-12T21:00:05.000Z'); // 00:00:05 Europe/Moscow следующего дня
    const deps = baseDeps({ consumeQuota: consumeSpy, now: () => nowAcrossMidnight });
    await recognizeScan(job({ fence: 1, createdAt }), deps);
    expect(consumeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('шаг 6/16 — провайдер и еда не найдена', () => {
  it('провайдер недоступен — failed(provider_unavailable), попытка не откатывается (AC-scan-pipeline-16)', async () => {
    const deps = baseDeps({ provider: stubProvider(() => { throw new Error('boom'); }) });
    const outcome = await recognizeScan(job(), deps);
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('provider_unavailable');
  });

  it('модель вернула пустой items — refused(no_food_detected)', async () => {
    const deps = baseDeps({ provider: stubProvider(() => fixedResponse({ items: [] })) });
    const outcome = await recognizeScan(job(), deps);
    expect(outcome.status).toBe('refused');
    expect(outcome.failureReason).toBe('no_food_detected');
  });

  it('диапазоны нарушены (confidence=1.5) — failed(schema_violation), без подрезания', async () => {
    const deps = baseDeps({ provider: stubProvider(() => fixedResponse({ confidence: 1.5 })) });
    const outcome = await recognizeScan(job(), deps);
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('schema_violation');
  });
});

describe('шаг 7 — граница эскалации 0,59/0,60 (AC-scan-pipeline-12)', () => {
  it('confidence = 0.59 — эскалация ВЫПОЛНЯЕТСЯ (второй вызов состоялся)', async () => {
    const calls: string[] = [];
    const provider = stubProvider((request) => {
      calls.push(request.model);
      return request.model === CANON.modelEscalation ? fixedResponse({ confidence: 0.95, model: 'sonnet-5' }) : fixedResponse({ confidence: 0.59 });
    });
    const deps = baseDeps({ provider, consumeQuota: grantingQuota() });
    await recognizeScan(job(), deps);
    expect(calls).toEqual(['haiku-4.5', 'sonnet-5']);
  });

  it('confidence = 0.60 — эскалация НЕ выполняется (ровно один вызов)', async () => {
    const calls: string[] = [];
    const provider = stubProvider((request) => {
      calls.push(request.model);
      return fixedResponse({ confidence: 0.6 });
    });
    const deps = baseDeps({ provider, consumeQuota: grantingQuota() });
    await recognizeScan(job(), deps);
    expect(calls).toEqual(['haiku-4.5']);
  });
});

describe('шаг 7 — AC-scan-pipeline-29: эскалация несёт N4_MODEL_ESCALATION, а не повтор PRIMARY', () => {
  it('второй вызов ModelProvider.recognize получает model=sonnet-5', async () => {
    const models: string[] = [];
    const provider = stubProvider((request) => {
      models.push(request.model);
      return { items: [{ labelRu: 'x', massG: 100, candidates: [] }], confidence: 0.3, modelEstimateKcal: 50, model: request.model };
    });
    const deps = baseDeps({ provider, consumeQuota: grantingQuota() });
    await recognizeScan(job(), deps);
    expect(models[1]).toBe('sonnet-5');
    expect(models[1]).not.toBe('haiku-4.5');
  });
});

describe('шаг 7 — AC-scan-pipeline-37: эскалация не предпринимается при недостатке бюджета', () => {
  it('remaining < 8000 мс — CheckAndConsumeQuota(escalation) НЕ вызывается, событие не создаётся', async () => {
    const consumeSpy = vi.fn(grantingQuota());
    const recognizeSpy = vi.fn(async (request: ModelRequest) => fixedResponse({ confidence: 0.3, model: request.model }));
    const createdAt = new Date('2026-09-12T10:00:00.000Z');
    // remaining = 30000 - 23000 = 7000 < порога 8000 (AC-scan-pipeline-37).
    const elapsed = 23_000;
    const deps = baseDeps({
      provider: { kind: 'fake', recognize: recognizeSpy },
      consumeQuota: consumeSpy,
      now: () => new Date(createdAt.getTime() + elapsed),
    });
    const outcome = await recognizeScan(job({ createdAt }), deps);

    expect(consumeSpy).not.toHaveBeenCalled();
    expect(recognizeSpy).toHaveBeenCalledTimes(1); // только первичный вызов
    // low_confidence=true напрямую: результат done (NullMatchIngredientPort всё равно даст
    // failed(no_food_matched) — но эскалация точно не произошла).
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('no_food_matched');
  });

  it('remaining >= 8000 мс — эскалация идёт штатным путём', async () => {
    const consumeSpy = vi.fn(grantingQuota());
    const createdAt = new Date('2026-09-12T10:00:00.000Z');
    const deps = baseDeps({
      provider: stubProvider((request) => fixedResponse({ confidence: 0.3, model: request.model })),
      consumeQuota: consumeSpy,
      now: () => new Date(createdAt.getTime() + 20_000), // remaining = 10000мс
    });
    await recognizeScan(job({ createdAt }), deps);
    expect(consumeSpy).toHaveBeenCalledTimes(1);
    expect(consumeSpy.mock.calls[0]?.[0]).toMatchObject({ reason: 'escalation' });
  });
});

describe('шаг 8 — AC-scan-pipeline-15: NullMatchIngredientPort — done НЕДОСТИЖИМ, ADR-001 держится', () => {
  it('еда распознана с ЛЮБЫМ confidence — итог всегда failed(no_food_matched), никогда done', async () => {
    for (const confidence of [0.1, 0.5, 0.6, 0.99]) {
      const deps = baseDeps({ provider: stubProvider(() => fixedResponse({ confidence })), consumeQuota: grantingQuota() });
      const outcome = await recognizeScan(job(), deps);
      expect(outcome.status).not.toBe('done');
      expect(outcome.status).toBe('failed');
      expect(outcome.failureReason).toBe('no_food_matched');
    }
  });
});

describe('шаг 8 — AC-scan-pipeline-14: FixedMatchIngredientPort доказывает готовность кода к реальному порту', () => {
  function fixedMatchPort(): MatchIngredientPort {
    return {
      match: async (items) =>
        items.map((item): MatchedItem => ({ foodItemId: 'food-item-fixed', portionG: item.massG, sourceSnapshot: { id: 'food-item-fixed' } })),
    };
  }

  it('601-я эскалация (квота отказала) — done с low_confidence и quota_exhausted_escalation, НЕ failed/refused', async () => {
    const deps = baseDeps({
      matchPort: fixedMatchPort(),
      provider: stubProvider(() => fixedResponse({ confidence: 0.3 })),
      consumeQuota: refusingQuota('escalation'),
    });
    const outcome = await recognizeScan(job(), deps);
    expect(outcome.status).toBe('done');
    expect(outcome.failureReason).toBe('quota_exhausted_escalation');
    const written = recordedOf(deps)[0]?.record;
    expect(written?.confidence).toBe(0.3);
  });

  it('высокая уверенность + сопоставление — done без failure_reason', async () => {
    const deps = baseDeps({ matchPort: fixedMatchPort(), provider: stubProvider(() => fixedResponse({ confidence: 0.95 })), consumeQuota: grantingQuota() });
    const outcome = await recognizeScan(job(), deps);
    expect(outcome.status).toBe('done');
    expect(outcome.failureReason).toBeNull();
  });
});

describe('шаг 9 — поздний ответ отбрасывается как timeout (сознательная цена, не дефект)', () => {
  it('now() на момент записи ушёл за пределы бюджета — итог failed(timeout), а не содержательный статус', async () => {
    const createdAt = new Date('2026-09-12T10:00:00.000Z');
    let callCount = 0;
    const deps = baseDeps({
      provider: stubProvider(() => {
        callCount += 1;
        return fixedResponse({ confidence: 0.95 });
      }),
      now: () => new Date(createdAt.getTime() + (callCount === 0 ? 0 : 31_000)), // после вызова — уже поздно
    });
    const outcome = await recognizeScan(job({ createdAt }), deps);
    expect(outcome.status).toBe('failed');
    expect(outcome.failureReason).toBe('timeout');
  });
});
