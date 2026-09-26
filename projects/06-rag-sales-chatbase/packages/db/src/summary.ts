// BotSummary (фича public-page-and-summary; FR-BOT-004, SC-US-010-1/2; Pseudocode BotSummary). Написано заново
// (ADR-016: донора нет).
//
// Считаются ТОЛЬКО вопросы посетителей: у них заполнен visitor_session_id (виджет и демо-страница). Вопросы
// предпросмотра пишутся без сессии, тестовый чат владельца не пишется вовсе (A-N6-033), refused_origin — отказ по
// домену, а не вопрос к боту. Окно — 7 суток по часам БД. Сторож не удаляет сессии, на которые ссылается журнал
// (sweepIdleVisitorSessions), поэтому ON DELETE SET NULL не выбрасывает ответы из сводки.
import type { Pool } from 'pg';
import { OWNED, pair } from './bots.js';

export const SUMMARY_DAYS = 7;
export const SUMMARY_UNKNOWN_LIMIT = 20;

export interface BotSummary {
  answered: number; unknown: number; refused_limit: number;
  // Последние ≤ 20 вопросов «не знаю» с ещё не стёртым текстом (152-ФЗ: текст живёт 14 дней).
  last_unknown: { text: string; asked_at: string }[];
}
// null — бот чужой или не существует (404). Пустая сводка — нули и пустой список: «вопросов ещё не было» решает экран,
// процентов сводка не отдаёт вовсе (CFG-I7: 0/0 — не «0 %»).
export async function readBotSummary(pool: Pool, botId: string, accountId: string): Promise<BotSummary | null> {
  if (!pair(botId, accountId)) return null;
  const owned = await pool.query(`SELECT 1 FROM bot b JOIN account a ON a.id = b.account_id WHERE ${OWNED}`, [botId, accountId]);
  if (!owned.rowCount) return null;
  const counts = (await pool.query<{ answered: number; unknown: number; refused_limit: number }>(
    `SELECT count(*) FILTER (WHERE outcome = 'answered')::int AS answered, count(*) FILTER (WHERE outcome = 'unknown')::int AS unknown,
       count(*) FILTER (WHERE outcome = 'refused_limit')::int AS refused_limit
     FROM question_log WHERE bot_id = $1 AND visitor_session_id IS NOT NULL AND created_at > now() - make_interval(days => $2)`,
    [botId, SUMMARY_DAYS])).rows[0]!;
  const unknown = (await pool.query<{ text: string; asked_at: Date }>(
    `SELECT text, created_at AS asked_at FROM question_log
     WHERE bot_id = $1 AND visitor_session_id IS NOT NULL AND outcome = 'unknown' AND text IS NOT NULL AND created_at > now() - make_interval(days => $2)
     ORDER BY created_at DESC, id LIMIT $3`, [botId, SUMMARY_DAYS, SUMMARY_UNKNOWN_LIMIT])).rows;
  return { answered: counts.answered, unknown: counts.unknown, refused_limit: counts.refused_limit,
    last_unknown: unknown.map((row) => ({ text: row.text, asked_at: row.asked_at.toISOString() })) };
}
