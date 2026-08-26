-- packages/db/migrations/008_audit.sql
--
-- Источник: docs/Architecture.md §3 (таблица) — используется во всех Pseudocode-функциях
-- модерации/анти-фрода/платежей (writeAuditLog): §2 moderation_denied_cross_project/
-- state_transition, §6 noindex_removed/noindex_applied/forced_noindex_bulk_creation,
-- §7.2 self_referral_blocked, §8 suspected_fraud_flagged, §9 account_and_project_created,
-- §10 partner_code_issued.
--
-- Таблица создаётся здесь, а не в 007_rls.sql, из-за фиксированного порядка номеров миграций
-- задания (007=rls, 008=audit) — RLS для audit_log живёт в этом же файле, а не в 007, потому что
-- на момент выполнения 007 таблицы audit_log ещё не существует.

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,  -- nullable: часть событий не
                                                                  -- привязана к проекту
                                                                  -- (self_referral_blocked,
                                                                  -- webhook_signature_invalid
                                                                  -- пишутся по account_id/ip)
  entity_type text not null,   -- 'testimonial' | 'project' | 'referral_attribution' |
                                -- 'partner_code' | ... — открытый список (не enum), новый тип
                                -- события не требует миграции схемы
  entity_id uuid not null,
  -- actor_id: account.id (uuid, дашборд-путь), либо литерал 'public' (анонимные пути —
  -- Pseudocode §1: `writeAuditLog(action=..., actor="public")`), либо admin_actor.id (§10) —
  -- смешанные по природе значения, поэтому text, а не uuid FK на одну конкретную таблицу.
  actor_id text,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_project_id_idx on audit_log (project_id);
create index if not exists audit_log_entity_idx on audit_log (entity_type, entity_id);

-- === Grants + RLS (см. рационале распределения ролей в 007_rls.sql) ===
-- audit_log — immutable log: insert из обоих путей (модерация — app_authenticated;
-- анонимные/системные события — app_service), НИКОМУ не выдаётся update/delete.
grant select, insert on audit_log to app_authenticated, app_service;

alter table audit_log enable row level security;

drop policy if exists tenant_isolation_audit_log on audit_log;
create policy tenant_isolation_audit_log on audit_log
  for select
  using (project_id in (
    select id from projects
    where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
  ));

-- INSERT под app_authenticated (moderateTestimonial и т.п.) обязан писать project_id,
-- принадлежащий тому же аккаунту — иначе владелец A мог бы записать audit-событие в чужой
-- project_id (пусть и не прочитав его потом). project_id IS NULL разрешён (события уровня
-- аккаунта без привязки к проекту).
create policy tenant_isolation_audit_log_insert on audit_log
  for insert
  with check (
    project_id is null
    or project_id in (
      select id from projects
      where account_id = nullif(current_setting('app.current_account_id', true), '')::uuid
    )
  );
