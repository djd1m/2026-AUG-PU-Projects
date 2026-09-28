-- verify-audit (инцидент стенда 28.09, A-N6-077): отметка «Я проверил ответы бота» пропала без обхода и без новых фрагментов —
-- по данным нельзя было сказать, кто и когда её снял. Журнал переходов отметки. Только расширяющая миграция: прежнее
-- приложение работает на новой схеме и его действия тоже попадают в журнал (событие пишет база, не код).
--
-- Служебный журнал, НЕ сущность канона §4 (как index_start, erasure_audit). ПДн нет: бот, вид события, кто (роль), когда.
-- Строки уходят каскадом вместе с ботом (стирание аккаунта, сторож черновиков).
CREATE TABLE bot_verification_event (
  id bigserial PRIMARY KEY,
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('set', 'unset_owner', 'unset_new_material')),
  actor text NOT NULL CHECK (actor IN ('owner', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- снимает «система» ровно тогда, когда причина — новые материалы; остальное — действие владельца
  CONSTRAINT bot_verification_event_actor_kind CHECK ((kind = 'unset_new_material') = (actor = 'system'))
);
CREATE INDEX bot_verification_event_bot ON bot_verification_event (bot_id, created_at DESC, id DESC);

-- Событие — на ПЕРЕХОДЕ «стоит ↔ не стоит», в той же транзакции, что изменение (это тот же оператор UPDATE). Повторная
-- установка уже стоящей отметки (прежнее приложение сдвигает дату) событием не является.
-- Кто снял — по строке: триггер фрагментов (004/011) ставит answers_verified_reset_reason = 'new_material' в ТОМ ЖЕ UPDATE;
-- любое другое снятие — владелец (setAnswersVerified стирает пометку; прежний его SQL её не трогает, а при стоящей отметке
-- она всегда NULL — CHECK bot_verified_or_reset).
CREATE FUNCTION bot_verification_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.answers_verified_at IS NOT NULL THEN
    INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES (NEW.id, 'set', 'owner');
  ELSIF NEW.answers_verified_reset_reason = 'new_material' THEN
    INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES (NEW.id, 'unset_new_material', 'system');
  ELSE
    INSERT INTO bot_verification_event (bot_id, kind, actor) VALUES (NEW.id, 'unset_owner', 'owner');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER bot_verification_log AFTER UPDATE OF answers_verified_at ON bot FOR EACH ROW
  WHEN ((OLD.answers_verified_at IS NULL) IS DISTINCT FROM (NEW.answers_verified_at IS NULL))
  EXECUTE FUNCTION bot_verification_log();
