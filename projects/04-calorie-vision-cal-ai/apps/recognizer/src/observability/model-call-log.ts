// Журнал попыток вызова модели (FR-scan-pipeline-12). `START` пишется НЕМЕДЛЕННО перед
// вызовом (переживает крах процесса между вызовом и ответом); РОВНО ОДИН `OUTCOME` на
// `attempt_id` — поздний ответ ОБНОВЛЯЕТ исход этого же `attempt_id` на `'late'`, а не
// создаёт второе событие (агрегатор берёт ПОСЛЕДНЮЮ по времени запись на ключ, `late`
// пишется последним по построению шага 9 — см. `scripts/telemetry/model-calls.cjs`).
//
// RV-scan-pipeline-09: обычный `logger.info` пишет через `process.stdout.write`, у
// которого Node НЕ гарантирует синхронную запись на всех платформах/транспортах (пайпы на
// Windows — асинхронны; на Linux — синхронны, но полагаться на платформенную деталь
// нечестно, когда есть явный синхронный примитив). `model_call` событие — единственное в
// системе, чьё свойство «пережить крах между записью и следующей строкой» ПРОВЕРЯЕТСЯ
// тестом (`tests/integration/observability/model-call-crash.test.ts`, настоящий дочерний
// процесс, настоящий `process.exit` без flush) — поэтому оно пишется через `fs.writeSync`
// напрямую на файловый дескриптор 1, в обход буферизации `Writable`-потока `logger`.

import { writeSync } from 'node:fs';
import type { Logger } from '@n4/shared';

export type ModelCallOutcomeValue = 'ok' | 'failed' | 'timeout' | 'late' | 'unknown';

/** `attempt_id = recognition_id:fence:call_no` — ОДИН на КАЖДЫЙ внешний вызов (PC3-01). */
export function attemptId(recognitionId: string, fence: number, callNo: 1 | 2): string {
  return `${recognitionId}:${fence}:${callNo}`;
}

/** Позволяет тесту подменить файловый дескриптор (например, на pipe в дочернем процессе). */
export interface ModelCallLogFd {
  readonly fd?: number;
}

function writeLine(payload: Record<string, unknown>, target: ModelCallLogFd = {}): void {
  const line = `${JSON.stringify({ time: new Date().toISOString(), level: 'info', service: 'recognizer', event: 'model_call', ...payload })}\n`;
  writeSync(target.fd ?? 1, line);
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
    /** `ModelProvider['kind']` — ТРЕТЬЯ реализация `openrouter` добавлена DEC-A-045/046. */
    readonly mode: 'fake' | 'live' | 'openrouter';
    readonly day: string;
  },
  target?: ModelCallLogFd,
): void {
  // `logger` остаётся параметром — сохраняет форму вызова и позволяет тестам, не
  // проверяющим переживание краха, перехватывать событие через `sink` логгера ТОЖЕ
  // (двойная запись безвредна: агрегатор группирует по `attempt_id`, не по числу строк).
  void logger;
  writeLine(
    {
      phase: 'START',
      request_id: fields.requestId,
      attempt_id: fields.attemptId,
      scan_id: fields.scanId,
      fence: fields.fence,
      call_no: fields.callNo,
      model: fields.model,
      mode: fields.mode,
      day: fields.day,
    },
    target,
  );
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
  target?: ModelCallLogFd,
): void {
  void logger;
  writeLine(
    {
      phase: 'OUTCOME',
      outcome: fields.outcome,
      attempt_id: fields.attemptId,
      ms: fields.ms,
      input_tokens: fields.inputTokens,
      output_tokens: fields.outputTokens,
    },
    target,
  );
}
