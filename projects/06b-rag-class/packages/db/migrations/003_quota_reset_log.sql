-- 003_quota_reset_log.sql — журнал ручного сброса счётчика оператором (OWN-06B-010, фича spend-ceilings).
-- Сброс — только один названный ключ одного дня, с записью кто/когда/какой ключ/прежнее значение. Веб-ручки нет:
-- запись делает команда оператора (packages/db/src/ops-cli.ts) под ролью n6b_service в ОДНОЙ транзакции со сбросом —
-- сброс без записи в журнале невозможен. Удалять и менять строки журнала не может никто, кроме владельца БД.

CREATE TABLE quota_reset_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          text NOT NULL CHECK (length(scope) BETWEEN 1 AND 300),
  day            date NOT NULL,
  previous_used  integer NOT NULL CHECK (previous_used >= 0),
  operator       text NOT NULL CHECK (length(btrim(operator)) BETWEEN 1 AND 100),
  reason         text CHECK (reason IS NULL OR length(reason) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quota_reset_log_created_idx ON quota_reset_log (created_at);

GRANT SELECT, INSERT ON quota_reset_log TO n6b_service;
ALTER TABLE quota_reset_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_reset_log FORCE ROW LEVEL SECURITY;
