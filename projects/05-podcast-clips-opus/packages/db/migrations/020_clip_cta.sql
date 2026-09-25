-- ADR-017 / FR-RESULT-006: призыв к действию в конце клипа (часть 27a — хранение и показ на /c/).
-- source_url НЕ переиспользуется: он принадлежит FR-INGEST-003 (загрузка по ссылке).
ALTER TABLE video ADD COLUMN cta_kind text NOT NULL DEFAULT 'none' CHECK (cta_kind IN ('none','watch_full','subscribe','open_link'));
ALTER TABLE video ADD COLUMN cta_url text CHECK (cta_url IS NULL OR (char_length(cta_url) BETWEEN 9 AND 2048 AND cta_url LIKE 'https://%'));
ALTER TABLE video ADD CONSTRAINT video_cta_pair_check CHECK ((cta_kind = 'none') = (cta_url IS NULL));
