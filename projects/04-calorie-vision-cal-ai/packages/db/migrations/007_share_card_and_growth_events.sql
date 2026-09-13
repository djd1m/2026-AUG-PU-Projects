-- Фича `share-card-and-growth-events` (DEC-A-035: номер 007 закреплён заранее координатором).
-- ОДНО изменение: `foundation` (001_init.sql:181-192) объявила `share_card` с
-- `FOREIGN KEY (recognition_id) REFERENCES recognition(id)`, но БЕЗ уникальности —
-- идемпотентность «одна карточка на скан» (FR-share-card-and-growth-events-4) до сих пор
-- обеспечивать было нечем. Уникальность обеспечивает БАЗА, а не код
-- (`.claude/rules/coding-style.md`; AC-share-card-and-growth-events-16).
ALTER TABLE share_card
  ADD CONSTRAINT share_card_recognition_id_unique UNIQUE (recognition_id);
