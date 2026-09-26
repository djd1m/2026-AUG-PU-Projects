-- source-lifecycle (фича 16, FR-INDEX-004): только добавляющая миграция плюс снятие неиспользуемого индекса.
--
-- 1. Суточный предел запусков индексации на бота (перенос ревью pdf-source MEDIUM-1). Запуск — создание сайта или
--    PDF, «Повторить», «Обновить». Отказавший запуск СЧИТАЕТСЯ: иначе отказавшие PDF занимали единственный воркер
--    платформы бесплатно. Счёт — под блокировкой строки бота (все пути запуска её держат), число — константа кода
--    INDEX_STARTS_PER_BOT_DAY. Донор — суточные слоты загрузки N5 (quota.ts), но без возврата слота при отказе.
CREATE TABLE index_start (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES bot(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('site', 'pdf', 'retry', 'reindex')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX index_start_bot_day ON index_start (bot_id, created_at);

-- 2. Бюджет токенов эмбеддингов на СЕРИЮ одного источника (перенос chunk-embed): один большой источник не съедает
--    суточный предел аккаунта. Отдельно от embed_budget/embed_used предпросмотра — по embed_budget воркер узнаёт
--    предпросмотр и выбирает плательщика. Сбрасывается при начале новой серии (leaseIndexJob из queued).
ALTER TABLE index_job ADD COLUMN series_embed_used int NOT NULL DEFAULT 0 CHECK (series_embed_used >= 0);

-- 3. Страница, обрезанная по пределу фрагментов CHUNKS_PER_PAGE_MAX (перенос chunk-embed MEDIUM): сколько
--    фрагментов не записано. 0 — страница целиком.
ALTER TABLE page ADD COLUMN chunks_dropped int NOT NULL DEFAULT 0 CHECK (chunks_dropped >= 0);

-- 4. HNSW снят (перенос chunk-embed: «снять HNSW миграцией или ограничить фрагменты»). Поиск — точный перебор
--    фрагментов ОДНОГО бота (A-N6-028, MATERIALIZED-выборка по bot_id) и индекс не использует (EXPLAIN в
--    tests/chunk-embed.integration.test.ts), а вставка платила ≈ 2,8 мс на фрагмент под транзакцией страницы.
--    Обратимо: CREATE INDEX chunk_embedding_hnsw ON chunk USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64).
DROP INDEX IF EXISTS chunk_embedding_hnsw;
