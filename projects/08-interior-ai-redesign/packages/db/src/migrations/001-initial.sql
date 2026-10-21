CREATE TABLE account (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 email_canonical text NOT NULL UNIQUE, password_hash text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 credits_available integer NOT NULL DEFAULT 0 CHECK(credits_available>=0), credits_held integer NOT NULL DEFAULT 0 CHECK(credits_held>=0),
 paid_export boolean NOT NULL DEFAULT false, billing_hold boolean NOT NULL DEFAULT false
);
CREATE TABLE session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
 account_id uuid NOT NULL REFERENCES account(id), token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE INDEX session_account ON session(account_id);
CREATE TABLE project (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), account_id uuid NOT NULL REFERENCES account(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), region text NOT NULL CHECK(length(region) BETWEEN 1 AND 120), store text,
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','archived')), version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 current_shell_id uuid, current_design_id uuid, current_budget_id uuid, scene_catalog jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(scene_catalog)='array' AND jsonb_array_length(scene_catalog)<=100),
 UNIQUE(id,account_id)
);
CREATE INDEX project_owner ON project(account_id,created_at,id);
CREATE TABLE asset (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id),
 kind text NOT NULL CHECK(kind IN ('reference','room_photo','glb','share_image')), original_key text NOT NULL UNIQUE, normalized_key text UNIQUE,
 original_hash text, mime text NOT NULL, bytes bigint CHECK(bytes>=0 AND bytes<=31457280), rights_confirmed boolean NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready','rejected')), stored_bytes bigint NOT NULL CHECK(stored_bytes>=0 AND stored_bytes<=62914560), metadata jsonb NOT NULL DEFAULT '{}',
 UNIQUE(id,project_id), CHECK(state!='ready' OR (original_hash IS NOT NULL AND bytes IS NOT NULL AND (kind='glb' OR normalized_key IS NOT NULL)))
);
CREATE INDEX asset_project ON asset(project_id,state,created_at);
CREATE TABLE reference (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id),
 asset_id uuid, source_url text, tags jsonb NOT NULL DEFAULT '[]', note text NOT NULL DEFAULT '', observed_at timestamptz NOT NULL, rights_confirmed boolean NOT NULL,
 UNIQUE(id,project_id), CHECK((asset_id IS NULL)<>(source_url IS NULL)), FOREIGN KEY(asset_id,project_id) REFERENCES asset(id,project_id)
);
CREATE TABLE shell_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id), parent_id uuid,
 mode text NOT NULL CHECK(mode IN ('manual','glb')), source_asset_id uuid, units text NOT NULL DEFAULT 'm' CHECK(units='m'), geometry jsonb NOT NULL, calibration jsonb NOT NULL,
 floor_area_m2 numeric CHECK(floor_area_m2>0 AND floor_area_m2<=10000), floor_area_source text NOT NULL CHECK(floor_area_source IN ('manual_geometry','user_confirmed','unknown')), confirmed_at timestamptz, hash text NOT NULL,
 UNIQUE(id,project_id), FOREIGN KEY(parent_id,project_id) REFERENCES shell_revision(id,project_id), FOREIGN KEY(source_asset_id,project_id) REFERENCES asset(id,project_id)
);
CREATE TABLE design_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id), parent_id uuid,
 shell_id uuid NOT NULL, shell_hash text NOT NULL, scene jsonb NOT NULL, reference_ids uuid[] NOT NULL DEFAULT '{}', style text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('manual','demo','live')), state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','superseded')),
 fit text NOT NULL CHECK(fit IN ('bbox_checked','unconfirmed')), approved_at timestamptz, change_reason text NOT NULL,
 UNIQUE(id,project_id), FOREIGN KEY(parent_id,project_id) REFERENCES design_revision(id,project_id), FOREIGN KEY(shell_id,project_id) REFERENCES shell_revision(id,project_id)
);
CREATE TABLE job (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL, account_id uuid NOT NULL,
 shell_id uuid NOT NULL, reference_ids uuid[] NOT NULL DEFAULT '{}', style text NOT NULL, input_text text NOT NULL, input_hash text NOT NULL,
 request_body text NOT NULL CHECK(octet_length(request_body)<=32768), consent_hash text NOT NULL, origin_project_version integer NOT NULL, origin_design_id uuid, expires_at timestamptz NOT NULL,
 idempotency_key uuid NOT NULL, mode text NOT NULL CHECK(mode IN ('demo','live')), model_id text,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','succeeded','failed','uncertain')), lease_fence integer NOT NULL DEFAULT 0, lease_until timestamptz, worker_id text,
 request_dispatched_at timestamptz, reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK(reserved_micro_usd>=0), admission_day date NOT NULL,
 actual_micro_usd bigint CHECK(actual_micro_usd>=0), usage jsonb, credit_state text NOT NULL DEFAULT 'none' CHECK(credit_state IN ('none','held','consumed','released')),
 output_design_id uuid, error_code text, finished_at timestamptz, UNIQUE(account_id,idempotency_key), UNIQUE(id,project_id),
 FOREIGN KEY(project_id,account_id) REFERENCES project(id,account_id), FOREIGN KEY(shell_id,project_id) REFERENCES shell_revision(id,project_id),
 FOREIGN KEY(origin_design_id,project_id) REFERENCES design_revision(id,project_id), FOREIGN KEY(output_design_id,project_id) REFERENCES design_revision(id,project_id)
);
CREATE INDEX job_queue ON job(state,created_at);
CREATE INDEX job_admission ON job(admission_day,account_id) WHERE mode='live';
CREATE TABLE spend_budget (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), scope text NOT NULL CHECK(scope IN ('account','global')), account_id uuid REFERENCES account(id), day date NOT NULL,
 settled_micro_usd bigint NOT NULL DEFAULT 0 CHECK(settled_micro_usd>=0), reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK(reserved_micro_usd>=0), cap_micro_usd bigint NOT NULL CHECK(cap_micro_usd>0),
 CHECK((scope='global' AND account_id IS NULL) OR (scope='account' AND account_id IS NOT NULL))
);
CREATE UNIQUE INDEX spend_global_day ON spend_budget(day) WHERE scope='global';
CREATE UNIQUE INDEX spend_account_day ON spend_budget(account_id,day) WHERE scope='account';
CREATE TABLE product_snapshot (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id), retailer text NOT NULL, seller text, article text, name text NOT NULL,
 source_url text NOT NULL, region text, store text, observed_at timestamptz, source text NOT NULL CHECK(source IN ('manual','api','scraper','demo')),
 freshness text NOT NULL CHECK(freshness IN ('fresh','stale','unknown','blocked')), price_minor bigint CHECK(price_minor>=0 AND price_minor<=1000000000000), currency text NOT NULL DEFAULT 'RUB' CHECK(currency='RUB'),
 base_unit text NOT NULL CHECK(base_unit IN ('m2','l','kg','m','piece')), sale_unit text NOT NULL CHECK(sale_unit IN ('pack','piece')), coverage numeric CHECK(coverage>0 AND coverage<=100000000),
 stock text NOT NULL CHECK(stock IN ('in_stock','out_of_stock','unknown')), stock_qty numeric CHECK(stock_qty>=0), dimensions_m jsonb, UNIQUE(id,project_id)
);
CREATE TABLE shopping_line (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id), design_id uuid NOT NULL, element_id text NOT NULL,
 selection text NOT NULL CHECK(selection IN ('matched','unmatched','retained')), retained_reason text, snapshot_id uuid,
 quantity_source text NOT NULL CHECK(quantity_source IN ('floor_area','wall_area','surface_area','manual')), source_shell_id uuid, quantity_confirmed boolean NOT NULL DEFAULT false,
 base_quantity numeric CHECK(base_quantity>=0 AND base_quantity<=100000000), waste_pct numeric NOT NULL DEFAULT 0 CHECK(waste_pct BETWEEN 0 AND 100),
 phase text NOT NULL CHECK(phase IN ('preparation','finishing','furnishing')), fit text NOT NULL CHECK(fit IN ('bbox_checked','unconfirmed')), version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 UNIQUE(id,project_id), UNIQUE(project_id,design_id,element_id), FOREIGN KEY(design_id,project_id) REFERENCES design_revision(id,project_id), FOREIGN KEY(snapshot_id,project_id) REFERENCES product_snapshot(id,project_id), FOREIGN KEY(source_shell_id,project_id) REFERENCES shell_revision(id,project_id),
 CHECK(selection!='retained' OR length(retained_reason)>0)
);
CREATE TABLE budget_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id), design_id uuid NOT NULL, parent_id uuid,
 input_project_version integer NOT NULL, lines_snapshot jsonb NOT NULL, services jsonb NOT NULL, delivery jsonb NOT NULL, reserve_pct numeric NOT NULL CHECK(reserve_pct BETWEEN 0 AND 100),
 reserve_base text NOT NULL CHECK(reserve_base IN ('known_subtotal','scenario_subtotal')), reserve_base_minor bigint NOT NULL CHECK(reserve_base_minor>=0 AND reserve_base_minor<=100000000000000), reserve_minor bigint CHECK(reserve_minor>=0),
 phase_totals jsonb NOT NULL, delta jsonb NOT NULL, limit_minor bigint CHECK(limit_minor>=0 AND limit_minor<=100000000000000), known_subtotal_minor bigint NOT NULL CHECK(known_subtotal_minor>=0 AND known_subtotal_minor<=100000000000000),
 scenario_total_minor bigint CHECK(scenario_total_minor>=0 AND scenario_total_minor<=100000000000000), unresolved_count integer NOT NULL CHECK(unresolved_count>=0), complete boolean NOT NULL, input_hash text NOT NULL, change_reason text NOT NULL,
 UNIQUE(id,project_id), FOREIGN KEY(design_id,project_id) REFERENCES design_revision(id,project_id), FOREIGN KEY(parent_id,project_id) REFERENCES budget_revision(id,project_id)
);
CREATE TABLE payment_order (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), account_id uuid NOT NULL REFERENCES account(id), sku text NOT NULL, price_minor bigint NOT NULL CHECK(price_minor>0),
 currency text NOT NULL DEFAULT 'RUB' CHECK(currency='RUB'), credits integer NOT NULL CHECK(credits>=0), unwatermarked_export boolean NOT NULL,
 idempotency_key uuid NOT NULL, request_hash text NOT NULL, provider text NOT NULL, remote_id text UNIQUE, confirmation_url text,
 state text NOT NULL DEFAULT 'created' CHECK(state IN ('created','pending','succeeded','canceled','refund_hold')), paid_at timestamptz, UNIQUE(account_id,idempotency_key)
);
CREATE TABLE payment_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), provider text NOT NULL, remote_event_key text NOT NULL, order_id uuid NOT NULL REFERENCES payment_order(id),
 kind text NOT NULL CHECK(kind IN ('succeeded','refund_hold')), remote_object_id text NOT NULL, payload_hash text NOT NULL, applied_at timestamptz NOT NULL,
 UNIQUE(provider,kind,remote_object_id), UNIQUE(provider,remote_event_key)
);
CREATE TABLE share_link (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), project_id uuid NOT NULL REFERENCES project(id), design_id uuid NOT NULL, asset_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE, caption text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(design_id,project_id) REFERENCES design_revision(id,project_id), FOREIGN KEY(asset_id,project_id) REFERENCES asset(id,project_id)
);
CREATE INDEX share_project ON share_link(project_id);
CREATE TABLE audit_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), account_id uuid REFERENCES account(id), project_id uuid REFERENCES project(id),
 kind text NOT NULL, event_key text NOT NULL, request_id text NOT NULL, data jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE rate_bucket (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(), subject_hash text NOT NULL, kind text NOT NULL, window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>=1),
 UNIQUE(subject_hash,kind,window_start)
);
ALTER TABLE project ADD FOREIGN KEY(current_shell_id,id) REFERENCES shell_revision(id,project_id);
ALTER TABLE project ADD FOREIGN KEY(current_design_id,id) REFERENCES design_revision(id,project_id);
ALTER TABLE project ADD FOREIGN KEY(current_budget_id,id) REFERENCES budget_revision(id,project_id);
CREATE FUNCTION reject_immutable_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable revision'; END $$;
CREATE TRIGGER shell_immutable BEFORE UPDATE OR DELETE ON shell_revision FOR EACH ROW EXECUTE FUNCTION reject_immutable_revision();
CREATE TRIGGER budget_immutable BEFORE UPDATE OR DELETE ON budget_revision FOR EACH ROW EXECUTE FUNCTION reject_immutable_revision();
CREATE TRIGGER product_immutable BEFORE UPDATE OR DELETE ON product_snapshot FOR EACH ROW EXECUTE FUNCTION reject_immutable_revision();
CREATE FUNCTION guard_design_content() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','approved_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','approved_at']) THEN RAISE EXCEPTION 'immutable design content'; END IF; RETURN NEW; END $$;
CREATE TRIGGER design_immutable BEFORE UPDATE ON design_revision FOR EACH ROW EXECUTE FUNCTION guard_design_content();
CREATE TRIGGER design_no_delete BEFORE DELETE ON design_revision FOR EACH ROW EXECUTE FUNCTION reject_immutable_revision();
CREATE FUNCTION guard_catalog_append() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE old_entry jsonb; BEGIN
 FOR old_entry IN SELECT value FROM jsonb_array_elements(OLD.scene_catalog) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.scene_catalog) e WHERE e=old_entry) THEN RAISE EXCEPTION 'immutable catalog entry'; END IF;
 END LOOP; RETURN NEW; END $$;
CREATE TRIGGER catalog_append BEFORE UPDATE OF scene_catalog ON project FOR EACH ROW EXECUTE FUNCTION guard_catalog_append();
CREATE FUNCTION guard_export_provenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state='ready' AND OLD.kind='share_image' AND (NEW.kind,NEW.original_key,NEW.normalized_key,NEW.original_hash,NEW.mime,NEW.bytes,NEW.metadata) IS DISTINCT FROM (OLD.kind,OLD.original_key,OLD.normalized_key,OLD.original_hash,OLD.mime,OLD.bytes,OLD.metadata) THEN RAISE EXCEPTION 'immutable export provenance'; END IF; RETURN NEW; END $$;
CREATE TRIGGER export_immutable BEFORE UPDATE ON asset FOR EACH ROW EXECUTE FUNCTION guard_export_provenance();
