-- Feature 9 precedes partner codes (feature 10). Ownership remains mandatory via account_id.
-- Existing partner references are preserved; feature 10 can attach attribution later.
ALTER TABLE guest_pack ALTER COLUMN host_partner_code_id DROP NOT NULL;
