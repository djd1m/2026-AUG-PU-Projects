export interface Db {
  rows<T>(sql: string, args: unknown[]): Promise<T[]>;
  one<T>(sql: string, args: unknown[]): Promise<T | null>;
  exec(sql: string, args: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: '001_init',
    sql: `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_record TEXT NOT NULL,
  email_confirmed_at TIMESTAMPTZ,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  refresh_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS domains (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  spf_status TEXT NOT NULL CHECK (spf_status IN ('ok','warn','fail','unknown')),
  dkim_status TEXT NOT NULL CHECK (dkim_status IN ('ok','warn','fail','unknown')),
  dmarc_status TEXT NOT NULL CHECK (dmarc_status IN ('ok','warn','fail','unknown')),
  dns_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS mailboxes (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  domain_id UUID REFERENCES domains(id),
  address TEXT UNIQUE NOT NULL,
  smtp_host TEXT NOT NULL,
  smtp_port INT NOT NULL CHECK (smtp_port IN (465,587)),
  imap_host TEXT NOT NULL,
  imap_port INT NOT NULL CHECK (imap_port IN (143,993)),
  login TEXT NOT NULL,
  secret_envelope BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','paused','disabled')),
  diag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pool_memberships (
  id UUID PRIMARY KEY,
  mailbox_id UUID NOT NULL UNIQUE REFERENCES mailboxes(id),
  consent_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','left')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS warmup_pairs (
  id UUID PRIMARY KEY,
  sender_mailbox_id UUID NOT NULL REFERENCES mailboxes(id),
  recipient_mailbox_id UUID NOT NULL REFERENCES mailboxes(id),
  slot_date DATE NOT NULL,
  sender_user_id UUID NOT NULL,
  recipient_user_id UUID NOT NULL,
  pairs_per_day INT NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('queued','sent','failed')),
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','launched','paused','completed')),
  daily_limit INT,
  consent_text_version TEXT,
  consent_recorded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_steps (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  offset_days INT NOT NULL,
  template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, step_order)
);
CREATE TABLE IF NOT EXISTS recipients (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  blocked_reason TEXT CHECK (blocked_reason IN ('stop_list','role_filter','duplicate','invalid')),
  replied_at TIMESTAMPTZ,
  complained BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, address)
);
CREATE TABLE IF NOT EXISTS send_log (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id),
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id),
  recipient_id UUID REFERENCES recipients(id),
  idempotency_key TEXT UNIQUE NOT NULL,
  slot_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','bounced','failed')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS stoplist_entries (
  id UUID PRIMARY KEY,
  address TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('rfc8058','link_unsub','reply_stop','role_filter','manual')),
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stoplist_addr_idx ON stoplist_entries (address);
CREATE INDEX IF NOT EXISTS sendlog_camp_idx ON send_log (campaign_id, slot_at);
CREATE TABLE IF NOT EXISTS inbound_events (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id),
  mailbox_id UUID REFERENCES mailboxes(id),
  sender_address TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('reply','unsub','complaint','bounce')),
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY,
  domain_id UUID NOT NULL REFERENCES domains(id),
  day DATE NOT NULL,
  score INT NOT NULL,
  delivered_pct NUMERIC NOT NULL,
  spam_rate NUMERIC NOT NULL,
  pool_members INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (domain_id, day)
);
CREATE TABLE IF NOT EXISTS partner_codes (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id),
  code TEXT UNIQUE NOT NULL,
  commission_pct INT NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attributions (
  id UUID PRIMARY KEY,
  new_user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  partner_code_id UUID REFERENCES partner_codes(id),
  captured_via TEXT NOT NULL CHECK (captured_via IN ('cookie','param','manual')),
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commission_events (
  id UUID PRIMARY KEY,
  partner_code_id UUID NOT NULL REFERENCES partner_codes(id),
  payment_external_id TEXT UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  plan TEXT NOT NULL CHECK (plan IN ('free','base','pro')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled')),
  current_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,
  external_id TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  consent_version TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_no_rewrite ON audit_log (id);
`,
  },
];
