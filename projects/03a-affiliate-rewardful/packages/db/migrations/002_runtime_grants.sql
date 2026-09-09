GRANT USAGE ON SCHEMA n3a TO n3a_app;
GRANT SELECT ON n3a.users, n3a.sessions TO n3a_app;
GRANT UPDATE (revoked_at) ON n3a.sessions TO n3a_app;
REVOKE ALL ON n3a.schema_migrations FROM PUBLIC, n3a_app;
