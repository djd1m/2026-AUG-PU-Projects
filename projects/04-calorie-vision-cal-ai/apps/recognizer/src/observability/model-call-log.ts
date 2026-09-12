// Журнал попыток вызова модели (FR-scan-pipeline-12). `START` пишется НЕМЕДЛЕННО перед
// вызовом (переживает крах процесса между вызовом и ответом); РОВНО ОДИН `OUTCOME` на
// `attempt_id` — поздний ответ ОБНОВЛЯЕТ исход этого же `attempt_id` на `'late'`, а не
// создаёт второе событие (эмулируется повторной строкой `OUTCOME` с тем же `attempt_id`:
// агрегатор берёт ПОСЛЕДНЮЮ по времени запись на ключ, `late` пишется последним по
// построению шага 9 — см. `scripts/telemetry/model-calls.sh`).

import type { Logger } from '@n4/shared';

export type ModelCallOutcomeValue = 'ok' | 'failed' | 'timeout' | 'late' | 'unknown';

/** `attempt_id = recognition_id:fence:call_no` — ОДИН на КАЖДЫЙ внешний вызов (PC3-01). */
export function attemptId(recognitionId: string, fence: number, callNo: 1 | 2): string {
  return `${recognitionId}:${fence}:${callNo}`;
}

export function logModelCallStart(
  logger: Logger,
  fields: {
    readonly requestId: string;
    readonly attemptId: string;
    readonly scanId: string;
    readonly fence: number;
    readonly callNo: 1 | 2;
    readonly model: string;
    readonly mode: 'fake' | 'live';
    readonly day: string;
  },
): void {
  logger.info('model_call', {
    phase: 'START',
    request_id: fields.requestId,
    attempt_id: fields.attemptId,
    scan_id: fields.scanId,
    fence: fields.fence,
    call_no: fields.callNo,
    model: fields.model,
    mode: fields.mode,
    day: fields.day,
  });
}

export function logModelCallOutcome(
  logger: Logger,
  fields: {
    readonly attemptId: string;
    readonly outcome: ModelCallOutcomeValue;
    readonly ms: number;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  },
): void {
  logger.info('model_call', {
    phase: 'OUTCOME',
    outcome: fields.outcome,
    attempt_id: fields.attemptId,
    ms: fields.ms,
    input_tokens: fields.inputTokens,
    output_tokens: fields.outputTokens,
  });
}
