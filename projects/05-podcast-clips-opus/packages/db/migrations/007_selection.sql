-- Generated from shared/fragments-schema.json by scripts/generate-selection-migration.mjs.
-- Preserve exact word timestamps; numeric(10,1) would round them into words.
ALTER TABLE clip ALTER COLUMN start_seconds TYPE numeric, ALTER COLUMN end_seconds TYPE numeric;
ALTER TABLE clip ADD CONSTRAINT clip_selection_contract CHECK (
  end_seconds - start_seconds BETWEEN 20 AND 75
  AND (score IS NULL OR (start_seconds IS NOT NULL AND start_seconds >= 0
    AND end_seconds IS NOT NULL AND end_seconds >= 0
    AND title IS NOT NULL AND btrim(title) <> ''
    AND score IS NOT NULL AND score >= 0 AND score <= 99
    AND score_hook IS NOT NULL AND score_hook >= 0 AND score_hook <= 33
    AND score_completeness IS NOT NULL AND score_completeness >= 0 AND score_completeness <= 33
    AND score_length IS NOT NULL AND score_length >= 0 AND score_length <= 33
    AND explain_hook IS NOT NULL AND btrim(explain_hook) <> '' AND explain_hook ~ '[А-Яа-яЁё]'
    AND explain_completeness IS NOT NULL AND btrim(explain_completeness) <> '' AND explain_completeness ~ '[А-Яа-яЁё]'
    AND explain_length IS NOT NULL AND btrim(explain_length) <> '' AND explain_length ~ '[А-Яа-яЁё]'
    AND score = score_hook + score_completeness + score_length))
);
-- Durable one-shot dispatch; unit_count=1 may already be paid by video.retry.
ALTER TABLE job_attempt ADD COLUMN llm_dispatched boolean NOT NULL DEFAULT false;
