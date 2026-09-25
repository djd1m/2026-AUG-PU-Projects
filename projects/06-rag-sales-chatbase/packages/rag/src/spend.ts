// из N5: projects/05-podcast-clips-opus/apps/worker/src/llm/spend.ts — перенесено: запись с fsync ДО вызова
// (open 'a' 0o600 → writeFile → sync). Адаптировано: вызовы N6 (Pseudocode RecordModelSpend), общий
// журнал /work/spend/model-spend.jsonl у web и worker-index, и meteredCall — порядок «квота → attempt →
// вызов → outcome» на КАЖДУЮ попытку (model-call-cost п.4: счёт по попыткам, повтор списывает заново).
import { mkdirSync, openSync, writeSync, closeSync, readFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

export const SPEND_CALLS = ['answer', 'embed_question', 'embed_index', 'answer_preview', 'embed_preview',
  'probe_answer', 'probe_embed'] as const;
export type SpendCall = typeof SPEND_CALLS[number];
export type SpendResult = 'started' | 'success' | 'timeout' | 'rate_limited' | 'provider_error' | 'schema_violation' | 'dimension_mismatch';
export interface SpendEvent {
  call: SpendCall; model: string; request_id: string; attempt_no: number;
  bot_id?: string; account_id?: string; index_job_id?: string;
  unit: 'calls' | 'tokens'; quantity: number; phase: 'attempt' | 'outcome'; result: SpendResult;
  tokens_actual?: number;
}
export type SpendRecorder = (event: SpendEvent) => Promise<void>;

// Путь журнала — окружение без дефолта (N6_SPEND_LOG): без журнала вызов не выполняется.
export function validateSpendPath(path: string): string {
  if (!isAbsolute(path) || !path.endsWith('.jsonl') || /[\r\n]/.test(path)) {
    throw new Error('N6_SPEND_LOG непригодна: нужен абсолютный путь к файлу .jsonl — без журнала попыток платный вызов нельзя учесть');
  }
  return path;
}
export function prepareSpendDirectory(path: string): void {
  mkdirSync(dirname(validateSpendPath(path)), { recursive: true, mode: 0o700 });
}
// Только phase=attempt — оплачиваемая единица. Пишется и fsync-ается ДО отправки: оборванный запрос
// остаётся учтённым; outcome никогда не стирает неудачную попытку.
export function spendRecorder(path: string): SpendRecorder {
  validateSpendPath(path);
  return async (event) => {
    const file = await open(path, 'a', 0o600);
    try { await file.writeFile(JSON.stringify({ ...event, at: new Date().toISOString() }) + '\n'); await file.sync(); }
    finally { await file.close(); }
  };
}

export type ChargeDecision = { granted: true } | { granted: false; scope: string };
export class RetryableCallError extends Error {
  constructor(public readonly result: SpendResult, message: string) { super(message); }
}
export type MeteredResult<T> = { status: 'ok'; value: T; attempts: number } | { status: 'refused'; scope: string; attempts: number };
export interface MeteredCall<T> {
  // Списание квоты ЭТОЙ попытки (одна короткая транзакция). Не задано — только у проб старта,
  // их предел — PROBE_DAILY_LIMIT (reserveProbe), а не quota_counter.
  charge?: () => Promise<ChargeDecision>;
  spend: SpendRecorder;
  event: Omit<SpendEvent, 'phase' | 'result' | 'attempt_no' | 'tokens_actual'>;
  run: (attempt: number) => Promise<{ value: T; tokens?: number }>;
  retries?: number; // дополнительных попыток при RetryableCallError (EmbedAndStore: 2)
  pauseMs?: number;
}
function outcomeOf(error: unknown): SpendResult {
  return error instanceof RetryableCallError ? error.result
    : error && typeof error === 'object' && 'spendResult' in error && typeof error.spendResult === 'string'
      ? error.spendResult as SpendResult : 'provider_error';
}
// Порядок — защита (security-operation-order): квота → attempt(fsync) → вызов → outcome. Отказ модели
// списанное НЕ возвращает; повтор — новая попытка: новое списание и новая строка attempt.
export async function meteredCall<T>(call: MeteredCall<T>): Promise<MeteredResult<T>> {
  const retries = call.retries ?? 0;
  for (let attempt = 1; ; attempt++) {
    if (call.charge) {
      const decision = await call.charge();
      if (!decision.granted) return { status: 'refused', scope: decision.scope, attempts: attempt - 1 };
    }
    // Нет учёта — нет траты (RecordModelSpend п.2): ошибка записи прерывает до вызова.
    await call.spend({ ...call.event, attempt_no: attempt, phase: 'attempt', result: 'started' });
    try {
      const { value, tokens } = await call.run(attempt);
      await writeOutcome(call, attempt, 'success', tokens);
      return { status: 'ok', value, attempts: attempt };
    } catch (error) {
      await writeOutcome(call, attempt, outcomeOf(error));
      if (!(error instanceof RetryableCallError) || attempt > retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, call.pauseMs ?? 1000));
    }
  }
}
async function writeOutcome<T>(call: MeteredCall<T>, attempt: number, result: SpendResult, tokens?: number) {
  // Строка attempt уже на диске — оплачиваемая единица учтена; потеря outcome не должна подменить
  // исход вызова, но и молча не проходит.
  try { await call.spend({ ...call.event, attempt_no: attempt, phase: 'outcome', result, ...(tokens === undefined ? {} : { tokens_actual: tokens }) }); }
  catch { console.error(`Журнал расхода: строка outcome не записана (${call.event.call}, попытка ${attempt}); attempt учтён`); }
}

// Пробы старта — «свой-код»: их предел — число проб в сутки на вид, а не quota_counter (контракт,
// строка проба-старта). Перезапуск по кругу (restart: unless-stopped) иначе платил бы без конца.
export const PROBE_DAILY_LIMIT = 24;
export function reserveProbe(spendPath: string, kind: 'answer' | 'embed', day: string): number {
  const file = join(dirname(validateSpendPath(spendPath)), `probe-${kind}-${day}.log`);
  // O_APPEND одной короткой строкой атомарен между процессами; счёт — после своей записи.
  const fd = openSync(file, 'a', 0o600);
  try { writeSync(fd, `${new Date().toISOString()} ${process.pid}\n`); } finally { closeSync(fd); }
  const used = readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
  if (used > PROBE_DAILY_LIMIT) {
    throw new Error(`проба ${kind} исчерпала ${PROBE_DAILY_LIMIT} попыток за ${day}: перезапуск по кругу оплачивал бы вызовы без предела — старт отклонён`);
  }
  return used;
}
