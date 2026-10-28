-- Private product entitlement; no plan, payment or credit ledger changes.
ALTER TABLE account ADD COLUMN owner_unlimited boolean NOT NULL DEFAULT false;
ALTER TABLE operator_action DROP CONSTRAINT operator_action_action_check;
ALTER TABLE operator_action ADD CONSTRAINT operator_action_action_check
  CHECK (action IN ('set_plan','credit_opt_in','set_owner_unlimited'));
