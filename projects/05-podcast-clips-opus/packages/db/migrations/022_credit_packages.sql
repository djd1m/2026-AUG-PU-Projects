-- Additive opt-in ledger. Existing accounts, jobs and invoices stay legacy.
ALTER TABLE account ADD COLUMN billing_policy text NOT NULL DEFAULT 'legacy_daily_v1'
 CHECK (billing_policy IN ('legacy_daily_v1','credits_v1'));
ALTER TABLE video ADD COLUMN billing_policy text NOT NULL DEFAULT 'legacy_daily_v1'
 CHECK (billing_policy IN ('legacy_daily_v1','credits_v1'));
ALTER TABLE video ADD COLUMN billable_seconds integer CHECK (billable_seconds > 0);
ALTER TABLE payment_intent ADD COLUMN sku text NOT NULL DEFAULT 'legacy_pro990_v1'
 CHECK (sku IN ('legacy_pro990_v1','start_v1','pro_v1','addon_v1'));
ALTER TABLE payment_intent ADD COLUMN offer_version text NOT NULL DEFAULT 'legacy_v1';
ALTER TABLE payment_intent ADD COLUMN grant_seconds integer NOT NULL DEFAULT 0 CHECK (grant_seconds >= 0);
ALTER TABLE payment_intent ADD COLUMN period_days integer NOT NULL DEFAULT 30 CHECK (period_days=30);
ALTER TABLE payment_intent ADD COLUMN fulfilled_at timestamptz;
ALTER TABLE payment_intent ADD COLUMN period_start timestamptz;
ALTER TABLE payment_intent ADD COLUMN period_end timestamptz;
-- Old successful intents have already granted their original daily plan.
UPDATE payment_intent SET fulfilled_at=created_at WHERE status='succeeded';
ALTER TABLE payment_intent ADD CONSTRAINT credit_offer_snapshot CHECK (
 (sku='legacy_pro990_v1' AND grant_seconds=0 AND offer_version='legacy_v1') OR
 (offer_version='credits_v1_d00' AND ((sku='start_v1' AND price_minor=99000 AND grant_seconds=18000) OR
 (sku='pro_v1' AND price_minor=399000 AND grant_seconds=108000) OR
 (sku='addon_v1' AND price_minor=149000 AND grant_seconds=36000))));
CREATE FUNCTION credit_intent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.account_id,NEW.price_minor,NEW.sku,NEW.offer_version,NEW.grant_seconds,NEW.period_days,NEW.idempotency_key)
 IS DISTINCT FROM (OLD.account_id,OLD.price_minor,OLD.sku,OLD.offer_version,OLD.grant_seconds,OLD.period_days,OLD.idempotency_key)
 THEN RAISE EXCEPTION 'immutable payment offer'; END IF; RETURN NEW; END $$;
CREATE TRIGGER credit_intent_immutable BEFORE UPDATE ON payment_intent FOR EACH ROW EXECUTE FUNCTION credit_intent_immutable();
ALTER TABLE payment DROP CONSTRAINT payment_review_reason_check;
ALTER TABLE payment ADD CONSTRAINT payment_review_reason_check CHECK
 (review_reason IN ('amount_mismatch','refund','unknown_intent','account_erasing','intent_already_fulfilled','payment_identity_mismatch'));
ALTER TABLE operator_action DROP CONSTRAINT operator_action_action_check;
ALTER TABLE operator_action ADD CONSTRAINT operator_action_action_check CHECK (action IN ('set_plan','credit_opt_in'));
CREATE TABLE credit_grant (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
 source text NOT NULL CHECK (source IN ('signup','migration_trial','payment','recovery')),
 source_key text NOT NULL UNIQUE, total_seconds integer NOT NULL CHECK (total_seconds>0),
 remaining_seconds integer NOT NULL CHECK (remaining_seconds>=0), reserved_seconds integer NOT NULL DEFAULT 0 CHECK (reserved_seconds>=0),
 available_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
 entitlement_start timestamptz, entitlement_end timestamptz, original_entitlement_ref uuid,
 recovery_video_id uuid REFERENCES video(id) ON DELETE CASCADE,
 payment_ref uuid REFERENCES payment_intent(id) ON DELETE SET NULL,
 base_sku text CHECK (base_sku IN ('start_v1','pro_v1')), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (remaining_seconds+reserved_seconds<=total_seconds),
 CHECK (expires_at IS NULL OR expires_at>available_at),
 CHECK ((entitlement_start IS NULL)=(entitlement_end IS NULL)),
 CHECK (entitlement_end IS NULL OR entitlement_end>entitlement_start),
 CHECK ((source='recovery')=(recovery_video_id IS NOT NULL))
);
CREATE UNIQUE INDEX credit_trial_once ON credit_grant(account_id) WHERE source IN ('signup','migration_trial');
CREATE INDEX credit_grant_balance ON credit_grant(account_id,expires_at,id);
CREATE TABLE video_credit_charge (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), video_id uuid NOT NULL REFERENCES video(id) ON DELETE CASCADE,
 cycle integer NOT NULL CHECK (cycle>0), billable_seconds integer NOT NULL CHECK (billable_seconds>0),
 state text NOT NULL CHECK (state IN ('reserved','settled','released')), policy_version text NOT NULL DEFAULT 'credits_v1',
 paid_render boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 UNIQUE(video_id,cycle)
);
CREATE UNIQUE INDEX video_credit_active ON video_credit_charge(video_id) WHERE state IN ('reserved','settled');
CREATE TABLE credit_allocation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), charge_id uuid NOT NULL REFERENCES video_credit_charge(id) ON DELETE CASCADE,
 grant_id uuid NOT NULL REFERENCES credit_grant(id) ON DELETE CASCADE,
 seconds integer NOT NULL CHECK (seconds>0), UNIQUE(charge_id,grant_id)
);

CREATE FUNCTION credit_video_policy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT billing_policy INTO NEW.billing_policy FROM account WHERE id=NEW.account_id;
 RETURN NEW; END $$;
CREATE TRIGGER credit_video_policy BEFORE INSERT ON video FOR EACH ROW EXECUTE FUNCTION credit_video_policy();

ALTER TABLE video DROP CONSTRAINT video_failure_reason_check;
ALTER TABLE video ADD CONSTRAINT video_failure_reason_check CHECK (failure_reason IN
 ('too_large','not_media','no_audio','too_short','too_long','probe_timeout','stt_failed','no_timestamps','no_fragments',
 'schema_violation','refused_user_uploads','refused_user_minutes','refused_global_minutes','refused_user_llm',
 'refused_global_llm','stalled','render_failed','refused_credit_balance'));
