-- Existing occupied operations stay unknown: no inferred ownership or purpose.
ALTER TABLE transport_operation ADD COLUMN operation_purpose text CHECK(operation_purpose IN ('header','body'));
ALTER TABLE transport_operation ADD COLUMN header_reserved boolean NOT NULL DEFAULT false;
ALTER TABLE transport_operation ADD CONSTRAINT transport_header_reservation_imap CHECK(NOT header_reserved OR protocol='imap');
CREATE UNIQUE INDEX transport_one_header_reservation ON transport_operation(protocol) WHERE header_reserved;
UPDATE transport_operation SET header_reserved=true WHERE protocol='imap' AND slot=4;
INSERT INTO schema_migration(version) VALUES(17);
