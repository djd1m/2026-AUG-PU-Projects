-- Captured by the trusted same-validity reader; NULL means no tail snapshot yet.
ALTER TABLE reply_rescan ADD COLUMN tail_high_water bigint
 CHECK(tail_high_water BETWEEN 0 AND 4294967295 AND tail_high_water >= high_water AND cursor_uid <= tail_high_water);
INSERT INTO schema_migration(version) VALUES(7);
