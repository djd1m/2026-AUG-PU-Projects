-- small-talk (A-N6-074, решение владельца 28.09.2026): исход question_log.outcome = 'small_talk' — светская реплика
-- («привет», «спасибо», «кто ты»), на которую бот ответил шаблоном кода БЕЗ эмбеддинга, модели и списания квоты.
-- Текста у исхода нет (question_text_only_unknown не меняется: текст хранится только у unknown, 152-ФЗ).
--
-- Только ДОБАВЛЯЕТ значение к ТЕКУЩЕМУ набору ограничения, каким бы он ни был к этому моменту: параллельная фича
-- добавляет своё значение миграцией 011, и перечисление набора целиком здесь стёрло бы его. Ограничение без
-- ARRAY[…] или без имени — отказ миграции, а не молчаливая замена.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conrelid = 'question_log'::regclass AND c.conname = 'question_log_outcome_check';
  IF def IS NULL OR position('ARRAY[' in def) = 0 THEN
    RAISE EXCEPTION 'question_log_outcome_check не найден или неожиданной формы (%): миграция 013 не применена', def;
  END IF;
  IF position('''small_talk''' in def) > 0 THEN RETURN; END IF;
  ALTER TABLE question_log DROP CONSTRAINT question_log_outcome_check;
  EXECUTE 'ALTER TABLE question_log ADD CONSTRAINT question_log_outcome_check '
    || replace(def, 'ARRAY[', 'ARRAY[''small_talk''::text, ');
END $$;
