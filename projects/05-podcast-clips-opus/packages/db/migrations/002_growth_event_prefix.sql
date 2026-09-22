-- Остальные типы событий могут не иметь IP. Дедуплицируемые события обязаны иметь его.
-- Старые NULL-строки намеренно останавливают миграцию: их нельзя обезличенно пересчитать.
ALTER TABLE growth_event ADD CONSTRAINT growth_event_dedup_prefix_required
  CHECK (type NOT IN ('link_view', 'guest_opened') OR ip_prefix IS NOT NULL);
