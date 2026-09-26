-- budget-truncation (исправление дефекта стенда 26.09, A-N6-052): только добавляющая миграция.
--
-- Задача, у которой кончился СОБСТВЕННЫЙ бюджет эмбеддингов (бюджет предпросмотра index_job.embed_budget или бюджет
-- серии источника index_job.series_embed_budget), завершается done с прочитанным, а не failed целиком. Пометка —
-- чем усечена; NULL — задача не усекалась бюджетом. Закрытый набор: неизвестное значение не запишется.
-- Внешние потолки расхода (account_embed_tokens, global_embed_tokens) по-прежнему дают failed(quota_refused).
ALTER TABLE index_job ADD COLUMN truncated_by text
  CONSTRAINT index_job_truncated_known CHECK (truncated_by IN ('embed_budget', 'series_embed_budget'));
-- Пометка бывает только у готовой задачи: у выполняющейся и отказавшей её нет.
ALTER TABLE index_job ADD CONSTRAINT index_job_truncated_only_done CHECK (truncated_by IS NULL OR status = 'done');
