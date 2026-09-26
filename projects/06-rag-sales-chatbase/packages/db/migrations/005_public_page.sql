-- public-page-and-summary (фича 13; FR-GROWTH-005, FR-GROWTH-006, FR-BOT-004): только добавляющая миграция.
--
-- 1. Откуда пришёл аккаунт по бейджу или демо-странице (`/?from=`, FR-GROWTH-003/006): домен хозяина виджета или
--    `b/<slug>`. Пишется один раз при регистрации из cookie прихода; форма проверяется и в коде
--    (apps/web/src/lib/arrival.ts), и здесь — мусор из cookie не ложится в метрику conv%.
ALTER TABLE account ADD COLUMN came_from text CONSTRAINT account_came_from_form CHECK (length(came_from) <= 253 AND
  came_from ~ '^(b/[a-z0-9-]{3,60}|[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+)$');

-- 2. Метрики роста (i, conv%, просмотры демо-страницы) читают события по типу за период.
CREATE INDEX growth_event_type_created ON growth_event (type, created_at);

-- 3. Сторож удаляет сессии посетителей без событий, без истории и без записей журнала (carry_over фичи 12).
CREATE INDEX visitor_session_created ON visitor_session (created_at);
-- Проверка «у сессии нет записей журнала» и ON DELETE SET NULL при удалении сессии читают question_log по сессии —
-- без индекса оба прохода читали бы журнал целиком на каждую строку.
CREATE INDEX question_log_visitor_session ON question_log (visitor_session_id) WHERE visitor_session_id IS NOT NULL;
