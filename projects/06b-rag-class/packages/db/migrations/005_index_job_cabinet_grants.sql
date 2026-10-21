-- 005_index_job_cabinet_grants.sql — роль кабинета на index_job: минимум (index-jobs 08_review.md F-7).
--
-- 1. Кабинет не пишет служебные колонки. Состояние, аренду (leased_until, lease_fence), попытки, прогресс, исход и время
--    запуска пишет служебный путь (воркер: Pseudocode «Worker lease loop» шаги 1–8). Кабинету остаются: вставка задачи
--    только колонками (source_id, account_id) — всё прочее берёт DEFAULT ('queued', 0, NULL) — и «Повторить» (шаг 9)
--    одной функцией n6b_retry_job, которая умеет ровно переход failed → queued своей задачи. UPDATE index_job у кабинета
--    отозван целиком: внедрённый SQL не выставит state='succeeded', lease_fence или progress_* даже своей задаче.
--
-- 2. Вставка задачи на чужой источник не различает «у источника есть живая задача» и «источника нет». Раньше уникальный
--    индекс живой задачи проверялся ДО составного FK (FK — отложенный AFTER-триггер), и чужой источник с живой задачей
--    давал 23505, а без неё — 23503 (оракул существования, проба P4 валидатора). BEFORE INSERT срабатывает раньше и
--    уникального индекса, и ON CONFLICT: источник, невидимый вставляющему (RLS кабинета) или с другим account_id, —
--    всегда 23503 index_job_source_fk. Функция — SECURITY INVOKER: кабинет видит только свои источники, служебная роль —
--    все, и проверяет то же равенство account_id, что и составной FK.

REVOKE INSERT, UPDATE ON index_job FROM n6b_tenant;
GRANT INSERT (source_id, account_id) ON index_job TO n6b_tenant;

CREATE FUNCTION n6b_index_job_source_check() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM source s WHERE s.id = NEW.source_id AND s.account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'insert or update on table "index_job" violates foreign key constraint "index_job_source_fk"'
      USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'index_job_source_fk', TABLE = 'index_job';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER index_job_source_check BEFORE INSERT ON index_job
  FOR EACH ROW EXECUTE FUNCTION n6b_index_job_source_check();

-- «Повторить» (шаг 9): тот же job_id, attempts = 0, run_started_at = NULL, прогресс сохраняется. Видимость — тот же
-- список аккаунтов, что у RLS кабинета (n6b_account_ids): чужая и несуществующая задача неразличимы ('not-found').
-- FOR UPDATE: N одновременных «Повторить» — один 'retried', остальные после блокировки видят queued → 'not-failed'.
-- У источника уже есть другая живая задача → 'source-busy' (уникальный индекс живой задачи).
CREATE FUNCTION n6b_retry_job(p_job uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_state text;
BEGIN
  SELECT j.state INTO v_state FROM index_job j WHERE j.id = p_job AND j.account_id = ANY (n6b_account_ids()) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not-found';
  END IF;
  IF v_state <> 'failed' THEN
    RETURN 'not-failed';
  END IF;
  BEGIN
    UPDATE index_job SET state = 'queued', attempts = 0, error = NULL, note = NULL, run_started_at = NULL,
      leased_until = NULL, finished_at = NULL
    WHERE id = p_job AND state = 'failed';
  EXCEPTION WHEN unique_violation THEN
    RETURN 'source-busy';
  END;
  RETURN 'retried';
END $$;
REVOKE ALL ON FUNCTION n6b_retry_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n6b_retry_job(uuid) TO n6b_tenant;
