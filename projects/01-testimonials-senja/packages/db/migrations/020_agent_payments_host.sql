-- Additive host identity/ownership state. Portable payment state is migrated by its package.
create table agent_payment_pairings (
 id uuid primary key default gen_random_uuid(), poll_hash text not null unique,
 display_name text not null check(length(display_name) between 1 and 100), audience text not null,
 expires_at timestamptz not null, consumed_at timestamptz, account_id uuid references accounts(id) on delete cascade,
 grant_id uuid, created_at timestamptz not null default now()
);
create table agent_payment_email_tokens (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts(id) on delete cascade,
 email text not null, session_hash text not null, token_hash text not null unique,
 expires_at timestamptz not null, used_at timestamptz, delivery_status text not null default 'pending'
);
create table agent_payment_email_proofs (
 account_id uuid primary key references accounts(id) on delete cascade, email text not null,
 verified_at timestamptz not null default now()
);
create table agent_payment_orders (
 order_id uuid primary key, account_id uuid not null references accounts(id) on delete cascade, project_id uuid not null references projects(id) on delete cascade,
 invoice_id uuid unique references n3_checkout_intents(id) on delete cascade, external_order_id uuid unique,
 provider_id text unique, state text not null default 'prepared' check(state in ('prepared','pending','completed','canceled')),
 created_at timestamptz not null default now()
);
create index agent_payment_orders_project on agent_payment_orders(project_id);
create table agent_payment_human_checkouts (
 project_id uuid primary key references projects(id) on delete cascade, account_id uuid not null references accounts(id) on delete cascade,
 request_key uuid not null unique, provider_id text unique, created_at timestamptz not null default now()
);
create table agent_payment_refund_reviews (
 order_id uuid primary key references agent_payment_orders(order_id) on delete cascade, refunded_minor bigint not null check(refunded_minor>0),
 status text not null default 'manual_review', updated_at timestamptz not null default now()
);
grant select,insert,update,delete on agent_payment_pairings,agent_payment_email_tokens,agent_payment_email_proofs,
 agent_payment_orders,agent_payment_human_checkouts,agent_payment_refund_reviews to app_service;
-- No authenticated or anonymous table privileges: all access is explicit scoped service code.

alter table agent_payment_pairings enable row level security;
alter table agent_payment_email_tokens enable row level security;
alter table agent_payment_email_proofs enable row level security;
alter table agent_payment_orders enable row level security;
alter table agent_payment_human_checkouts enable row level security;
alter table agent_payment_refund_reviews enable row level security;

-- Fair bounded reconciliation without modifying portable engine-owned state.
alter table agent_payment_orders add column if not exists last_reconciled_at timestamptz;
