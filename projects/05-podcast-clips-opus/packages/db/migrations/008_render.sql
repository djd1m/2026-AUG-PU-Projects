-- clip.render_fence, its nonnegative CHECK and four statuses already exist in 001.
-- Keep applied migrations intact; strengthen render ownership at the queue boundary.
CREATE FUNCTION require_render_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage = 'render' AND NOT EXISTS (
    SELECT 1 FROM clip c JOIN clip_link l ON l.clip_id=c.id
    WHERE c.id=NEW.clip_id AND c.video_id=NEW.video_id
  ) THEN RAISE EXCEPTION 'render requires clip_link before job_attempt'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER render_link_before_attempt BEFORE INSERT ON job_attempt
FOR EACH ROW EXECUTE FUNCTION require_render_link();
