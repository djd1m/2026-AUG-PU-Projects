-- packages/db/migrations/007_rls.sql
--
-- Источник: docs/Architecture.md §3.1 ("Два независимых места" изоляции; политика на testimonials
-- дана в документе почти дословно и воспроизведена ниже для каждой таблицы с project_id).
-- .claude/rules/security.md §2.
--
-- Контекст арендатора выставляется через `set_config('app.current_account_id', $1, true)` в
-- packages/db/src/tenant.ts (withAccount) — `SELECT set_config(...)` поддерживает обычный
-- параметризованный запрос; `SET LOCAL app.x = $1` Postgres НЕ поддерживает bind-параметры для
-- имени/значения GUC напрямую, поэтому используется функция, а не команда SET.
--
-- RLS включается на КАЖДОЙ таблице с project_id (правило Architecture §3.1, буквально) — плюс на
-- самой `projects`, которая является корнем арендатора: она физически не имеет колонки
-- project_id (это её собственный `id`), но без политики здесь дашборд-путь был бы не изолирован
-- НА ПЕРВОМ ЖЕ уровне — тот же принцип defense in depth, применённый на account_id вместо
-- project_id. audit_log получает RLS в 008_audit.sql (создаётся там же — таблица ещё не
-- существует на этом шаге; см. комментарий в 008 про порядок номеров миграций).
--
-- Ниже — инженерное распределение table-grants по ролям, ВЫВЕДЕННОЕ из того, какая функция
-- Pseudocode.md какую таблицу трогает и под каким актёром (не отдельный факт документов —
-- Architecture/Pseudocode не перечисляют grants по ролям явно). app_service — единственная
-- граница анонимных путей (форма, виджет, Wall of Love, вебхуки, воркер) и системных операций
-- без контекста аккаунта; щедрые grants ей не ослабляют изоляцию арендаторов саму по себе — она
-- и так BYPASSRLS "сервисная" роль (аналог Supabase service-role, Architecture §3.1), строки
-- фильтрует явный WHERE project_id в коде (security.md §2). app_authenticated получает доступ
-- ТОЛЬКО к тем таблицам, которые дашборд-путь реально читает/пишет по Pseudocode — принцип
-- наименьших привилегий, никаких grants "на всякий случай".

grant usage on schema public to app_authenticated, app_service;

-- accounts/sessions: без project_id, вне правила Architecture §3.1 — RLS не применяется. Обе
-- роли нужны: регистрация/логин (Pseudocode §9) идут БЕЗ контекста аккаунта (app_service),
-- валидация активной сессии на дашборд-пути тоже случается ДО того, как контекст установлен в
-- этой же транзакции (app_authenticated). Delete не выдаётся никому — логаут = revoked_at (§3.2),
-- удаление аккаунта нигде не описано.
grant select, insert, update on accounts, sessions to app_authenticated, app_service;

-- projects: app_service создаёт (регистрация, §9) и меняет tier/noindex (webhook/anti-abuse,
-- §6, §7.3 — без сессии владельца). app_authenticated читает/меняет своё (branding, явный tier
-- в дашборде) — без insert: создание проекта в описанном Pseudocode всегда часть регистрации.
grant select, update on projects to app_authenticated;
grant select, insert, update on projects to app_service;

-- testimonials: app_service вставляет (submitTestimonial, анонимно) и обновляет
-- (handleVideoTestimonial/transcribeVideoJob — воркер работает без контекста аккаунта).
-- app_authenticated меняет статус (moderateTestimonial, §2) и читает свои, включая неодобренные.
grant select, update on testimonials to app_authenticated;
grant select, insert, update on testimonials to app_service;

-- widget_installs: вставка/обновление — только на анонимном пути виджета (§4, app_service).
-- app_authenticated может читать список установленных доменов своего проекта (дашборд).
grant select on widget_installs to app_authenticated;
grant select, insert, update on widget_installs to app_service;

-- analytics_events: append-only (Architecture §6, "без апдейтов") — insert только app_service
-- (единственный писатель — серверные обработчики анонимных/системных путей, §6: "пишется только
-- серверным кодом"). app_authenticated читает свою аналитику в дашборде.
grant select on analytics_events to app_authenticated;
grant select, insert on analytics_events to app_service;

-- checkout_sessions: initiateCheckout (§3.5) — app_authenticated, владелец инициирует апгрейд.
-- applyTariffUpgrade идёт из вебхука (§7.3) без сессии владельца — app_service обновляет статус.
grant select, insert on checkout_sessions to app_authenticated;
grant select, update on checkout_sessions to app_service;

-- partner_codes/referral_attributions/commissions/webhook_events: администрирование партнёров
-- (issuePartnerCode/revokePartnerCode, §10) и обработка атрибуции/вебхука (§7, §8) — везде без
-- сессии владельца проекта в описанном Pseudocode; отдельная admin-роль в документах не введена
-- (Architecture §3.1 называет только app_authenticated/app_service) — используем app_service.
grant select, insert, update on partner_codes to app_service;
grant select, insert, update on referral_attributions to app_service;
grant select, insert on commissions to app_service;
grant select, insert on webhook_events to app_service;

-- rate_limit_events: нужна обеим ролям — form_submission/signup_via_partner_code (анонимные,
-- app_service) и project_created (Pseudocode §6: onProjectCreated может идти и из дашборда, если
-- владелец создаёт второй проект под своей сессией — app_authenticated). delete — под
-- rateLimitRevoke (§1, W-5) и почасовую очистку worker'ом (Architecture §3.4).
grant select, insert, delete on rate_limit_events to app_authenticated, app_service;

grant usage, select on all sequences in schema public to app_authenticated, app_service;

-- === Row Level Security ===

alter table projects enable row level security;
alter table testimonials enable row level security;
alter table widget_installs enable row level security;
alter table analytics_events enable row level security;
alter table checkout_sessions enable row level security;

-- projects — корень арендатора: ключ account_id напрямую, не project_id (Architecture §3.1,
-- применено на один уровень выше исходного примера документа).
drop policy if exists tenant_isolation_projects on projects;
create policy tenant_isolation_projects on projects
  for all
  using (account_id = nullif(current_setting('app.current_account_id', true), '')::uuid)
  with check (account_id = nullif(current_setting('app.current_account_id', true), '')::uuid);

-- testimonials — буквально пример из Architecture §3.1:
--   create policy "tenant_isolation_select" on testimonials
--     for select using (project_id in (select id from projects where account_id = ...))
-- обобщено на `for all` (select/update — единственные операции, выданные app_authenticated
-- выше; insert/delete для этой роли и так запрещены на уровне GRANT).
drop policy if exists tenant_isolation_testimonials on testimonials;
create policy tenant_isolation_testimonials on testimonials
  for all
  using (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ))
  with check (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ));

drop policy if exists tenant_isolation_widget_installs on widget_installs;
create policy tenant_isolation_widget_installs on widget_installs
  for all
  using (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ))
  with check (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ));

drop policy if exists tenant_isolation_checkout_sessions on checkout_sessions;
create policy tenant_isolation_checkout_sessions on checkout_sessions
  for all
  using (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ))
  with check (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ));

-- analytics_events.project_id nullable (Architecture §3) — строки без project_id (события
-- уровня аккаунта, напр. signup_from_badge до создания проекта) не видны ни одному арендатору
-- через эту политику; ожидаемо для append-only журнала, не регресс.
drop policy if exists tenant_isolation_analytics_events on analytics_events;
create policy tenant_isolation_analytics_events on analytics_events
  for select
  using (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ));
