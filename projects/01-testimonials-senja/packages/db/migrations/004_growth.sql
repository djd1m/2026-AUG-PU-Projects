-- packages/db/migrations/004_growth.sql
--
-- Источник: docs/Architecture.md §3 (таблица), §3.3 (widget_installs — атомарная вставка,
-- UNIQUE(project_id, domain) — ЯДРО метрики недели), §6 (analytics_events); docs/Pseudocode.md
-- §4 (recordInstallAndInviteIfNeeded), §6 (anti-abuse проектов), §7 (партнёрская атрибуция),
-- §10 (issuePartnerCode); docs/ADR.md ADR-006 (идемпотентность комиссии).

create table if not exists widget_installs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  domain text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- ЯДРО метрики недели (widget_installed) и share-CTA (invite_shown), PRD §2.4.1 / Architecture
  -- §3.3: "считаем сайты, не людей". НЕ менять/ослаблять этот constraint — вся дедупликация и
  -- защита от гонки параллельных первых рендеров держится на нём (ON CONFLICT ... DO NOTHING
  -- RETURNING id, см. packages/db тесты tests/widget-installs.test.ts).
  unique (project_id, domain)
);

create table if not exists analytics_events (
  -- append-only, самый высокий темп записи в системе — bigserial по тому же принципу, что и
  -- rate_limit_events (Architecture §3.4). Точный тип id не зафиксирован в Architecture §3
  -- буквально; выбран по аналогии с единственной другой append-only лог-таблицей документа.
  id bigserial primary key,
  project_id uuid references projects(id) on delete set null,  -- nullable (Architecture §3);
                                                                  -- SET NULL — событие переживает
                                                                  -- удаление проекта (операция
                                                                  -- удаления проекта нигде не
                                                                  -- описана, но append-only
                                                                  -- журнал не должен терять
                                                                  -- историю, если она появится)
  account_id uuid references accounts(id) on delete set null,   -- nullable (Architecture §3)
  event_type text not null,   -- widget_installed | invite_shown | invite_sent | badge_impression |
                               -- badge_click | signup_from_badge | referral_attributed (Architecture §6)
  domain text,
  metadata jsonb not null default '{}'::jsonb,   -- контекст (domain, UTM, partner_code) без
                                                  -- изменения схемы под каждое новое поле (Architecture §6)
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_project_type_idx
  on analytics_events (project_id, event_type, created_at);

create table if not exists partner_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  partner_name text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  -- [GAP: ставка комиссии по умолчанию не зафиксирована в исходных документах — CLAUDE.md
  --  "Открытые вопросы владельца продукта" / PRD §8: "ставка комиссии партнёра по умолчанию
  --  (блокирует только конкретную реализацию FR-GROWTH-002)". Колонка nullable —
  --  calculateCommission (Pseudocode §7.2) не может быть реализована без значения; схема готова
  --  принять любую ставку, когда она появится.]
  commission_rate numeric(5, 4),
  created_at timestamptz not null default now()
);

create table if not exists referral_attributions (
  id uuid primary key default gen_random_uuid(),
  -- Architecture §3: "account_id nullable до сайнапа". В описанном Pseudocode §7.2
  -- createAttributionRecord вызывается ПОСЛЕ создания аккаунта (account_id уже известен) —
  -- nullable оставлен по канону документа, не потому что реализованный код когда-либо пишет
  -- сюда null явно.
  account_id uuid references accounts(id) on delete cascade,
  partner_code_id uuid not null references partner_codes(id),
  source text not null check (source in ('cookie', 'promo_code')),
  -- Architecture §3 перечисляет только 3 значения status (pending, converted, blocked).
  -- Pseudocode §7.2 (getPendingAttribution: истёкшее окно атрибуции → status='expired') и §7.2
  -- (self-referral → status='rejected') используют два дополнительных значения, без которых
  -- описанные функции не реализуемы. Список объединён по правилу "код должен быть реализуем"
  -- (см. .claude/rules/p-replicator-known-gaps.md PR-003 — сверка Architecture/Pseudocode).
  status text not null default 'pending'
    check (status in ('pending', 'converted', 'blocked', 'expired', 'rejected')),
  reason text,   -- 'self_referral' и т.п. (Pseudocode §7.2: updateAttribution({reason: ...}))
  created_at timestamptz not null default now()
);

create index if not exists referral_attributions_account_idx on referral_attributions (account_id);
create index if not exists referral_attributions_partner_code_idx on referral_attributions (partner_code_id);
-- getPendingAttribution (Pseudocode §7.2) ищет по (account_id, status='pending'), окно атрибуции 30 дней
create index if not exists referral_attributions_pending_idx on referral_attributions (account_id, status)
  where status = 'pending';

create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  referral_attribution_id uuid not null references referral_attributions(id),
  -- ADR-006: вторая, независимая от webhook_events гарантия "ровно один раз" — UNIQUE constraint
  -- на уровне схемы БД, не проверка SELECT перед INSERT (race condition, см. ADR-006 "Альтернативы").
  payment_event_id text not null unique,
  -- [GAP: валюта и точность суммы комиссии не зафиксированы в исходных документах]
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists commissions_referral_attribution_idx on commissions (referral_attribution_id);
