-- Source-bound ownership/history/dispatch indices and idempotent growth events.
CREATE INDEX reference_project_history ON reference(project_id,created_at,id);
CREATE INDEX shell_project_history ON shell_revision(project_id,created_at,id);
CREATE INDEX design_project_history ON design_revision(project_id,created_at,id);
CREATE INDEX job_project_history ON job(project_id,created_at,id);
CREATE INDEX job_account_history ON job(account_id,created_at,id);
CREATE INDEX job_dispatch ON job(state,request_dispatched_at,lease_until,created_at);
CREATE INDEX spend_account ON spend_budget(account_id);
CREATE INDEX product_project_history ON product_snapshot(project_id,created_at,id);
CREATE INDEX shopping_project ON shopping_line(project_id);
CREATE INDEX budget_project_history ON budget_revision(project_id,created_at,id);
CREATE INDEX order_account_history ON payment_order(account_id,created_at,id);
CREATE INDEX event_order ON payment_event(order_id);
CREATE INDEX audit_account_history ON audit_event(account_id,created_at,id);
CREATE INDEX audit_project_history ON audit_event(project_id,created_at,id);
ALTER TABLE audit_event ADD UNIQUE(event_key);
CREATE INDEX audit_kind_created ON audit_event(kind,created_at);
