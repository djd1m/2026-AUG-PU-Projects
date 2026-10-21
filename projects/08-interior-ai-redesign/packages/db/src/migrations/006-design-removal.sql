-- Retain immutable design content and dependent budget history; only lifecycle state changes.
ALTER TABLE design_revision DROP CONSTRAINT design_revision_state_check;
ALTER TABLE design_revision ADD CONSTRAINT design_revision_state_check CHECK(state IN ('draft','approved','superseded','deleted'));
