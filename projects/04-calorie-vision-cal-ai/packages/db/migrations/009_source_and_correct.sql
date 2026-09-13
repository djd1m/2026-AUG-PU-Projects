-- Фича `source-and-correct` (FR-source-and-correct-9…11, ADR-001, DEC-A-023).
--
-- Номер выдан координатором явно (инструкция Phase 3, DEC-A-035 контекст): основная ветка
-- параллельно поглощает миграции 003–005 фичи `consent-and-telegram-auth`. Коллизия с
-- `diary-and-streak` (тоже претендует на следующий свободный номер по DEC-A-035) —
-- ОЖИДАЕМАЯ и разрешается интегратором при слиянии переименованием одной из двух со
-- сдвигом, тем же приёмом, что уже применён к `consent-and-telegram-auth`
-- (`docker-ports.md`-совместимый принцип: номер файла и есть порядок применения раннера,
-- раннер отказывается переприменять изменённый файл).
--
-- Новых таблиц НЕТ: канон §4 объявляет ровно 14. `food_item` и `food_synonym` уже созданы
-- `001_init.sql` вместе с `pg_trgm` и триграммными индексами — эта фича их НАПОЛНЯЕТ, а не
-- меняет схему.

ALTER TABLE recognition
  ADD COLUMN corrections        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN conflict_choice    text,
  ADD COLUMN conflict_choice_at timestamptz,
  ADD COLUMN user_corrected     boolean      NOT NULL DEFAULT false;

-- Закрытое множество ОБЪЯВЛЕНО В СХЕМЕ, а не только в коде (DEC-A-023): единственное
-- допустимое значение — `take_db`. Значение `model` отвергнуто координатором — иначе
-- оценка модели стала бы источником числа через маршрут правки (ADR-001 через чёрный ход).
ALTER TABLE recognition
  ADD CONSTRAINT recognition_conflict_choice_check
    CHECK (conflict_choice IS NULL OR conflict_choice = 'take_db');

-- Парный CHECK: выбор без времени и время без выбора — разные виды полуправды, и оба
-- выглядят правдоподобно, пока их не сравнить.
ALTER TABLE recognition
  ADD CONSTRAINT recognition_conflict_choice_pair
    CHECK ((conflict_choice IS NULL) = (conflict_choice_at IS NULL));
