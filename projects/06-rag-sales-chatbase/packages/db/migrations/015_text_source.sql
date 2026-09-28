-- text-source (фича 18, решение владельца 28.09, A-N6-080): третий вид источника — текстовый файл по адресу (llms.txt,
-- llms-full.txt, .txt, .md). Только РАСШИРЯЮЩАЯ миграция: прежнее приложение работает на новой схеме (источников text не
-- создаёт, новых колонок не читает).
--
-- 1. Закрытые наборы ДОПИСЫВАЮТСЯ к ТЕКУЩЕМУ ARRAY[…] ограничения (форма 011/013): параллельные фичи тоже дописывают свои
--    значения, и перечисление набора целиком стёрло бы чужое. Ограничение без ARRAY[…] или без имени — отказ миграции.
--    source.kind += text · index_job.failure_reason += not_text (ответ по адресу — не текст: HTML, двоичный, не та
--    кодировка) · index_start.kind += text (запуск индексации файла считается в суточный предел бота, как сайт и PDF).
DO $$
DECLARE
  target record;
  def text;
BEGIN
  FOR target IN SELECT * FROM (VALUES
      ('source', 'source_kind_check', 'text'),
      ('index_job', 'index_job_failure_reason_check', 'not_text'),
      ('index_start', 'index_start_kind_check', 'text')) AS t(tbl, con, val)
  LOOP
    SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
     WHERE c.conrelid = target.tbl::regclass AND c.conname = target.con;
    IF def IS NULL OR position('ARRAY[' in def) = 0 THEN
      RAISE EXCEPTION '% не найден или неожиданной формы (%): миграция 015 не применена', target.con, def;
    END IF;
    CONTINUE WHEN position('''' || target.val || '''' in def) > 0;
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', target.tbl, target.con);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I ', target.tbl, target.con)
      || replace(def, 'ARRAY[', 'ARRAY[''' || target.val || '''::text, ');
  END LOOP;
END $$;

-- 2. Связка «вид → чем задан источник». В 001 это одно ограничение-перечисление (site → root_url, pdf → file_name), и
--    kind = 'text' оно отвергает. Заменяется ИМПЛИКАЦИЯМИ по одной на вид: они не перечисляют набор видов (его держит
--    source_kind_check), и следующий вид добавит свою строку, не трогая эти. Адрес файла — root_url (у сайта — корень):
--    экраны и удаление читают одну колонку. Снимается только ограничение ровно прежнего смысла, иначе — отказ.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c WHERE c.conrelid = 'source'::regclass AND c.conname = 'source_check';
  IF def IS NOT NULL THEN
    IF position('''site''' in def) = 0 OR position('''pdf''' in def) = 0 OR position('root_url' in def) = 0 OR position('file_name' in def) = 0 THEN
      RAISE EXCEPTION 'source_check неожиданного смысла (%): миграция 015 не применена', def;
    END IF;
    ALTER TABLE source DROP CONSTRAINT source_check;
  END IF;
END $$;
ALTER TABLE source ADD CONSTRAINT source_site_has_url CHECK (kind <> 'site' OR root_url IS NOT NULL);
ALTER TABLE source ADD CONSTRAINT source_pdf_has_file CHECK (kind <> 'pdf' OR file_name IS NOT NULL);
ALTER TABLE source ADD CONSTRAINT source_text_has_url CHECK (kind <> 'text' OR root_url IS NOT NULL);

-- 3. Последний прочитанный файл: размер в байтах (≤ 2 МиБ — предел загрузки, TEXT_MAX_BYTES) и sha256 содержимого — для
--    ленты и для «Обновить»: неизменные разделы (адрес#якорь + content_hash страницы) не эмбеддятся заново. Только у text.
ALTER TABLE source ADD COLUMN content_bytes int CONSTRAINT source_content_bytes_range CHECK (content_bytes BETWEEN 0 AND 2097152);
ALTER TABLE source ADD COLUMN content_sha256 text CONSTRAINT source_content_sha256_hex CHECK (content_sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE source ADD CONSTRAINT source_content_only_text CHECK ((content_bytes IS NULL AND content_sha256 IS NULL) OR kind = 'text');
