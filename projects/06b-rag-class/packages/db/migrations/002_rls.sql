-- 002_rls.sql — роли, гранты и RLS по account_id (NFR-n6b-3). Перенос N1 #9 (002_roles + 007_rls), адаптирован:
--   * n6b_app     — LOGIN (пароль ставит migrate.ts из N6B_DB_APP_PASSWORD), NOINHERIT: сама по себе прав на таблицы НЕ
--                   имеет. Любой запрос без SET LOCAL ROLE → permission denied (fail-closed, а не «всё видно»).
--   * n6b_tenant  — кабинет: RLS-политики фильтруют строки по n6b_account_ids().
--   * n6b_service — BYPASSRLS: вход/регистрация, квоты, публичные ручки, воркер. Изоляция на этих путях — явным WHERE
--                   в коде, RLS её НЕ подстрахует (урок N1: так и записано, чтобы никто не думал иначе).
-- Контекст: set_config('app.account_id', $1, true) — только в транзакции (SET LOCAL). Список видимых аккаунтов (свой +
-- подаккаунты студии с studio_access=true) вычисляет БД, а не приложение.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n6b_app') THEN
    CREATE ROLE n6b_app NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n6b_tenant') THEN
    CREATE ROLE n6b_tenant NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'n6b_service') THEN
    CREATE ROLE n6b_service NOLOGIN BYPASSRLS;
  END IF;
END $$;

ALTER ROLE n6b_app NOINHERIT NOBYPASSRLS;
GRANT n6b_tenant TO n6b_app;
GRANT n6b_service TO n6b_app;

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO n6b_tenant, n6b_service;

-- Видимые аккаунты текущего контекста. Нет контекста или пустая строка → пустой массив (ничего не видно).
-- Непригодный uuid → ошибка приведения, транзакция откатывается (не «пропустить»).
CREATE FUNCTION n6b_account_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH cur AS (SELECT nullif(current_setting('app.account_id', true), '')::uuid AS id)
  SELECT CASE WHEN (SELECT id FROM cur) IS NULL THEN '{}'::uuid[]
    ELSE ARRAY(SELECT (SELECT id FROM cur)
               UNION SELECT a.id FROM account a WHERE a.parent_account_id = (SELECT id FROM cur) AND a.studio_access)
  END
$$;
REVOKE ALL ON FUNCTION n6b_account_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n6b_account_ids() TO n6b_tenant;

-- ── Гранты кабинета (n6b_tenant) — только то, что кабинет читает и пишет ──
GRANT SELECT ON account TO n6b_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON bot, source, source_file, document, chunk, index_job TO n6b_tenant;
GRANT SELECT, INSERT ON question_log, growth_event, handover_token TO n6b_tenant;
-- session, quota_counter, model_call_log, widget_install, badge_event, operator — кабинету не выдаются.

-- ── Гранты сервисной роли ──
GRANT SELECT, INSERT, UPDATE, DELETE ON
  account, session, bot, source, source_file, document, chunk, index_job, question_log, model_call_log,
  quota_counter, widget_install, badge_event, growth_event, handover_token TO n6b_service;
GRANT SELECT ON operator TO n6b_service; -- запись оператора — только миграцией или CLI

-- ── RLS: включена и FORCE на каждой таблице; политики — только на таблицах кабинета ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account', 'session', 'bot', 'source', 'source_file', 'document', 'chunk', 'index_job',
                           'question_log', 'model_call_log', 'quota_counter', 'widget_install', 'badge_event',
                           'growth_event', 'handover_token', 'operator'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['bot', 'source', 'source_file', 'document', 'chunk', 'index_job',
                           'question_log', 'growth_event', 'handover_token'] LOOP
    EXECUTE format('CREATE POLICY tenant_isolation ON %I FOR ALL TO n6b_tenant '
                   'USING (account_id = ANY (n6b_account_ids())) WITH CHECK (account_id = ANY (n6b_account_ids()))', t);
  END LOOP;
END $$;

CREATE POLICY tenant_isolation ON account FOR SELECT TO n6b_tenant USING (id = ANY (n6b_account_ids()));
