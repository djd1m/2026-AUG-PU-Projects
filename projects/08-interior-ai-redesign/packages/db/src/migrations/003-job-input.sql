-- Admission inputs are immutable; lifecycle/fence/accounting results have separate transitions.
CREATE FUNCTION guard_job_input() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['state','lease_fence','lease_until','worker_id','request_dispatched_at','actual_micro_usd','usage','credit_state','output_design_id','error_code','finished_at']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['state','lease_fence','lease_until','worker_id','request_dispatched_at','actual_micro_usd','usage','credit_state','output_design_id','error_code','finished_at']) THEN
  RAISE EXCEPTION 'immutable job admission';
 END IF;
 IF OLD.request_dispatched_at IS NOT NULL AND NEW.request_dispatched_at IS DISTINCT FROM OLD.request_dispatched_at THEN RAISE EXCEPTION 'dispatch marker cannot change'; END IF;
 IF NEW.lease_fence<OLD.lease_fence THEN RAISE EXCEPTION 'lease fence cannot decrease'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER job_input_immutable BEFORE UPDATE ON job FOR EACH ROW EXECUTE FUNCTION guard_job_input();
