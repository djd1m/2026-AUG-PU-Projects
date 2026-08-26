-- packages/db/migrations/002_roles.sql
--
-- Источник: docs/Architecture.md §3.1 ("Два независимых места" изоляции арендаторов) и
-- .claude/rules/security.md §2.
--
-- app_authenticated — обычная роль. Работает ПОД RLS-политиками (007_rls.sql), применяется
--   дашборд/модерация после `SET LOCAL app.current_account_id` (packages/db/src/tenant.ts).
--
-- app_service — роль с BYPASSRLS. Используется анонимными путями (форма, виджет, Wall of Love)
--   и системными операциями без контекста аккаунта (вебхуки, воркер транскрипции) — там нет
--   account_id для SET LOCAL. ВНИМАНИЕ, что из этого следует (буквально Architecture §3.1 п.2 и
--   security.md §2): BYPASSRLS означает, что Postgres НЕ применяет НИ ОДНУ RLS-политику ни на
--   одной таблице для этой роли — изоляция арендаторов на анонимных путях держится
--   ИСКЛЮЧИТЕЛЬНО на явном `WHERE project_id = :resolved_from_slug` в коде обработчика.
--   packages/db не может это гарантировать на уровне схемы; если фильтр в коде забыт — RLS его
--   НЕ подстрахует. `app_service` — аналог Supabase service-role, но объявлена здесь, в
--   собственных миграциях (не во внешнем BaaS, см. Architecture §9).
--
-- Приложение подключается ОДНИМ пользователем (POSTGRES_USER из .env.example — единственный
-- DATABASE_URL в docker-compose.yml) и переключает роль ВНУТРИ транзакции через
-- `SET LOCAL ROLE ...` (packages/db/src/tenant.ts), а не отдельными учётными данными — поэтому
-- обе роли NOLOGIN, и подключающийся пользователь должен быть их членом (GRANT ниже).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_authenticated') then
    create role app_authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service nologin bypassrls;
  end if;
end
$$;

-- current_user на этапе прогона миграций — тот же пользователь, под которым apps/web и
-- services/worker открывают DATABASE_URL (см. packages/db/README.md) — поэтому GRANT ... TO
-- current_user идемпотентно даёт этому пользователю право SET ROLE на обе роли ниже.
grant app_authenticated to current_user;
grant app_service to current_user;
