-- visitor-ask-and-limits (фича 12, FR-WIDGET-002, FR-LIMIT-001, FR-ANSWER-003, A-N6-035): только добавляющая миграция.
--
-- 1. Отметка владельца «Я проверил ответы бота» (A-N6-035). Пока её нет (NULL), ответ модели посетителю виджета НЕ
--    показывается: маршрут отвечает «Бот ещё настраивается» и контактом, модель не зовётся и квота не списывается.
--    Причина — известный разрыв A-N6-030 (валидная цитата не доказывает, что текст ответа совпадает с фрагментом).
ALTER TABLE bot ADD COLUMN answers_verified_at timestamptz;

-- 2. История диалога посетителя живёт НА СЕРВЕРЕ (carry_over ревью rag-answer, находка 2): ходы ассистента от клиента
--    не принимаются вовсе. Не больше 2 ходов (канон §7). Текст вопроса в истории — персональные данные (152-ФЗ):
--    ход старше 30 минут не читается (answers.ts) и стирается сторожем worker-index.
ALTER TABLE visitor_session ADD COLUMN history jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT visitor_history_bounded CHECK (jsonb_typeof(history) = 'array' AND jsonb_array_length(history) <= 2);
ALTER TABLE visitor_session ADD COLUMN history_at timestamptz;
ALTER TABLE visitor_session ADD CONSTRAINT visitor_history_dated CHECK (jsonb_array_length(history) = 0 OR history_at IS NOT NULL);
CREATE INDEX visitor_session_history_at ON visitor_session (history_at) WHERE history_at IS NOT NULL;

-- 3. «Бейдж показан этой сессии» — условие вопроса на плане с бейджем (ADR-004): поиск показа по сессии.
CREATE INDEX growth_event_visitor_type ON growth_event (visitor_session_id, type) WHERE visitor_session_id IS NOT NULL;

-- 4. Сторож стирает текст вопроса «не знаю» по истечении 14 дней (152-ФЗ, Pseudocode WatchdogTick п.5).
CREATE INDEX question_log_text_expiry ON question_log (text_expires_at) WHERE text_expires_at IS NOT NULL;
