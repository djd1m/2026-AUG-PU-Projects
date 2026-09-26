-- Ревью фичи 12 (08_review.md, находка 1, high): отметка «Я проверил ответы бота» (A-N6-035) обязана сниматься, когда у
-- бота появляется материал, которого владелец не видел. Снимает её БАЗА, а не каждый путь записи: новый источник,
-- «Повторить», будущая переиндексация (фича 16) — любой INSERT фрагмента бота. Триггер на оператор, а не на строку:
-- пачка фрагментов обновляет бота один раз, и строку бота трогает только тогда, когда отметка ещё стоит.
-- Вторая половина — в setAnswersVerified: поставить отметку нельзя, пока задача индексации бота queued/running
-- (иначе фрагмент незакоммиченной транзакции индексации проскочил бы мимо триггера до отметки).
CREATE FUNCTION bot_reset_verified_on_chunk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bot SET answers_verified_at = NULL
   WHERE answers_verified_at IS NOT NULL AND id IN (SELECT DISTINCT bot_id FROM new_chunks);
  RETURN NULL;
END $$;

CREATE TRIGGER chunk_resets_verified AFTER INSERT ON chunk
  REFERENCING NEW TABLE AS new_chunks FOR EACH STATEMENT EXECUTE FUNCTION bot_reset_verified_on_chunk();
