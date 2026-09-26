// Сессия посетителя виджета для POST /w/v1/ask (фича visitor-ask-and-limits; FR-WIDGET-002, FR-ANSWER-003, FR-GROWTH-006;
// Pseudocode AnswerQuestion п.8, WatchdogTick п.5). Написано заново (ADR-016: донора нет).
//
// id сессии приходит СЮДА только из токена, подпись которого уже проверил web (apps/web/src/server/visitor-token.ts:
// HMAC по боту, origin и префиксу /24): клиент не выбирает id сам, поэтому ключ visitor_answers нельзя подобрать.
// Строка создаётся при первом событии бейджа или вопросе и привязана к боту и origin — чужая привязка — отказ.
//
// История (≤ 2 хода) — на сервере; ход старше 30 минут не читается и стирается сторожем (152-ФЗ: текст вопроса).
// Возраст считается ПО ХОДУ: у каждого хода своё поле at (часы БД). history_at — время САМОГО СТАРОГО хранимого хода:
// по нему сторож находит строку, как только просрочен хотя бы один ход (ревью фичи 12, находки 2 и 3). Ход без at —
// просрочен (fail-closed: так читаются и строки, записанные до этой правки).
import type { Pool } from 'pg';
import { HISTORY_TURNS, type HistoryTurn } from '@n6/rag';
import { isUuid } from './index-jobs.js';
import { transaction } from './quota.js';

export const VISITOR_HISTORY_TTL_MINUTES = 30;

// Свежий ли ход e.t: константа TTL — из кода, не из ввода, поэтому подставляется в текст запроса.
const TURN_FRESH = `CASE WHEN jsonb_typeof(e.t->'at') = 'string'
  THEN (e.t->>'at')::timestamptz > now() - make_interval(mins => ${VISITOR_HISTORY_TTL_MINUTES}) ELSE false END`;
// Свежие ходы jsonb-выражения (порядок сохранён) и время самого старого из них (NULL, если свежих нет).
const freshTurns = (expr: string) => `(SELECT COALESCE(jsonb_agg(e.t ORDER BY e.ord), '[]'::jsonb)
  FROM jsonb_array_elements(${expr}) WITH ORDINALITY AS e(t, ord) WHERE ${TURN_FRESH})`;
const oldestFresh = (expr: string) => `(SELECT min((e.t->>'at')::timestamptz)
  FROM jsonb_array_elements(${expr}) WITH ORDINALITY AS e(t, ord) WHERE ${TURN_FRESH})`;

export interface VisitorSessionState { history: HistoryTurn[]; badgeShown: boolean }
function readHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((t: unknown) => (t && typeof t === 'object' && typeof (t as HistoryTurn).question === 'string' && typeof (t as HistoryTurn).answer === 'string'
    ? [{ question: (t as HistoryTurn).question, answer: (t as HistoryTurn).answer }] : [])).slice(-HISTORY_TURNS);
}

// Открыть сессию вопроса: создать строку, если её ещё нет, и проверить привязку к боту и origin. null — сессия чужая
// (другой бот или origin): вызывающий отвечает 409 и виджет берёт новую. badgeShown — был ли у этой сессии записанный
// показ бейджа (условие вопроса на плане с бейджем, ADR-004). history — только СВЕЖИЕ ходы.
export function openVisitorSession(pool: Pool, input: { id: string; botId: string; origin: string; ipPrefix: string }): Promise<VisitorSessionState | null> {
  if (!isUuid(input.id) || !isUuid(input.botId)) return Promise.resolve(null);
  return transaction(pool, async (tx) => {
    // Обращение обновляет last_seen_at ДО вызова модели: сторож (sweepIdleVisitorSessions) не удалит сессию посреди ответа.
    await tx.query(`INSERT INTO visitor_session (id, bot_id, ip_prefix, origin) VALUES ($1, $2, $3::cidr, $4)
      ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`, [input.id, input.botId, input.ipPrefix, input.origin]);
    const row = (await tx.query<{ bot_id: string; origin: string; history: unknown; badge: boolean }>(
      `SELECT s.bot_id, s.origin, ${freshTurns('s.history')} AS history,
         EXISTS (SELECT 1 FROM growth_event g WHERE g.visitor_session_id = s.id AND g.type = 'badge_impression') AS badge
       FROM visitor_session s WHERE s.id = $1`, [input.id])).rows[0];
    if (!row || row.bot_id !== input.botId || row.origin !== input.origin) return null;
    return { history: readHistory(row.history), badgeShown: row.badge };
  });
}

// Ход дописывается одним UPDATE: значение считается из ТЕКУЩЕЙ версии строки (при гонке Postgres пересчитает SET по
// новой версии). Из прежней истории остаются только СВЕЖИЕ ходы, не больше HISTORY_TURNS − 1 последних; новый ход
// получает at = now() БД; history_at — самый старый из хранимых ходов.
export async function appendVisitorTurn(pool: Pool, sessionId: string, turn: HistoryTurn): Promise<void> {
  if (!isUuid(sessionId)) return;
  const next = `(COALESCE((SELECT jsonb_agg(k.t ORDER BY k.ord) FROM (
      SELECT e.t, e.ord FROM jsonb_array_elements(s.history) WITH ORDINALITY AS e(t, ord) WHERE ${TURN_FRESH}
      ORDER BY e.ord DESC LIMIT $3) k), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('question', $2::text, 'answer', $4::text, 'at', now())))`;
  await pool.query(`UPDATE visitor_session s SET history = ${next}, history_at = ${oldestFresh(next)} WHERE s.id = $1`,
    [sessionId, turn.question, HISTORY_TURNS - 1, turn.answer]);
}

// Pseudocode AnswerQuestion п.8: первый answered бота посетителю — событие роста first_answer (одно на бота).
export async function recordFirstAnswer(pool: Pool, input: { botId: string; visitorSessionId: string; origin: string }): Promise<boolean> {
  const result = await pool.query(`INSERT INTO growth_event (type, bot_id, account_id, visitor_session_id, from_domain, dedup_key)
    SELECT 'first_answer', b.id, b.account_id, $2::uuid, $3::text, $4::text FROM bot b WHERE b.id = $1
    ON CONFLICT (type, dedup_key) DO NOTHING RETURNING id`, [input.botId, input.visitorSessionId, new URL(input.origin).hostname, `first_answer:${input.botId}`]);
  return result.rowCount === 1;
}

// Сторож (WatchdogTick п.5, 152-ФЗ): текст вопроса «не знаю» — по истечении 14 дней; из истории посетителя — КАЖДЫЙ ход
// старше 30 минут (свежие ходы остаются). Пачками, чтобы не держать длинную блокировку. Условие срока повторено во
// внешнем WHERE: строку, которую конкурентный appendVisitorTurn обновил после выбора id, Postgres перепроверит по новой
// версии и пропустит (находка 3); сам SET тоже оставляет свежие ходы, поэтому свежий ход не стирается ни в каком порядке.
export async function sweepVisitorText(pool: Pool, batch: number): Promise<{ questionTexts: number; histories: number }> {
  const texts = await pool.query(`UPDATE question_log SET text = NULL, text_expires_at = NULL WHERE id IN (
      SELECT id FROM question_log WHERE text_expires_at IS NOT NULL AND text_expires_at <= now() ORDER BY text_expires_at LIMIT $1)`, [batch]);
  const histories = await pool.query(`UPDATE visitor_session s SET history = ${freshTurns('s.history')}, history_at = ${oldestFresh('s.history')}
    WHERE s.history_at IS NOT NULL AND s.history_at <= now() - make_interval(mins => $2) AND s.id IN (
      SELECT id FROM visitor_session WHERE history_at IS NOT NULL AND history_at <= now() - make_interval(mins => $2) ORDER BY history_at LIMIT $1)`,
  [batch, VISITOR_HISTORY_TTL_MINUTES]);
  return { questionTexts: texts.rowCount ?? 0, histories: histories.rowCount ?? 0 };
}

export const IDLE_VISITOR_SESSION_HOURS = 24;
// Сторож (carry_over фичи 12): строка visitor_session старше суток, у которой нет истории, нет событий роста и нет
// записей журнала вопросов, — след одного запроса конфигурации, хранить его незачем (152-ФЗ: префикс IP и origin).
// Сессии с записями журнала НЕ удаляются: question_log.visitor_session_id — ON DELETE SET NULL, и такой вопрос выпал бы
// из сводки «ответил / не знал» (она считает только вопросы с сессией). Токен удалённой сессии остаётся годным по
// подписи — openVisitorSession создаст строку заново.
// Возраст — по last_seen_at (последнее обращение), а не по created_at: вопрос по старому токену обновляет его ДО вызова
// модели, и сессия не исчезает посреди ответа (ревью фичи 13, находка 1). Условие возраста повторено во внешнем WHERE:
// строку, которую конкурентное обращение обновило после выбора id, Postgres перепроверит по новой версии и не удалит.
export async function sweepIdleVisitorSessions(pool: Pool, batch: number): Promise<number> {
  const deleted = await pool.query(`DELETE FROM visitor_session d WHERE d.last_seen_at < now() - make_interval(hours => $2) AND d.id IN (
      SELECT s.id FROM visitor_session s
      WHERE s.last_seen_at < now() - make_interval(hours => $2) AND s.history = '[]'::jsonb AND s.history_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM growth_event g WHERE g.visitor_session_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM question_log q WHERE q.visitor_session_id = s.id)
      ORDER BY s.last_seen_at LIMIT $1)`, [batch, IDLE_VISITOR_SESSION_HOURS]);
  return deleted.rowCount ?? 0;
}
