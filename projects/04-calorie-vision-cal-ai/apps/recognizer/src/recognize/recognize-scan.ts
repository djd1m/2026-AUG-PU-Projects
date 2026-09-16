// `RecognizeScanWithinScanPipeline` (`02_pseudocode.md`, Попытка 6/DEC-A-020 — порядок
// ФИНАЛЬНЫЙ, скорректирован ревью Попытки 3 — `review-report.md` RV-02/05/08/09/12/13).
// Аренда уже взята (`foundation` `acquireLease`), транзакция закрыта: НИЧЕГО здесь не
// удерживает соединение с базой во время внешнего вызова (NFR-scan-pipeline-1/3), кроме
// коротких вызовов `CheckAndConsumeQuota` и `recordResult`.
//
// Зависимости внедряются целиком (провайдер, порт сопоставления, нормализация, запись
// результата, часы, IP-префикс) — это ЕДИНСТВЕННЫЙ способ проверить шаги 1а/3/7/9 (бюджет,
// границы суток, эскалация) юнит-тестом БЕЗ настоящей базы и без настоящего таймера.

import { randomUUID } from 'node:crypto';
import type { DbPool } from '@n4/db';
import { checkAndConsumeQuota as realCheckAndConsumeQuota, moscowDay } from '@n4/db';
import { CANON, type Logger, type QuotaLimits, type QuotaScope, type Snapshot } from '@n4/shared';
import { MODEL_RESPONSE_SCHEMA, ModelSchemaViolationError, type ModelProvider, type ModelResponse } from '../provider/types.js';
import type { MatchedItem, MatchIngredientPort } from '../match/port.js';
import { validateModelResponseRanges } from './validate-ranges.js';
import { attemptId, logModelCallOutcome, logModelCallStart } from '../observability/model-call-log.js';
import type { WriteOutcome, ResultRecord } from '../lease.js';
import { computeItemFromSnapshot, sumMatchedKcal, type ComputedItemNumbers } from '../compute/from-snapshot.js';
import { evaluateDiscrepancy } from '../compute/discrepancy.js';
import { terminalStatusForMatch } from '../compute/terminal-status.js';

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
  /**
   * RV-scan-pipeline-02: `ip_prefix` РЕАЛЬНОЙ сессии — по умолчанию читается из
   * `device_session.ip_prefix` (та же строка, что записал `POST /scans`, `session/
   * ip-prefix.ts`). Без инъекции все повторные попытки/эскалации ВСЕХ пользователей
   * списывались бы в один ключ `unknown/0`, и предел одного посетителя блокировал бы
   * остальных — воспроизведено ревью без сети.
   */
  readonly lookupIpPrefix?: (deviceSessionId: string) => Promise<string>;
  /** Файловый дескриптор журнала `model_call` — тесты подменяют, чтобы не писать в stdout. */
  readonly modelCallLogFd?: number;
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

async function defaultLookupIpPrefix(pool: DbPool, deviceSessionId: string): Promise<string> {
  const result = await pool.query<{ ip_prefix: string }>('SELECT ip_prefix FROM device_session WHERE id = $1', [deviceSessionId]);
  // Отсутствующая сессия — фактически невозможно (FK NOT NULL), но fail-closed: метка,
  // которая НИКОГДА случайно не совпадёт с реальным префиксом другого пользователя.
  return result.rows[0]?.ip_prefix ?? 'session-not-found/0';
}

/**
 * Аудит устаревшего/сметённого результата — RV-scan-pipeline-12: несёт И заявленный
 * (устаревший) fence, И ТЕКУЩИЙ (реальный) fence строки — перечитывается здесь же, потому
 * что `recordResult` намеренно возвращает только строку исхода (не ломает уже испытанный
 * контракт `WriteOutcome`, на который опирается `lease.test.ts`).
 */
async function logNonWrittenOutcome(deps: RecognizeScanDeps, job: RecognizeJob, writeOutcome: WriteOutcome): Promise<void> {
  const reread = await deps.pool.query<{ lease_fence: number }>('SELECT lease_fence FROM recognition WHERE id = $1', [job.id]).catch(() => undefined);
  deps.logger.warn(writeOutcome, { scan_id: job.id, fence: job.fence, current_fence: reread?.rows[0]?.lease_fence ?? null });
}

async function writeTerminal(deps: RecognizeScanDeps, job: RecognizeJob, record: ResultRecord): Promise<RecognizeScanOutcome> {
  const writeOutcome = await deps.recordResult({ id: job.id, fence: job.fence }, record);
  if (writeOutcome !== 'written') {
    await logNonWrittenOutcome(deps, job, writeOutcome);
  }
  return { writeOutcome, status: record.status, failureReason: record.failureReason };
}

function failedRecord(reason: string): ResultRecord {
  return { status: 'failed', confidence: null, items: [], modelEstimateKcal: null, modelUsed: null, failureReason: reason, escalated: false, attemptNo: 1, dbKcalTotal: null, discrepancyRatio: null, conflictFlag: false };
}

function refusedRecord(reason: string): ResultRecord {
  return { status: 'refused', confidence: null, items: [], modelEstimateKcal: null, modelUsed: null, failureReason: reason, escalated: false, attemptNo: 1, dbKcalTotal: null, discrepancyRatio: null, conflictFlag: false };
}

interface InvokeResult {
  readonly kind: 'ok' | 'provider_unavailable' | 'provider_timeout' | 'schema_violation';
  readonly response?: ModelResponse;
  readonly attemptId: string;
}

/** Вызывает модель ОДИН раз: логирует START/OUTCOME, ловит provider-исключения. */
async function invokeModel(
  deps: RecognizeScanDeps,
  job: RecognizeJob,
  params: { readonly model: 'haiku-4.5' | 'sonnet-5'; readonly callNo: 1 | 2; readonly normalizedKey: string; readonly callDeadlineMs: number },
): Promise<InvokeResult> {
  const now = deps.now ?? (() => new Date());
  const requestId = deps.requestId?.() ?? randomUUID();
  const id = attemptId(job.id, job.fence, params.callNo);
  const day = moscowDay(now());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.callDeadlineMs);
  const logTarget = { fd: deps.modelCallLogFd };

  logModelCallStart(
    deps.logger,
    { requestId, attemptId: id, scanId: job.id, fence: job.fence, callNo: params.callNo, model: params.model, mode: deps.provider.kind, day },
    logTarget,
  );
  const startedAt = now();
  try {
    const response = await deps.provider.recognize({
      scanId: job.id,
      imageKey: params.normalizedKey,
      // Схема передаётся ВЫЗЫВАЮЩИМ из единственного объявления (`foundation`, ADR-001):
      // адаптер её не выбирает, поэтому страж читает одно место, а не все реализации порта.
      schema: MODEL_RESPONSE_SCHEMA,
      model: params.model,
      deadlineMs: params.callDeadlineMs,
      signal: controller.signal,
    });
    logModelCallOutcome(deps.logger, { attemptId: id, outcome: 'ok', ms: elapsedMs(startedAt, now()) }, logTarget);
    return { kind: 'ok', response, attemptId: id };
  } catch (error) {
    // RV-scan-pipeline-08: нарушение СХЕМЫ ответа (`ModelSchemaViolationError`, любая
    // реализация `ModelProvider`) — ОТДЕЛЬНЫЙ исход от таймаута/сетевой недоступности, а
    // не то же самое «недоступен». Проверяется ПЕРВЫМ, до определения `aborted`.
    if (error instanceof ModelSchemaViolationError) {
      deps.logger.warn('schema_violation_field', { scan_id: job.id, attempt_id: id, field: error.field });
      logModelCallOutcome(deps.logger, { attemptId: id, outcome: 'failed', ms: elapsedMs(startedAt, now()) }, logTarget);
      return { kind: 'schema_violation', attemptId: id };
    }
    const aborted = controller.signal.aborted || (error as { name?: string }).name === 'AbortError';
    logModelCallOutcome(deps.logger, { attemptId: id, outcome: aborted ? 'timeout' : 'failed', ms: elapsedMs(startedAt, now()) }, logTarget);
    return { kind: aborted ? 'provider_timeout' : 'provider_unavailable', attemptId: id };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Формирует персистентную форму позиции — сохраняет `parts`/`source_snapshot` целиком
 * (RV-13) И вычисляет четыре числа из снимка (`ComputeFromSnapshot`,
 * FR-source-and-correct-6). `original_mass_g` хранится рядом с `mass_g` и НЕ затирается
 * будущими правками (`set_portion`) — исходная оценка модели остаётся видна.
 *
 * `export` добавлен фичей `share-card-and-growth-events` (её RV-01) — ТОЛЬКО видимость для
 * контрактного теста: сборщик карточки читал числовые поля позиции напрямую, а эта функция —
 * их ЕДИНСТВЕННЫЙ производитель. Тест обязан звать ИМЕННО ЕЁ, иначе он доказывает совпадение
 * с придуманной формой, а не с реальной.
 */
export function persistedItem(item: { labelRu: string; massG: number; candidates?: readonly string[] }, matched: MatchedItem | undefined) {
  const numbers: ComputedItemNumbers = computeItemFromSnapshot({
    foodItemId: matched?.foodItemId ?? null,
    portionG: item.massG,
    sourceSnapshot: (matched?.sourceSnapshot ?? null) as unknown as Snapshot | null,
    parts: matched?.parts?.map((part) => ({ share: Number(part.share), sourceSnapshot: part.sourceSnapshot as unknown as Snapshot | null })),
  });
  return {
    label_ru: item.labelRu,
    mass_g: item.massG,
    original_mass_g: item.massG,
    candidates: item.candidates ?? [],
    unmatched: numbers.unmatched,
    food_item_id: matched?.foodItemId ?? null,
    source_snapshot: matched?.sourceSnapshot ?? null,
    parts: matched?.parts ?? undefined,
    kcal: numbers.kcal,
    protein: numbers.protein,
    fat: numbers.fat,
    carb: numbers.carb,
  };
}

export async function recognizeScan(job: RecognizeJob, deps: RecognizeScanDeps): Promise<RecognizeScanOutcome> {
  const now = deps.now ?? (() => new Date());
  const ipPrefix = await (deps.lookupIpPrefix ?? ((id: string) => defaultLookupIpPrefix(deps.pool, id)))(job.deviceSessionId);

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
    const decision = await consumeQuota({ sessionId: job.deviceSessionId, ipPrefix, reason: 'primary', limits: deps.quotaLimits, at: now() });
    if (decision.outcome === 'refused') {
      return writeTerminal(deps, job, refusedRecord(`quota_exhausted_${decision.scope}`));
    }
  }

  // Шаг 4: первичный вызов. RV-scan-pipeline-05: остаток ОБЯЗАН быть строго положительным
  // непосредственно перед платным вызовом — квота уже списана (шаг 3), но вызов модели
  // всё ещё МОЖНО не делать: нулевой/отрицательный остаток здесь означает, что шаги
  // 1а→2→3 вместе исчерпали бюджет, и платный вызов был бы гарантированно `late`.
  const remainingBeforeCall = CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now());
  if (remainingBeforeCall <= 0) {
    return writeTerminal(deps, job, failedRecord('timeout'));
  }
  const primaryDeadline = Math.min(CANON.modelCallDeadlineMs, remainingBeforeCall);
  const primaryCall = await invokeModel(deps, job, { model: CANON.modelPrimary, callNo: 1, normalizedKey: normalized.normalizedKey, callDeadlineMs: primaryDeadline });
  let lastAttemptId = primaryCall.attemptId;
  if (primaryCall.kind !== 'ok' || primaryCall.response === undefined) {
    return finishLate(deps, job, now, lastAttemptId, failedRecord(primaryCall.kind));
  }

  // Шаг 5: диапазоны — наш код, без подрезания. RV-scan-pipeline-08: имя нарушенного поля
  // ОБЯЗАНО остаться диагностируемым — `failure_reason` в базе закрытым набором канона не
  // несёт поля, но структурированный журнал несёт.
  const primaryRange = validateModelResponseRanges(primaryCall.response);
  if (!primaryRange.ok) {
    deps.logger.warn('schema_violation_field', { scan_id: job.id, attempt_id: lastAttemptId, field: primaryRange.field });
    return finishLate(deps, job, now, lastAttemptId, failedRecord('schema_violation'));
  }

  // Шаг 6: еда не найдена.
  if (primaryCall.response.items.length === 0) {
    return finishLate(deps, job, now, lastAttemptId, refusedRecord('no_food_detected'));
  }

  let finalResponse = primaryCall.response;
  let escalated = false;
  let escalationRefusedScope: 'escalation' | null = null;

  // Шаг 7: эскалация, если confidence < 0.6 — делит ОДИН бюджет 30 с с первичным (VS-05).
  if (primaryCall.response.confidence < CANON.escalationConfidenceThreshold) {
    const remainingForEscalation = CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now());
    if (remainingForEscalation >= CANON.escalationMinRemainingMs) {
      const escalationDecision = await consumeQuota({ sessionId: job.deviceSessionId, ipPrefix, reason: 'escalation', limits: deps.quotaLimits, at: now() });
      if (escalationDecision.outcome === 'granted') {
        const escalationDeadline = Math.min(CANON.modelCallDeadlineMs, CANON.scanTaskBudgetMs - elapsedMs(job.createdAt, now()));
        if (escalationDeadline <= 0) {
          return finishLate(deps, job, now, lastAttemptId, failedRecord('timeout'));
        }
        const escalationCall = await invokeModel(deps, job, { model: CANON.modelEscalation, callNo: 2, normalizedKey: normalized.normalizedKey, callDeadlineMs: escalationDeadline });
        lastAttemptId = escalationCall.attemptId;
        if (escalationCall.kind === 'ok' && escalationCall.response !== undefined) {
          const escalationRange = validateModelResponseRanges(escalationCall.response);
          if (!escalationRange.ok) {
            deps.logger.warn('schema_violation_field', { scan_id: job.id, attempt_id: lastAttemptId, field: escalationRange.field });
            return finishLate(deps, job, now, lastAttemptId, failedRecord('schema_violation'));
          }
          finalResponse = escalationCall.response;
          escalated = true;
        } else {
          return finishLate(deps, job, now, lastAttemptId, failedRecord(escalationCall.kind));
        }
      } else {
        escalationRefusedScope = 'escalation';
      }
    }
    // `remaining < 8_000мс`: эскалация НЕ ПРЕДПРИНИМАЕТСЯ — `low_confidence` напрямую,
    // без вызова CheckAndConsumeQuota и без события model_call (ре-валидатор VS-05).
  }

  // Шаг 8: сопоставление — ОДИН пакетный вызов на весь список (PC-08).
  const matchInput = finalResponse.items.map((item) => ({ labelRu: item.labelRu, massG: item.massG, candidates: item.candidates }));
  const matched = await deps.matchPort.match(matchInput);
  const anyMatched = matched.some((item) => item.foodItemId !== null);
  const terminal = terminalStatusForMatch(anyMatched);

  const lowConfidence = finalResponse.confidence < CANON.escalationConfidenceThreshold;
  const failureReasonCandidate = escalationRefusedScope !== null ? 'quota_exhausted_escalation' : null;

  const record: ResultRecord = terminal.status === 'done'
    ? (() => {
        // FR-source-and-correct-6/8: числа позиций из снимка, итог, расхождение с оценкой
        // модели. `evaluateDiscrepancy` — ЕДИНСТВЕННОЕ место, читающее `modelEstimateKcal`
        // для арифметики (страж `single-model-estimate-read.test.ts`).
        const persisted = finalResponse.items.map((item, index) => persistedItem(item, matched[index]));
        const dbKcalTotal = sumMatchedKcal(persisted.map((item): ComputedItemNumbers => ({ unmatched: item.unmatched, kcal: item.kcal, protein: item.protein, fat: item.fat, carb: item.carb })));
        // Колонка `recognition.model_estimate_kcal` — INTEGER, а схема ответа модели объявляет
        // поле как `number`: провайдер законно возвращает `75.4`. Без округления UPDATE падал с
        // `invalid input syntax for type integer`, tick завершался ошибкой, задание висело в
        // `queued` до уборщика и уходило в `failed(timeout)` — посетитель видел «снять ещё раз»
        // на распознанной еде (живой стенд, 16.09.2026, скан e4d3e391). Округляется ОДИН раз и
        // ОДНО значение идёт и в расхождение, и в запись — иначе ratio считался бы от числа,
        // которого в базе нет.
        const modelEstimateKcal = Math.round(finalResponse.modelEstimateKcal);
        const discrepancy = evaluateDiscrepancy(modelEstimateKcal, dbKcalTotal);
        return {
          status: 'done',
          confidence: finalResponse.confidence,
          items: persisted,
          modelEstimateKcal,
          modelUsed: escalated ? CANON.modelEscalation : CANON.modelPrimary,
          failureReason: lowConfidence ? failureReasonCandidate : null,
          escalated,
          attemptNo: escalated ? 2 : 1,
          dbKcalTotal,
          discrepancyRatio: discrepancy.discrepancyRatio,
          conflictFlag: discrepancy.conflictFlag,
        };
      })()
    : { ...failedRecord(terminal.failureReason), escalated, attemptNo: escalated ? 2 : 1 }; // DEC-A-014/ADR-001 Confirmation (2): `done` при нуле ссылок НЕВОЗМОЖЕН.

  return finishLate(deps, job, now, lastAttemptId, record);
}

/**
 * Шаг 9: последняя проверка бюджета ПЕРЕД записью. RV-scan-pipeline-09: ответ, пришедший
 * ПОЗЖЕ бюджета, обязан ОБНОВИТЬ исход СВОЕГО `attempt_id` на `'late'` в журнале — попытка
 * оплачена и учтена, но её содержимое отбрасывается в пользу `failed(timeout)`.
 */
async function finishLate(
  deps: RecognizeScanDeps,
  job: RecognizeJob,
  now: () => Date,
  lastAttemptId: string,
  record: ResultRecord,
): Promise<RecognizeScanOutcome> {
  if (elapsedMs(job.createdAt, now()) > CANON.scanTaskBudgetMs) {
    logModelCallOutcome(deps.logger, { attemptId: lastAttemptId, outcome: 'late', ms: elapsedMs(job.createdAt, now()) }, { fd: deps.modelCallLogFd });
    return writeTerminal(deps, job, failedRecord('timeout'));
  }
  return writeTerminal(deps, job, record);
}
