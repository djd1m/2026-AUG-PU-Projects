// Ручной сброс одного ключа счётчика оператором (OWN-06B-010) и запись отказа по пределу в журнал вопросов
// (OWN-06B-012: `limited` пишется с каналом — на нём строится число «отказов по пределу за сегодня» у владельца).

import { QUESTION_CHANNELS } from './enums.js';
import type { Pool, PoolClient } from './pool.js';
import { isKnownScope } from './quota-keys.js';
import { withService } from './tenant.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ResetRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResetRefused';
  }
}

export interface ResetRequest {
  readonly scope: string;
  readonly day: string;
  readonly operator: string;
  readonly reason?: string;
}

/**
 * Сбрасывает ровно один ключ одного дня в 0 и пишет журнал в той же транзакции. Ключ вне закрытого списка форм,
 * шаблон, пустой оператор или несуществующая строка — отказ (ResetRefused), ничего не меняется.
 * Возвращает прежнее значение.
 */
export async function resetQuota(pool: Pool, req: ResetRequest): Promise<number> {
  const operator = req.operator.trim();
  if (!isKnownScope(req.scope)) throw new ResetRefused(`ключ «${req.scope}» не из закрытого списка форм: сброс не выполнен`);
  if (!DAY_RE.test(req.day)) throw new ResetRefused('день не в форме YYYY-MM-DD: сброс не выполнен');
  if (!operator || operator.length > 100) throw new ResetRefused('оператор не назван (--operator): сброс без журнала запрещён');
  return withService(pool, async (c) => {
    const { rows } = await c.query<{ used: number }>(
      'SELECT used FROM quota_counter WHERE scope = $1 AND day = $2::date FOR UPDATE', [req.scope, req.day]);
    if (rows.length === 0) throw new ResetRefused(`счётчика ${req.scope} за ${req.day} нет: сбрасывать нечего`);
    const previous = Number(rows[0]!.used);
    await c.query('UPDATE quota_counter SET used = 0 WHERE scope = $1 AND day = $2::date', [req.scope, req.day]);
    await c.query(
      `INSERT INTO quota_reset_log (scope, day, previous_used, operator, reason) VALUES ($1, $2::date, $3, $4, $5)`,
      [req.scope, req.day, previous, operator, req.reason ?? null]);
    return previous;
  });
}

export interface LimitedQuestion {
  readonly botId: string;
  readonly accountId: string;
  readonly channel: (typeof QUESTION_CHANNELS)[number];
  readonly visitorKey: string | null;
  readonly originHost: string | null;
  readonly question: string;
}

/** Отказ по пределу → question_log.outcome='limited' с каналом (внутри транзакции вызывающего, роль n6b_service). */
export async function recordLimited(client: PoolClient, q: LimitedQuestion): Promise<void> {
  if (!QUESTION_CHANNELS.includes(q.channel)) throw new Error(`неизвестный канал вопроса: ${String(q.channel)}`);
  await client.query(
    `INSERT INTO question_log (bot_id, account_id, channel, visitor_key, origin_host, question, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, 'limited')`,
    [q.botId, q.accountId, q.channel, q.visitorKey, q.originHost, q.question.slice(0, 500)]);
}
