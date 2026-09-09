-- N3 bridge: durable facts belong exclusively to server code. Do not inherit the
-- broad authenticated grants on accounts or grant service INSERT on checkout_sessions.
create table n3_signup_contexts (
  account_id uuid primary key references accounts(id) on delete cascade,
  tenant_id uuid not null,
  visit_token text check (visit_token ~ '^[A-Za-z0-9_-]{43}$'),
  promo_code text check (length(promo_code) between 1 and 64),
  created_at timestamptz not null default now()
);
create table n3_email_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  email text not null,
  session_hash text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed')),
  created_at timestamptz not null default now()
);
create unique index n3_email_tokens_active on n3_email_tokens(account_id) where used_at is null;
create table n3_email_proofs (
  account_id uuid primary key references accounts(id) on delete cascade,
  id uuid not null unique,
  email text not null,
  verified_at timestamptz not null default now(),
  bound_at timestamptz
);
create table n3_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  request_key uuid not null,
  amount_minor integer not null default 99000 check (amount_minor = 99000),
  currency text not null default 'RUB' check (currency = 'RUB'),
  order_id uuid unique,
  provider_id text unique,
  redirect_url text,
  state text not null default 'reserved' check (state in ('reserved','pending','completed','canceled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(account_id,request_key)
);
create unique index n3_checkout_one_unresolved on n3_checkout_intents(project_id)
  where state in ('reserved','pending');
create table n3_bridge_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  kind text not null check (kind in ('signup','payment.succeeded','refund.succeeded')),
  business_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  delivered_at timestamptz,
  last_error text,
  unique(kind,business_key)
);
create index n3_bridge_outbox_pending on n3_bridge_outbox(next_attempt_at) where delivered_at is null;
create table n3_refund_reviews (
  refund_id text primary key,
  intent_id uuid not null references n3_checkout_intents(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  amount_minor integer not null check (amount_minor > 0),
  status text not null default 'manual_review' check (status in ('manual_review','resolved')),
  created_at timestamptz not null default now()
);
grant select, insert on n3_signup_contexts to app_service;
grant select, insert, update on n3_email_tokens, n3_email_proofs,
  n3_checkout_intents, n3_bridge_outbox, n3_refund_reviews to app_service;
-- RLS is enabled even on server-only project tables. No owner policy or grant:
-- authenticated clients cannot forge proof, intent, provider or delivery facts.
alter table n3_signup_contexts enable row level security;
alter table n3_email_tokens enable row level security;
alter table n3_email_proofs enable row level security;
alter table n3_checkout_intents enable row level security;
alter table n3_bridge_outbox enable row level security;
alter table n3_refund_reviews enable row level security;
