// Хранилище ядра ответа (AnswerQuestion п.2, п.8; FR-ANSWER-003; FR-LIMIT-001/002) — написано заново
// (ADR-016). Три операции: бот ответа из доверенного идентификатора, квота вопроса по часам БД, журнал вопроса.
import type { Pool } from 'pg';
import { QUESTION_TEXT_TTL_DAYS, readAccountPlan, type AnswerBot, type Ceilings, type ChargeDecision, type QuestionLogEntry } from '@n6/rag';
import { ownerAnswerCharges, previewAnswerCharges, visitorAnswerCharges } from './ceilings.js';
import { isUuid } from './index-jobs.js';
import { chargeQuota, transaction } from './quota.js';

export interface LoadedAnswerBot extends AnswerBot { plan: ReturnType<typeof readAccountPlan> }
// botId — ТОЛЬКО из серверного разрешения (public_key виджета/токен предпросмотра/сессия кабинета), не из тела.
// Нет строки — null (маршрут отвечает 404, как на чужой ресурс). Статус и план — сырые: их читает ядро
// fail-closed (readBotStatus → deleted, readAccountPlan → free).
export async function loadAnswerBot(pool: Pool, botId: string): Promise<LoadedAnswerBot | null> {
  if (!isUuid(botId)) return null;
  const row = (await pool.query<{ id: string; status: string; company_name: string; contact: string | null; plan: string | null }>(
    `SELECT b.id, b.status, b.company_name, b.contact, a.plan FROM bot b LEFT JOIN account a ON a.id = b.account_id WHERE b.id = $1`, [botId])).rows[0];
  if (!row) return null;
  return { id: row.id, status: row.status, companyName: row.company_name, contact: row.contact, plan: readAccountPlan(row.plan) };
}

export type AnswerQuotaInput =
  | { mode: 'widget'; botId: string; plan: unknown; visitorSession: string; ipPrefix: string }
  | { mode: 'preview'; browserSession: string }
  | { mode: 'owner'; botId: string; plan: unknown };
// Квота вопроса одной КОРОТКОЙ транзакцией, сутки — по часам БД (урок quota-and-spend M2), все scope или ни одного.
export function chargeAnswerQuota(pool: Pool, ceilings: Ceilings, input: AnswerQuotaInput): Promise<ChargeDecision> {
  return transaction(pool, async (tx) => {
    const now = (await tx.query<{ now: Date }>('SELECT now() AS now')).rows[0]!.now;
    const charges = input.mode === 'widget'
      ? visitorAnswerCharges(ceilings, { visitorSession: input.visitorSession, ipPrefix: input.ipPrefix, botId: input.botId, plan: input.plan, now })
      : input.mode === 'owner' ? ownerAnswerCharges(ceilings, { botId: input.botId, plan: input.plan, now })
        : previewAnswerCharges(ceilings, { browserSession: input.browserSession, now });
    const decision = await chargeQuota(tx, charges);
    return decision.granted ? { granted: true } : { granted: false, scope: decision.scope };
  });
}

// Журнал вопроса: текст — только у unknown и со сроком 14 дней (152-ФЗ; CHECK question_text_only_unknown —
// вторая линия). У answered — только id процитированных фрагментов.
// refused_origin пишет маршрут виджета (отказ CheckOrigin, visitor-ask-and-limits) — всегда без текста.
export async function recordQuestion(pool: Pool, entry: Omit<QuestionLogEntry, 'outcome'> & { outcome: QuestionLogEntry['outcome'] | 'refused_origin'; visitorSessionId: string | null }): Promise<void> {
  if (entry.text !== null && entry.outcome !== 'unknown') throw new Error('Текст вопроса хранится только у исхода unknown (152-ФЗ)');
  await pool.query(`INSERT INTO question_log (bot_id, visitor_session_id, outcome, text, text_expires_at, cited_chunk_ids)
    VALUES ($1, $2, $3, $4, CASE WHEN $4::text IS NULL THEN NULL ELSE now() + make_interval(days => $5) END, $6::uuid[])`,
  [entry.botId, entry.visitorSessionId, entry.outcome, entry.text, QUESTION_TEXT_TTL_DAYS, entry.citedChunkIds]);
}
