-- crawl-coverage (исправление дефекта стенда 28.09, A-N6-070): только расширяющая миграция.
--
-- Обход aicoding.space на плане free упёрся в предел 50 страниц, а задача закрылась done «50 из 50» без пометки —
-- владелец видел «прочитан целиком». Теперь остановка пределом страниц (page_budget) или потолком запросов/времени
-- обхода (crawl_limit) — done С ПОМЕТКОЙ; pages_total — число известных адресов, unread_sample — до 5 непрочитанных
-- путей (без параметров запроса) для ленты источника. Закрытый набор расширяется, старые значения сохраняются.
ALTER TABLE index_job DROP CONSTRAINT index_job_truncated_known;
ALTER TABLE index_job ADD CONSTRAINT index_job_truncated_known
  CHECK (truncated_by IN ('embed_budget', 'series_embed_budget', 'page_budget', 'crawl_limit'));
-- Примеры непрочитанного: только у усечённой готовой задачи, от 1 до 5 путей.
ALTER TABLE index_job ADD COLUMN unread_sample text[]
  CONSTRAINT index_job_unread_sample_small CHECK (unread_sample IS NULL OR cardinality(unread_sample) BETWEEN 1 AND 5);
ALTER TABLE index_job ADD CONSTRAINT index_job_unread_only_truncated CHECK (unread_sample IS NULL OR truncated_by IS NOT NULL);
