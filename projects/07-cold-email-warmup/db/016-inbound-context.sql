-- Additive closed-default context intents: no body backfill or transport authority.
CREATE UNIQUE INDEX send_job_context_ownership ON send_job(tenant_id,mailbox_id,id);
CREATE TABLE incoming_ai_event (
 id uuid PRIMARY KEY, semantic_event_id uuid NOT NULL, tenant_id uuid NOT NULL, mailbox_id uuid NOT NULL,
 enrollment_id uuid, root_job_id uuid,
 uidvalidity text NOT NULL, uid bigint NOT NULL CHECK(uid BETWEEN 1 AND 4294967295),
 origin_run_id uuid NOT NULL, origin_attempt integer NOT NULL CHECK(origin_attempt>0),
 source text NOT NULL CHECK(source IN ('local_fixture','imap_headers')), binding_version integer NOT NULL DEFAULT 1 CHECK(binding_version>0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','held','drafted','approved','queued','submitted','error','unknown')),
 capture_state text NOT NULL CHECK(capture_state IN ('pending','claimed','ready','held','purged')), reason text NOT NULL,
 arrival_at timestamptz, arrival_source text, eligible_at_arrival boolean, policy_version text,
 created_at timestamptz NOT NULL DEFAULT now(), observed_at timestamptz NOT NULL,
 captured_at timestamptz, terminal_at timestamptz, expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 metadata_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 content_envelope jsonb, message_bytes integer[], body_bytes integer, thread_message_count integer,
 intent_candidate text CHECK(intent_candidate IN ('product_overview','supported_features','supported_integrations','setup_steps','documentation')),
 sender_binding char(64), rules_version text, rules_hash char(64), content_fingerprint char(64),
 capture_phase text NOT NULL DEFAULT 'metadata' CHECK(capture_phase IN ('metadata','text')),
 phase_metadata jsonb, phase_revision text, phase_mailbox_revision text,
 owner_id uuid, generation bigint NOT NULL DEFAULT 0, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,mailbox_id,uidvalidity,uid),
 FOREIGN KEY(tenant_id,mailbox_id) REFERENCES mailbox(tenant_id,id),
 FOREIGN KEY(tenant_id,mailbox_id,root_job_id) REFERENCES send_job(tenant_id,mailbox_id,id),
 FOREIGN KEY(tenant_id,enrollment_id) REFERENCES enrollment(tenant_id,id),
 CHECK((capture_state='claimed' AND owner_id IS NOT NULL AND lease_until IS NOT NULL) OR (capture_state<>'claimed' AND owner_id IS NULL AND lease_until IS NULL)),
 CHECK(expires_at<=created_at+interval '7 days' AND (terminal_at IS NULL OR expires_at<=terminal_at+interval '24 hours')),
 CHECK(metadata_expires_at<=created_at+interval '30 days'),
 CHECK(content_envelope IS NULL OR (enrollment_id IS NOT NULL AND root_job_id IS NOT NULL AND capture_state='ready' AND
 thread_message_count IS NOT NULL AND message_bytes IS NOT NULL AND body_bytes IS NOT NULL AND thread_message_count BETWEEN 1 AND 5 AND cardinality(message_bytes)=thread_message_count AND
 0<=ALL(message_bytes) AND 32768>=ALL(message_bytes) AND body_bytes BETWEEN 0 AND 65536 AND
 body_bytes=COALESCE(message_bytes[1],0)+COALESCE(message_bytes[2],0)+COALESCE(message_bytes[3],0)+COALESCE(message_bytes[4],0)+COALESCE(message_bytes[5],0)))
);
CREATE INDEX incoming_context_expiry ON incoming_ai_event(expires_at) WHERE content_envelope IS NOT NULL;
CREATE INDEX incoming_metadata_expiry ON incoming_ai_event(metadata_expires_at);
CREATE INDEX incoming_capture_due ON incoming_ai_event(next_attempt_at) WHERE capture_state='pending';
-- Fingerprints are authenticated tenant/root/content identities, never Message-ID.
CREATE UNIQUE INDEX incoming_semantic_once ON incoming_ai_event(tenant_id,mailbox_id,root_job_id,content_fingerprint) WHERE content_fingerprint IS NOT NULL;
INSERT INTO schema_migration(version) VALUES(16);
