import { paymentMigration } from '../payments/schema.mjs';
import { identityMigration } from '../identity/schema.mjs';
import { referralMigration } from '../referrals/schema.mjs';
export const migration = `
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY, state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY CHECK (length(token_hash) = 64), tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_ids jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS command_results (
  tenant_id uuid NOT NULL REFERENCES tenants(id), actor_id uuid NOT NULL, action text NOT NULL,
  command_key text NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY (tenant_id, actor_id, action, command_key)
);
CREATE TABLE IF NOT EXISTS immutable_facts (
  tenant_id uuid NOT NULL REFERENCES tenants(id), kind text NOT NULL, business_key text NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, kind, business_key)
);
CREATE TABLE IF NOT EXISTS allocations (
  tenant_id uuid NOT NULL REFERENCES tenants(id), obligation_id uuid NOT NULL,
  artifact_id uuid NOT NULL, revision integer NOT NULL CHECK (revision > 0),
  partner_id uuid NOT NULL, transfer_id uuid,
  PRIMARY KEY (tenant_id, obligation_id)
);
CREATE OR REPLACE FUNCTION immutable_fact_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'Immutable fact cannot be changed'; END; $fn$;
DROP TRIGGER IF EXISTS immutable_fact_guard ON immutable_facts;
CREATE TRIGGER immutable_fact_guard BEFORE UPDATE OR DELETE ON immutable_facts
FOR EACH ROW EXECUTE FUNCTION immutable_fact_guard();
CREATE OR REPLACE FUNCTION sent_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD.transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Sent allocation cannot be changed'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS sent_allocation_guard ON allocations;
CREATE TRIGGER sent_allocation_guard BEFORE UPDATE OR DELETE ON allocations
FOR EACH ROW EXECUTE FUNCTION sent_allocation_guard();
` + identityMigration + paymentMigration + referralMigration;
