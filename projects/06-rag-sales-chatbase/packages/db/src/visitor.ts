// Сессия посетителя виджета для POST /w/v1/ask (фича visitor-ask-and-limits; FR-WIDGET-002, FR-ANSWER-003, FR-GROWTH-006;
// Pseudocode AnswerQuestion п.8, WatchdogTick п.5). Написано заново (ADR-016: донора нет).
//
// id сессии приходит СЮДА только из токена, подпись которого уже проверил web (apps/web/src/server/visitor-token.ts:
// HMAC по боту, origin и префиксу /24): клиент не выбирает id сам, поэтому ключ visitor_answers нельзя подобрать.
// Строка создаётся при первом событии бейджа или вопросе и привязана к боту и origin — чужая привязка — отказ.
//
// История (≤ 2 хода) — на сервере; ход старше 30 минут не читается и стирается сторожем (152-ФЗ: текст вопроса).
import type { Pool } from 'pg';
import { HISTORY_TURNS, type HistoryTurn } from '@n6/rag';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export const VISITOR_HISTORY_TTL_MINUTES = 30;

export interface VisitorSessionState { history: HistoryTurn[]; badgeShown: boolean }
function readHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t: unknown) => (t && typeof t === 'object' && typeof (t as HistoryTurn).question === 'string' && typeof (t as HistoryTurn).answer === 'string'
    ? [{ question: (t as HistoryTurn).question, answer: (t as HistoryTurn).answer }] : [])).slice(-HISTORY_TURNS);
}

// Открыть сессию вопроса: создать строку, если её ещё нет, и проверить привязку к боту и origin. null — сессия чужая
// (другой бот или origin): вызывающий отвечает 409 и виджет берёт новую. badgeShown — был ли у этой сессии записанный
// показ бейджа (условие вопроса на плане с бейджем, ADR-004).
export function openVisitorSession(pool: Pool, input: { id: string; botId: string; origin: string; ipPrefix: string }): Promise<VisitorSessionState | null> {
  if (!isUuid(input.id) || !isUuid(input.botId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    await tx.query(`INSERT INTO visitor_session (id, bot_id, ip_prefix, origin) VALUES ($1, $2, $3::cidr, $4) ON CONFLICT (id) DO NOTHING`,
      [input.id, input.botId, input.ipPrefix, input.origin]);
    const row = (await tx.query<{ bot_id: string; origin: string; history: unknown; fresh: boolean; badge: boolean }>(
      `SELECT s.bot_id, s.origin, s.history, (s.history_at > now() - make_interval(mins => $2)) IS TRUE AS fresh,
         EXISTS (SELECT 1 FROM growth_event g WHERE g.visitor_session_id = s.id AND g.type = 'badge_impression') AS badge
       FROM visitor_session s WHERE s.id = $1`, [input.id, VISITOR_HISTORY_TTL_MINUTES])).rows[0];
    if (!row || row.bot_id !== input.botId || row.origin !== input.origin) return null;
    return { history: row.fresh ? readHistory(row.history) : [], badgeShown: row.badge };
  });
}

// Ход дописывается атомарно, хранится ≤ 2 последних; устаревшая история (> 30 мин) заменяется, а не продолжается.
export async function appendVisitorTurn(pool: Pool, sessionId: string, turn: HistoryTurn): Promise<void> {
  if (!isUuid(sessionId)) return;
  await pool.query(`UPDATE visitor_session SET history_at = now(), history = CASE
      WHEN history_at IS NULL OR history_at <= now() - make_interval(mins => $4) THEN $2::jsonb
      WHEN jsonb_array_length(history) >= $3 THEN (history - 0) || $2::jsonb
      ELSE history || $2::jsonb END
    WHERE id = $1`, [sessionId, JSON.stringify([{ question: turn.question, answer: turn.answer }]), HISTORY_TURNS, VISITOR_HISTORY_TTL_MINUTES]);
}

// Pseudocode AnswerQuestion п.8: первый answered бота посетителю — событие роста first_answer (одно на бота).
export async function recordFirstAnswer(pool: Pool, input: { botId: string; visitorSessionId: string; origin: string }): Promise<boolean> {
  const result = await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, visitor_session_id, from_domain, dedup_key)
    SELECT 'first_answer', b.id, b.account_id, $2::uuid, $3::text, $4::text FROM bot b WHERE b.id = $1
    ON CONFLICT (type, dedup_key) DO NOTHING RETURNING id`, [input.botId, input.visitorSessionId, new URL(input.origin).hostname, `first_answer:${input.botId}`]);
  return result.rowCount === 1;
}

// Сторож (WatchdogTick п.5, 152-ФЗ): текст вопроса «не знаю» — по истечении 14 дней; история посетителя — старше
// 30 минут. Пачками, чтобы не держать длинную блокировку.
export async function sweepVisitorText(pool: Pool, batch: number): Promise<{ questionTexts: number; histories: number }> {
  const texts = await pool.query(`UPDATE question_log SET text = NULL, text_expires_at = NULL WHERE id IN (
      SELECT id FROM question_log WHERE text_expires_at IS NOT NULL AND text_expires_at <= now() ORDER BY text_expires_at LIMIT $1)`, [batch]);
  const histories = await pool.query(`UPDATE visitor_session SET history = '[]'::jsonb, history_at = NULL WHERE id IN (
      SELECT id FROM visitor_session WHERE history_at IS NOT NULL AND history_at <= now() - make_interval(mins => $2) ORDER BY history_at LIMIT $1)`,
  [batch, VISITOR_HISTORY_TTL_MINUTES]);
  return { questionTexts: texts.rowCount ?? 0, histories: histories.rowCount ?? 0 };
}
