#!/usr/bin/env bash
set -euo pipefail
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${N3A_DB_APP_PASSWORD:?N3A_DB_APP_PASSWORD is required}"
: "${N3A_DB_MIGRATE_PASSWORD:?N3A_DB_MIGRATE_PASSWORD is required}"
if [[ "$POSTGRES_USER" != n3a_admin || "$POSTGRES_DB" != n3a ]]; then
  echo 'foundation bootstrap requires its isolated database and administrator' >&2
  exit 1
fi
if [[ "$N3A_DB_APP_PASSWORD" == "$N3A_DB_MIGRATE_PASSWORD" ]]; then
  echo 'foundation database credentials must be distinct' >&2
  exit 1
fi
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set app_password="$N3A_DB_APP_PASSWORD" \
  --set migrate_password="$N3A_DB_MIGRATE_PASSWORD" <<'SQL'
BEGIN;
CREATE ROLE n3a_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'migrate_password';
CREATE ROLE n3a_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD :'app_password';
REVOKE ALL ON DATABASE n3a FROM PUBLIC;
GRANT CONNECT ON DATABASE n3a TO n3a_app, n3a_migrator;
GRANT CREATE, TEMPORARY ON DATABASE n3a TO n3a_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA n3a AUTHORIZATION n3a_migrator;
REVOKE ALL ON SCHEMA n3a FROM PUBLIC;
GRANT USAGE ON SCHEMA n3a TO n3a_app;
ALTER DEFAULT PRIVILEGES FOR ROLE n3a_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER ROLE n3a_app SET lock_timeout = '1s';
ALTER ROLE n3a_app SET statement_timeout = '5s';
COMMIT;
SQL
