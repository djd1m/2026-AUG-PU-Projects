// Журнал платных вызовов — перенос инварианта N4 apps/recognizer/src/observability/model-call-log.ts (#15):
// START пишется ДО отправки, исход — ровно один на попытку. Носитель — строка model_call_log в Postgres (Spec), а не
// stdout; START коммитится в ОДНОЙ транзакции с резервом квоты (paid-call.ts), исход — UPDATE … WHERE state='started',
// поэтому второй исход той же попытки невозможен (поздний ответ не перепишет первый).
// Крах между START и исходом оставляет 'started' навсегда: «попытка засчитана, исход неизвестен» (01_plan.md §3).

import { MODEL_CALL_KINDS } from './enums.js';
import type { PoolClient } from './pool.js';

export type ModelCallKind = (typeof MODEL_CALL_KINDS)[number];
export type ModelCallOutcome = 'succeeded' | 'failed';

export interface CallOwner {
  readonly accountId: string | null;
  readonly botId: string | null;
}

function tokens(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** START внутри транзакции вызывающего (роль n6b_service). Возвращает id попытки. */
export async function startCall(client: PoolClient, kind: ModelCallKind, owner: CallOwner): Promise<string> {
  if (!MODEL_CALL_KINDS.includes(kind)) throw new Error(`неизвестный вид вызова модели: ${String(kind)}`);
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO model_call_log (kind, account_id, bot_id, state) VALUES ($1, $2, $3, 'started') RETURNING id`,
    [kind, owner.accountId, owner.botId]);
  return rows[0]!.id;
}

/**
 * Исход попытки. true — записан этим вызовом; false — исход уже был (второй исход отвергнут условием state='started').
 * tokens_in/out — фактические числа провайдера для сверки; счётчик квоты по ним НЕ корректируется (01_plan.md §5).
 */
export async function finishCall(client: PoolClient, id: string, outcome: ModelCallOutcome,
  usage: { tokensIn?: number | null; tokensOut?: number | null } = {}): Promise<boolean> {
  const result = await client.query(
    `UPDATE model_call_log SET state = $2, tokens_in = $3, tokens_out = $4 WHERE id = $1 AND state = 'started'`,
    [id, outcome, tokens(usage.tokensIn), tokens(usage.tokensOut)]);
  return result.rowCount === 1;
}
