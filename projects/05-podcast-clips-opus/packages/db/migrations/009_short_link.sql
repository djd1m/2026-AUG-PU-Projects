-- Отзыв короткой ссылки независим от срока хранения файла.
ALTER TABLE clip_link ADD COLUMN revoked_at timestamptz;
