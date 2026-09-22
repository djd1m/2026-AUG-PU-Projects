-- Сохраняем одинаковый ответ идемпотентного запроса и день исходного списания.
ALTER TABLE video ADD COLUMN upload_parts jsonb,
  ADD COLUMN upload_part_size int CHECK (upload_part_size > 0),
  ADD COLUMN upload_day date,
  ADD COLUMN upload_enqueued_at timestamptz;
ALTER TABLE video ADD CONSTRAINT video_upload_parts_array
  CHECK (upload_parts IS NULL OR jsonb_typeof(upload_parts) = 'array');
