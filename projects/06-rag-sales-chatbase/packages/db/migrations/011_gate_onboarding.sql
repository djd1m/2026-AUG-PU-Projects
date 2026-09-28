-- gate-onboarding (инцидент стенда 28.09, A-N6-066): ворота A-N6-035 видны владельцу. Только расширяющая миграция —
-- прежнее приложение работает на новой схеме (нового исхода не пишет, новых колонок не читает).
--
-- 1. Исход not_verified: вопрос посетителя, отбитый воротами «Я проверил ответы бота», пишется в журнал — БЕЗ текста
--    (152-ФЗ: CHECK question_text_only_unknown из 001 остаётся в силе), без списания квоты и без вызова модели.
--    Без этой строки сводка показывала «вопросов ещё не было», пока посетители упирались в заглушку.
--    Имя ограничения — то, что 001 получила по умолчанию; tests/enums.test.ts сверяет ПОСЛЕДНЕЕ его определение.
--    Значение только ДОБАВЛЯЕТСЯ к текущему набору (та же форма, что у 013 small_talk): на стенде 013 применена РАНЬШЕ 011
--    (слияние параллельных фич), и перечисление набора целиком здесь стёрло бы small_talk. Координатор, 28.09.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conrelid = 'question_log'::regclass AND c.conname = 'question_log_outcome_check';
  IF def IS NULL OR position('ARRAY[' in def) = 0 THEN
    RAISE EXCEPTION 'question_log_outcome_check не найден или неожиданной формы (%): миграция 011 не применена', def;
  END IF;
  IF position('''not_verified''' in def) > 0 THEN RETURN; END IF;
  ALTER TABLE question_log DROP CONSTRAINT question_log_outcome_check;
  EXECUTE 'ALTER TABLE question_log ADD CONSTRAINT question_log_outcome_check '
    || replace(def, 'ARRAY[', 'ARRAY[''not_verified''::text, ');
END $$;

-- 2. Пометка «отметку сняла база»: когда и почему. Причина — закрытый набор (сейчас одна: новый фрагмент бота).
--    Стирается любым действием владельца с отметкой (setAnswersVerified): пометка описывает ТЕКУЩЕЕ снятое состояние.
ALTER TABLE bot ADD COLUMN answers_verified_reset_at timestamptz;
ALTER TABLE bot ADD COLUMN answers_verified_reset_reason text
  CONSTRAINT bot_verified_reset_reason_check CHECK (answers_verified_reset_reason IN ('new_material'));
ALTER TABLE bot ADD CONSTRAINT bot_verified_reset_pair
  CHECK ((answers_verified_reset_at IS NULL) = (answers_verified_reset_reason IS NULL));
-- Ревью круга 1 (конкурентность): «отметка стоит» и «отметку сняла база» взаимоисключающи — держит БАЗА, а не порядок
-- операций в коде. Любая гонка триггера с setAnswersVerified, дающая оба сразу, падает на вставке, а не показывает
-- владельцу «проверено» вместе с «материалы обновились».
ALTER TABLE bot ADD CONSTRAINT bot_verified_or_reset CHECK (answers_verified_at IS NULL OR answers_verified_reset_at IS NULL);
-- Ревью круга 2 (high): совместимость со СТАРЫМ приложением. Прежний setAnswersVerified ставит только answers_verified_at —
-- без этой функции его отметка после снятия триггером упиралась бы в CHECK выше, и бот оставался бы закрытым при откате.
-- Поставленная отметка сама стирает пометку снятия: инвариант держит база, какой бы код ни писал строку.
CREATE FUNCTION bot_verified_clears_reset() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.answers_verified_at IS NOT NULL THEN
    NEW.answers_verified_reset_at := NULL;
    NEW.answers_verified_reset_reason := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bot_verified_clears_reset BEFORE INSERT OR UPDATE ON bot FOR EACH ROW EXECUTE FUNCTION bot_verified_clears_reset();

-- 3. Триггер 004 (A-N6-036) снимал отметку молча — теперь оставляет пометку. Строку бота трогает, как и прежде, только
--    когда отметка ещё стоит: пачка фрагментов уже снятого бота пометку не переписывает (дата — первое снятие).
CREATE OR REPLACE FUNCTION bot_reset_verified_on_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bot SET answers_verified_at = NULL, answers_verified_reset_at = now(), answers_verified_reset_reason = 'new_material'
   WHERE answers_verified_at IS NOT NULL AND id IN (SELECT DISTINCT bot_id FROM new_chunks);
  RETURN NULL;
END $$;
