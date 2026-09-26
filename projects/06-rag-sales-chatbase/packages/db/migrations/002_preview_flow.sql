-- preview-flow (фича 9, FR-PREVIEW-001/002, A-N6-032): только добавляющая миграция (канон: down-миграции нет).
--
-- 1. Ключ повторности создания предпросмотра. У предпросмотра бот новый на каждый вызов, поэтому
--    UNIQUE (bot_id, idempotency_key) задачи индексации повтор НЕ ловит. Повтор узнаётся по паре
--    (сессия браузера, Idempotency-Key): уникальный индекс — атомарное «уже создано», конфликт вставки
--    откатывает ВСЮ транзакцию создания, включая списание квоты.
ALTER TABLE preview ADD COLUMN idempotency_key uuid;
CREATE UNIQUE INDEX preview_browser_idempotency ON preview (browser_session, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. История диалога предпросмотра живёт НА СЕРВЕРЕ (carry_over ревью rag-answer, находка 2): ходы ассистента
--    от клиента не принимаются вовсе. Не больше 2 ходов (канон §7); очищается при claim; строка предпросмотра
--    без claim удаляется сторожем через 24 ч вместе с ботом (каскад).
ALTER TABLE preview ADD COLUMN history jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT preview_history_bounded CHECK (jsonb_typeof(history) = 'array' AND jsonb_array_length(history) <= 2);

-- Поиск предпросмотра по токену из cookie — token_hash уже UNIQUE (001_init.sql).
CREATE INDEX preview_bot ON preview (bot_id);
