ALTER TABLE video ADD COLUMN compact boolean NOT NULL DEFAULT false;
ALTER TABLE video ADD COLUMN loudness_median_db numeric(6,2);
ALTER TABLE clip ADD COLUMN cut_plan jsonb;
ALTER TABLE clip ADD COLUMN duration_seconds numeric(6,2);
