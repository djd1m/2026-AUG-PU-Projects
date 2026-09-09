#!/bin/sh
set -eu
# No password in argv, logs, committed files, or a default fallback.
APP_PASSWORD="$(cat /tmp/n3-app-password)"
case "$APP_PASSWORD" in ''|*[!0-9a-f]*) echo 'Invalid app secret' >&2; exit 1;; esac
[ "${#APP_PASSWORD}" -eq 64 ] || exit 1
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<SQL
CREATE ROLE n3_app LOGIN PASSWORD '$APP_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT, CREATE ON DATABASE n3 TO n3_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA n3 AUTHORIZATION n3_app;
ALTER ROLE n3_app SET search_path TO n3, public;
SQL
unset APP_PASSWORD
rm -f /tmp/n3-app-password
