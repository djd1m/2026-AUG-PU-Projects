// `RecognizeScanWithinScanPipeline` (`02_pseudocode.md`, Попытка 6/DEC-A-020 — порядок
// ФИНАЛЬНЫЙ). Аренда уже взята (`foundation` `acquireLease`), транзакция закрыта: НИЧЕГО
// здесь не удерживает соединение с базой во время внешнего вызова (NFR-scan-pipeline-1/3),
// кроме коротких вызовов `CheckAndConsumeQuota` и `recordResult`.
//
// Зависимости внедряются целиком (провайдер, порт сопоставления, нормализация, запись
// результата, часы) — это ЕДИНСТВЕННЫЙ способ проверить шаги 1а/3/7/9 (бюджет, границы
// суток, эскалация) юнит-тестом БЕЗ настоящей базы и без настоящего таймера.

import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import { checkAndConsumeQuota as realCheckAndConsumeQuota, moscowDay } from '@n4/db';
import { CANON, type Logger, type QuotaLimits, type QuotaScope } from '@n4/shared';
import type { ModelProvider, ModelResponse } from '../provider/types.js';
import type { MatchIngredientPort } from '../match/port.js';
import { validateModelResponseRanges } from './validate-ranges.js';
import { attemptId, logModelCallOutcome, logModelCallStart } from '../observability/model-call-log.js';
import type { WriteOutcome, ResultRecord } from '../lease.js';

export interface RecognizeJob {
  readonly id: string;
  readonly fence: number;
  readonly photoId: string | null;
  readonly deviceSessionId: string;
  readonly createdAt: Date;
}

export type NormalizeOutcome = { readonly ok: true; readonly normalizedKey: string } | { readonly ok: false; readonly reason: 'normalize' | 'schema_violation' };

export type QuotaConsumeDecision = { readonly outcome: 'granted' } | { readonly outcome: 'refused'; readonly scope: QuotaScope };
export type QuotaConsumeFn = (input: {
  readonly sessionId: string;
  readonly ipPrefix: string;
  readonly reason: 'primary' | 'escalation';
  readonly limits: QuotaLimits;
  readonly at: Date;
}) => Promise<QuotaConsumeDecision>;

export interface RecognizeScanDeps {
  readonly pool: DbPool;
  readonly quotaLimits: QuotaLimits;
  readonly provider: ModelProvider;
  readonly matchPort: MatchIngredientPort;
  readonly normalize: (job: RecognizeJob, signal: AbortSignal) => Promise<NormalizeOutcome>;
  readonly recordResult: (job: { id: string; fence: number }, record: ResultRecord) => Promise<WriteOutcome>;
  readonly logger: Logger;
  readonly now?: () => Date;
  readonly requestId?: () => string;
  readonly ipPrefix?: string;
  /**
   * Списание квоты — ИНЪЕЦИРУЕМАЯ зависимость (по умолчанию: настоящая
   * `checkAndConsumeQuota(deps.pool, …)` из `@n4/db`). Единственный способ юнит-тестом
   * без базы проверить шаги 3/7 (границы суток, порог эскалации, отказ по квоте) —
   * `shared-resource-verification.md`: конкурентность самого счётчика по-прежнему
   * проверяется ТОЛЬКО интеграционным/конкурентным прогоном на настоящем Postgres.
   */
  readonly consumeQuota?: QuotaConsumeFn;
}

export interface RecognizeScanOutcome {
  readonly writeOutcome: WriteOutcome;
  readonly status: 'done' | 'failed' | 'refused';
  readonly failureReason: string | null;
}

function elapsedMs(since: Date, now: Date): number {
  return now.getTime() - since.getTime();
}

async function writeTerminal(
  deps: RecognizeScanDeps,
  job: RecognizeJob,
  record: ResultRecord,
): Promise<RecognizeScanOutcome> {
  const writeOutcome = await deps.recordResult({ id: job.id, fence: job.fence }, record);
  if (writeOutcome !== 'written') {
    deps.logger.warn(writeOutcome, { scan_id: job.id, fence: job.fence });
  }
  return { writeOutcome, status: record.status, failureReason: record.failureReason };
}

function failedRecord(reason: string): ResultRecord {
  return { status: 'failed', confidence: null, items: [], modelEstimateKcal: null, modelUsed: null, failureReason: reason };
}

function refusedRecord(reason: string): ResultRecord {
  return { status: 'refused', confidence: null, items: [], modelEstimateKcal: null, modelUsed: null, failureReason: reason };
}

/** Вызывает модель ОДИН раз: логирует START/OUTCOME, ловит provider-исключения. */
async function invokeModel(
  deps: RecognizeScanDeps,
  job: RecognizeJob,
  params: { readonly model: 'haiku-4.5' | 'sonnet-5'; readonly callNo: 1 | 2; readonly normalizedKey: string; readonly callDeadlineMs: number },
): Promise<{ readonly kind: 'ok'; readonly response: ModelResponse } | { readonly kind: 'provider_unavailable' | 'provider_timeout' }> {
  const now = deps.now ?? (() => new Date());
  const requestId = deps.requestId?.() ?? randomUUID();
  const id = attemptId(job.id, job.fence, params.callNo);
  const day = moscowDay(now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.callDeadlineMs);

  logModelCallStart(deps.logger, {
    requestId,
    attemptId: id,
    scanId: job.id,
    fence: job.fence,
    callNo: params.callNo,
    model: params.model,
    mode: deps.provider.kind,
    day,
  });
  const startedAt = now();
  try {
    const response = await deps.provider.recognize({
      scanId: job.id,
      imageKey: params.normalizedKey,
      model: params.model,
      deadlineMs: params.callDeadlineMs,
      signal: controller.signal,
    });
    logModelCallOutcome(deps.logger, { attemptId: id, outcome: 'ok', ms: elapsedMs(startedAt, now()) });
    return { kind: 'ok', response };
  } catch (error) {
    const aborted = controller.signal.aborted || (error as { name?: string }).name === 'AbortError';
    logModelCallOutcome(deps.logger, { attemptId: id, outcome: aborted ? 'timeout' : 'failed', ms: elapsedMs(startedAt, now()) });
    return { kind: aborted ? 'provider_timeout' : 'provider_unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function recognizeScan(job: RecognizeJob, deps: RecognizeScanDeps): Promise<RecognizeScanOutcome> {
  const now = deps.now ?? (() => new Date());
  const ipPrefix = deps.ipPrefix ?? 'unknown/0';

  // Шаг 1а: бюджет задачи — ПЕРВЫМ действием после захвата.
  const remainingAtStart = CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now());
  if (remainingAtStart <= 0) {
    return writeTerminal(deps, job, failedRecord('timeout'));
  }

  // Шаг 2: нормализация ПОД СВОИМ фиксированным дедлайном 3000 мс, отдельным от бюджета вызова.
  const normalizeController = new AbortController();
  const normalizeTimer = setTimeout(() => normalizeController.abort(), CANON.normalizeDeadlineMs);
  let normalized: NormalizeOutcome;
  try {
    normalized = await deps.normalize(job, normalizeController.signal);
  } finally {
    clearTimeout(normalizeTimer);
  }
  if (!normalized.ok) {
    return writeTerminal(deps, job, failedRecord(normalized.reason));
  }

  // Шаг 3: списание квоты `primary` НЕПОСРЕДСТВЕННО ПЕРЕД вызовом модели, ПОСЛЕ нормализации.
  const consumeQuota = deps.consumeQuota ?? ((input) => realCheckAndConsumeQuota(deps.pool, input));
  const day = moscowDay(now());
  const createdDay = moscowDay(job.createdAt);
  const mustChargeAgain = job.fence >= 2 || day !== createdDay;
  const alreadyPaidByPost = job.fence === 1 && day === createdDay;
  if (mustChargeAgain && !alreadyPaidByPost) {
    const decision = await consumeQuota({
      sessionId: job.deviceSessionId,
      ipPrefix,
      reason: 'primary',
      limits: deps.quotaLimits,
      at: now(),
    });
    if (decision.outcome === 'refused') {
      return writeTerminal(deps, job, refusedRecord(`quota_exhausted_${decision.scope}`));
    }
  }

  // Шаг 4: первичный вызов.
  const remainingBeforeCall = CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now());
  const primaryDeadline = Math.min(CANON.modelCallDeadlineMs, remainingBeforeCall);
  const primaryCall = await invokeModel(deps, job, {
    model: CANON.modelPrimary,
    callNo: 1,
    normalizedKey: normalized.normalizedKey,
    callDeadlineMs: primaryDeadline,
  });
  if (primaryCall.kind !== 'ok') {
    return writeTerminal(deps, job, failedRecord(primaryCall.kind));
  }

  // Шаг 5: диапазоны — наш код, без подрезания.
  const primaryRange = validateModelResponseRanges(primaryCall.response);
  if (!primaryRange.ok) {
    return writeTerminal(deps, job, failedRecord('schema_violation'));
  }

  // Шаг 6: еда не найдена.
  if (primaryCall.response.items.length === 0) {
    return writeTerminal(deps, job, refusedRecord('no_food_detected'));
  }

  let finalResponse = primaryCall.response;
  let escalated = false;
  let escalationRefusedScope: 'escalation' | null = null;

  // Шаг 7: эскалация, если confidence < 0.6 — делит ОДИН бюджет 30 с с первичным (VS-05).
  if (primaryCall.response.confidence < CANON.escalationConfidenceThreshold) {
    const remainingForEscalation = CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now());
    if (remainingForEscalation >= CANON.escalationMinRemainingMs) {
      const escalationDecision = await consumeQuota({
        sessionId: job.deviceSessionId,
        ipPrefix,
        reason: 'escalation',
        limits: deps.quotaLimits,
        at: now(),
      });
      if (escalationDecision.outcome === 'granted') {
        const escalationDeadline = Math.min(CANON.modelCallDeadlineMs, CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now()));
        const escalationCall = await invokeModel(deps, job, {
          model: CANON.modelEscalation,
          callNo: 2,
          normalizedKey: normalized.normalizedKey,
          callDeadlineMs: escalationDeadline,
        });
        if (escalationCall.kind === 'ok') {
          const escalationRange = validateModelResponseRanges(escalationCall.response);
          if (!escalationRange.ok) return writeTerminal(deps, job, failedRecord('schema_violation'));
          finalResponse = escalationCall.response;
          escalated = true;
        } else {
          return writeTerminal(deps, job, failedRecord(escalationCall.kind));
        }
      } else {
        escalationRefusedScope = 'escalation';
      }
    }
    // `remaining < 8_000мс`: эскалация НЕ ПРЕДПРИНИМАЕТСЯ — `low_confidence` напрямую,
    // без вызова CheckAndConsumeQuota и без события model_call (ре-валидатор VS-05).
  }

  // Шаг 8: сопоставление — ОДИН пакетный вызов на весь список (PC-08).
  const matched = await deps.matchPort.match(finalResponse.items.map((item) => ({ labelRu: item.labelRu, massG: item.massG })));
  const anyMatched = matched.some((item) => item.foodItemId !== null);

  const lowConfidence = finalResponse.confidence < CANON.escalationConfidenceThreshold;
  const failureReasonCandidate = escalationRefusedScope !== null ? 'quota_exhausted_escalation' : null;

  const record: ResultRecord = anyMatched
    ? {
        status: 'done',
        confidence: finalResponse.confidence,
        items: finalResponse.items.map((item, index) => ({
          label_ru: item.labelRu,
          mass_g: item.massG,
          unmatched: matched[index]?.foodItemId === null,
          food_item_id: matched[index]?.foodItemId ?? null,
        })),
        modelEstimateKcal: finalResponse.modelEstimateKcal,
        modelUsed: escalated ? CANON.modelEscalation : CANON.modelPrimary,
        failureReason: lowConfidence ? failureReasonCandidate : null,
      }
    : failedRecord('no_food_matched'); // DEC-A-014: NullMatchIngredientPort — ВСЕГДА в этой фиче.

  // Шаг 9: последняя проверка бюджета ПЕРЕД записью — ответ, пришедший ПОЗЖЕ, оплачен, но
  // отбрасывается (`late`), запись НЕ применяется содержательно.
  if (elapsedMs(job.createdAt, now()) > CANON.scanTaskBudgetMs) {
    return writeTerminal(deps, job, failedRecord('timeout'));
  }

  return writeTerminal(deps, job, record);
}
