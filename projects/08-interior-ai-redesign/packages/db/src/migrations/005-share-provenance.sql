CREATE OR REPLACE FUNCTION guard_export_provenance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.state='ready' AND OLD.kind='share_image' AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'immutable export provenance';
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION guard_share_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at')
  OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
  RAISE EXCEPTION 'immutable share identity';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER share_identity BEFORE UPDATE ON share_link FOR EACH ROW EXECUTE FUNCTION guard_share_identity();
