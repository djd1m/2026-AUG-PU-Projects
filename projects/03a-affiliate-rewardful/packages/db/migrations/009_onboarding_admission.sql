CREATE TABLE n3a.admission_buckets (
 kind text NOT NULL CHECK(kind IN ('global','source','identity')), slot integer NOT NULL,
 window_start timestamptz NOT NULL DEFAULT clock_timestamp(), count integer NOT NULL DEFAULT 0 CHECK(count>=0),
 PRIMARY KEY(kind,slot), CHECK((kind='global' AND slot=0) OR (kind IN ('source','identity') AND slot BETWEEN 0 AND 4095))
);
INSERT INTO n3a.admission_buckets(kind,slot) VALUES('global',0);
INSERT INTO n3a.admission_buckets(kind,slot) SELECT k,s FROM unnest(ARRAY['source','identity']) k CROSS JOIN generate_series(0,4095) s;
REVOKE ALL ON n3a.admission_buckets FROM PUBLIC,n3a_app;
CREATE FUNCTION n3a.onboarding_charge_source(s integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE g n3a.admission_buckets%ROWTYPE; b n3a.admission_buckets%ROWTYPE; t timestamptz; retry integer;
BEGIN
 IF s IS NULL OR s<0 OR s>4095 THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 SELECT * INTO g FROM n3a.admission_buckets WHERE kind='global' AND slot=0 FOR UPDATE;
 SELECT * INTO b FROM n3a.admission_buckets WHERE kind='source' AND slot=s FOR UPDATE;
 IF g.kind IS NULL OR b.kind IS NULL THEN PERFORM n3a.onboarding_fail('unavailable'); END IF;
 t:=clock_timestamp();
 IF t<g.window_start OR t<b.window_start THEN PERFORM n3a.onboarding_fail('unavailable'); END IF;
 IF t>=g.window_start+interval '60 seconds' THEN g.window_start:=t;g.count:=0; END IF;
 IF t>=b.window_start+interval '60 seconds' THEN b.window_start:=t;b.count:=0; END IF;
 IF g.count>=300 OR b.count>=60 THEN
 retry:=greatest(CASE WHEN g.count>=300 THEN ceil(extract(epoch FROM g.window_start+interval '60 seconds'-t))::integer ELSE 0 END,
 CASE WHEN b.count>=60 THEN ceil(extract(epoch FROM b.window_start+interval '60 seconds'-t))::integer ELSE 0 END,1);
 RETURN jsonb_build_object('allowed',false,'retry_after',retry);
 END IF;
 UPDATE n3a.admission_buckets SET window_start=g.window_start,count=g.count+1 WHERE kind='global' AND slot=0;
 UPDATE n3a.admission_buckets SET window_start=b.window_start,count=b.count+1 WHERE kind='source' AND slot=s;
 RETURN jsonb_build_object('allowed',true,'retry_after',0);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_charge_source(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_charge_source(integer) TO n3a_app;
CREATE FUNCTION n3a.onboarding_charge_identity(s integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,pg_temp AS $$ DECLARE b n3a.admission_buckets%ROWTYPE; t timestamptz;
BEGIN
 IF s IS NULL OR s<0 OR s>4095 THEN PERFORM n3a.onboarding_fail('invalid_input'); END IF;
 SELECT * INTO b FROM n3a.admission_buckets WHERE kind='identity' AND slot=s FOR UPDATE;
 IF b.kind IS NULL THEN PERFORM n3a.onboarding_fail('unavailable'); END IF; t:=clock_timestamp();
 IF t<b.window_start THEN PERFORM n3a.onboarding_fail('unavailable'); END IF;
 IF t>=b.window_start+interval '900 seconds' THEN b.window_start:=t;b.count:=0; END IF;
 IF b.count>=10 THEN RETURN jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch FROM b.window_start+interval '900 seconds'-t))::integer)); END IF;
 UPDATE n3a.admission_buckets SET window_start=b.window_start,count=b.count+1 WHERE kind='identity' AND slot=s;
 RETURN jsonb_build_object('allowed',true,'retry_after',0);
END $$;
REVOKE ALL ON FUNCTION n3a.onboarding_charge_identity(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.onboarding_charge_identity(integer) TO n3a_app;
