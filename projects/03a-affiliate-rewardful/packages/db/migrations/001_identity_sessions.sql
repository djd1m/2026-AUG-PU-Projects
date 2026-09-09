-- N3a-owned identity schema. Privileged issuance and its ACL publish atomically.
CREATE TABLE n3a.users (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  identity_hash bytea NOT NULL UNIQUE CHECK (octet_length(identity_hash) = 32),
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE n3a.sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  user_id uuid NOT NULL REFERENCES n3a.users(id) ON DELETE RESTRICT,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX sessions_user_id_idx ON n3a.sessions(user_id);

CREATE FUNCTION n3a.issue_session_if_current(
  p_user_id uuid, p_password_hash text, p_token_hash bytea
) RETURNS TABLE(user_id uuid, session_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  current_user_row n3a.users%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_password_hash IS NULL OR p_token_hash IS NULL
     OR octet_length(p_token_hash) <> 32 THEN
    RETURN;
  END IF;
  SELECT u.* INTO current_user_row FROM n3a.users AS u
    WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT current_user_row.enabled
     OR convert_to(current_user_row.password_hash, 'UTF8')
        IS DISTINCT FROM convert_to(p_password_hash, 'UTF8') THEN
    RETURN;
  END IF;
  RETURN QUERY INSERT INTO n3a.sessions AS s(user_id, token_hash, created_at, expires_at)
    VALUES (p_user_id, p_token_hash, statement_timestamp(), statement_timestamp() + interval '24 hours')
    RETURNING s.user_id, s.id, s.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION n3a.issue_session_if_current(uuid, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION n3a.issue_session_if_current(uuid, text, bytea) TO n3a_app;
REVOKE ALL ON n3a.users, n3a.sessions FROM PUBLIC, n3a_app;
