-- Additive indexes only; existing migrations and the closed event vocabulary stay intact.
CREATE INDEX growth_event_code_burst ON growth_event (partner_code_id, ip_prefix, created_at)
  WHERE type = 'code_applied';
CREATE INDEX attribution_partner_status ON attribution (partner_code_id, status);
