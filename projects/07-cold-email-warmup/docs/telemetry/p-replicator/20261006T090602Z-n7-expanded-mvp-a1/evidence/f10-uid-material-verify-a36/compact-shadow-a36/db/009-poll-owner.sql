-- B callback ownership is independent of A run/attempt identity.
ALTER TABLE mailbox_poll ADD COLUMN poll_owner uuid;
ALTER TABLE local_reply_fixture ADD COLUMN generation uuid NOT NULL DEFAULT gen_random_uuid();
INSERT INTO schema_migration(version) VALUES(9);
