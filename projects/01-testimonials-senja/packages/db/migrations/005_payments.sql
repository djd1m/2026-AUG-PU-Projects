-- packages/db/migrations/005_payments.sql
--
-- Источник: docs/Architecture.md §3 (таблица), §3.5 (Checkout и обновление тарифа, FR-008);
-- docs/ADR.md ADR-006 (идемпотентность обработки платёжных вебхуков); docs/Pseudocode.md §7.3
-- (initiateCheckout/applyTariffUpgrade), §7.2 (onPaymentWebhook — webhookEventStore).

create table if not exists checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  provider_session_id text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'expired')),
  created_at timestamptz not null default now()
);
-- [GAP: выбор платёжного провайдера не зафиксирован в исходных документах — Architecture §3.5,
--  §9, §11. Контракт `project_id → {provider_session_id, redirect_url}` провайдер-агностичен
--  (ADR-006), схема ниже не привязана к конкретному провайдеру.]

create index if not exists checkout_sessions_project_idx on checkout_sessions (project_id);

create table if not exists webhook_events (
  -- Architecture §3 перечисляет (provider, event_id unique, processed_at); ADR-006 добавляет
  -- payload ("Таблица webhook_events (provider, event_id UNIQUE, payload, processed_at)").
  -- Суррогатный первичный ключ явно не назван документами — uuid по канону остальной схемы.
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  payload jsonb,
  processed_at timestamptz not null default now(),
  -- ADR-006, шаг 1-2: INSERT конфликтует по (provider, event_id) ⇒ событие уже обработано ⇒
  -- HTTP 200 немедленно, БЕЗ повторного выполнения бизнес-логики. Гарантия "ровно один раз" — на
  -- уровне схемы БД (UNIQUE constraint), не на уровне логики приложения (ADR-006 "Последствия").
  unique (provider, event_id)
);
