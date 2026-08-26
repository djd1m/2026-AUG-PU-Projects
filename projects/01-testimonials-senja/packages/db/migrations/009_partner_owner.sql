-- packages/db/migrations/009_partner_owner.sql
--
-- Связь партнёрского кода с аккаунтом его владельца.
--
-- ЗАЧЕМ. Pseudocode §7.2 и сценарий FR-GROWTH-002 @security требуют детекта self-referral:
--   `if partner.email == account.email or partner.account_id == account.id`
-- Но partner_codes (004_growth.sql) не содержит ни email, ни account_id — только code,
-- partner_name, status, commission_rate. То есть описанная проверка НЕ РЕАЛИЗУЕМА на
-- исходной схеме, а сценарий «партнёр оплачивает собственный тариф по собственному коду →
-- комиссия не начислена» невозможно ни выполнить, ни протестировать.
--
-- Это ровно тот класс расхождения Architecture ↔ Pseudocode, который уже разбирался в
-- 003_core.sql (колонка deactivated) и 004_growth.sql (значения status): правило —
-- «код должен быть реализуем» (.claude/rules/p-replicator-known-gaps.md PR-003).
--
-- Колонка NULLABLE: партнёром может быть внешняя площадка без аккаунта в системе
-- (Pseudocode §10 выдаёт коды административно, self-signup партнёров вне MVP-недели).
-- NULL означает «партнёр не является нашим пользователем» — тогда self-referral по
-- определению невозможен, и проверка просто не срабатывает.

alter table partner_codes
  add column if not exists owner_account_id uuid references accounts(id) on delete set null;

comment on column partner_codes.owner_account_id is
  'Аккаунт владельца кода, если партнёр — наш пользователь. NULL для внешних площадок. '
  'Нужен для детекта self-referral (Pseudocode §7.2, FR-GROWTH-002 @security).';

create index if not exists partner_codes_owner_idx on partner_codes (owner_account_id)
  where owner_account_id is not null;
