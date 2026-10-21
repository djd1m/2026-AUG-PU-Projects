-- 004_source_site_key.sql — «тот же источник» для идемпотентного ключа задачи (фича index-jobs, SC-US-004-4).
-- Частичный уникальный index_job (source_id) WHERE живая (001_init.sql) склеивает повторы ТОЛЬКО для одного source_id.
-- Двойной клик «добавить источник» создавал бы два источника с одним URL и, значит, две живые задачи. Здесь источник
-- сайта уникален в пределах бота по НОРМАЛИЗОВАННОМУ URL (packages/db/src/jobs.ts normalizeSiteUrl: без #фрагмента,
-- хост в нижнем регистре): вставка ON CONFLICT DO NOTHING + чтение победителя даёт один источник на N одновременных POST.
CREATE UNIQUE INDEX source_bot_site_url_key ON source (bot_id, url) WHERE kind = 'site';
