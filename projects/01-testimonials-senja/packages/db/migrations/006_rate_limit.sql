-- packages/db/migrations/006_rate_limit.sql
--
-- Источник: docs/Architecture.md §3.4 (SQL приведён в документе почти дословно) и §3 (таблица);
-- .claude/rules/security.md §4 (единый механизм на три требования — form_submission,
-- signup_via_partner_code, project_created — не заводить отдельный стор под новый scope того же
-- класса задачи).
--
-- Намеренно БЕЗ внешних ключей: `key` — разный формат под каждый scope (IP, account_id,
-- hash(IP+project_id)) — единый FK создал бы ложную связность (Architecture §3.4, дословно).
-- Решение "Postgres, не Redis" при масштабе "одна неделя, один VPS" — см. Architecture §3.4.

create table if not exists rate_limit_events (
  id bigserial primary key,
  scope text not null,
  key text not null,
  created_at timestamptz not null default now()
);

-- Индекс (scope, key, created_at desc) — ровно как в Architecture §3.4: COUNT за окно на
-- объёмах в тысячи строк недельного MVP выполняется за доли миллисекунды.
create index if not exists rate_limit_events_scope_key_created_idx
  on rate_limit_events (scope, key, created_at desc);
