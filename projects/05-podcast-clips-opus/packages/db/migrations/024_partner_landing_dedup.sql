-- Fail if existing duplicates exist; never silently rewrite historical visits.
CREATE UNIQUE INDEX growth_event_direct_partner_view_unique
  ON growth_event(partner_code_id,ip_prefix,day)
  WHERE type='link_view' AND clip_link_id IS NULL AND partner_code_id IS NOT NULL;
-- Conservative cutoff for current rows; no invented historical assignment time.
ALTER TABLE attribution ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT clock_timestamp();
