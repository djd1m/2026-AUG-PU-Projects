ALTER TABLE partner_code
  ADD COLUMN unblocked_at timestamptz,
  ADD COLUMN unblock_reason text CHECK (unblock_reason IS NULL OR char_length(btrim(unblock_reason)) BETWEEN 1 AND 500);

ALTER TABLE attribution ALTER COLUMN partner_code_id DROP NOT NULL;
ALTER TABLE attribution DROP CONSTRAINT attribution_partner_code_id_fkey;
ALTER TABLE attribution ADD CONSTRAINT attribution_partner_code_id_fkey
  FOREIGN KEY (partner_code_id) REFERENCES partner_code(id) ON DELETE SET NULL;
ALTER TABLE attribution DROP CONSTRAINT attribution_status_check;
ALTER TABLE attribution ADD CONSTRAINT attribution_status_check
  CHECK (status IN ('pending','activated','rejected','partner_deleted'));
-- Deleting a code outside retention fails closed until its attributions are anonymized.
ALTER TABLE attribution ADD CONSTRAINT attribution_partner_deleted_null
  CHECK (partner_code_id IS NOT NULL OR status = 'partner_deleted');
