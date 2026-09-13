-- `diary-and-streak`, FR-diary-and-streak-1 (02_pseudocode.md, «Data Structures»).
--
-- `diary_entry.recognition_id` уже `NOT NULL REFERENCES recognition(id)` (001_init.sql), но БЕЗ
-- уникальности: два конкурентных `INSERT` для ОДНОГО `recognition_id` (двойной тап на «подтвердить»,
-- повтор сети) сегодня создали бы ДВЕ строки дневника на один и тот же скан. Уникальность даёт базе
-- то, что код обязан уметь опереть на неё атомарно: `INSERT … ON CONFLICT (recognition_id) DO
-- NOTHING RETURNING *` (`shared-resource-verification.md`: «прочитать, потом вставить» здесь
-- запрещено — обе реализации проходят последовательный тест, различает их только конкурентный).
--
-- Номер файла: 003–005 заняты `consent-and-telegram-auth`, 007 и 008 зарезервированы за другими
-- фичами (DEC-A-035) — 006 закреплён за `diary-and-streak`.

ALTER TABLE diary_entry ADD CONSTRAINT diary_entry_recognition_id_key UNIQUE (recognition_id);
