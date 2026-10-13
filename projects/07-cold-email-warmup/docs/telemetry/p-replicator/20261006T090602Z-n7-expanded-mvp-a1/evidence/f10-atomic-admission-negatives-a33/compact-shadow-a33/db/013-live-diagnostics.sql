ALTER TABLE mailbox ADD COLUMN diagnostic_revision bigint NOT NULL DEFAULT 0 CHECK(diagnostic_revision>=0),
 ADD COLUMN diagnostic_attempt uuid, ADD COLUMN diagnostic_result jsonb;
CREATE TABLE diagnostic_authority (
 id smallint PRIMARY KEY CHECK(id=1), authority_revision bigint NOT NULL DEFAULT 0 CHECK(authority_revision>=0),
 state text NOT NULL CHECK(state IN ('active','revoked')), expires_at timestamptz,
 scope jsonb, config_fingerprint text,
 CHECK(state='revoked' OR (expires_at IS NOT NULL AND scope IS NOT NULL AND config_fingerprint IS NOT NULL))
);
INSERT INTO diagnostic_authority(id,state) VALUES(1,'revoked');
INSERT INTO schema_migration(version) VALUES(13);
