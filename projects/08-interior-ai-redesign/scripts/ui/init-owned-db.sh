#!/bin/sh
set -eu
printf '%s' "$POSTGRES_DB" | LC_ALL=C grep -Eq '^n8_ui_[a-f0-9]{12}$' || exit 1
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
SELECT format('COMMENT ON DATABASE %I IS %L',current_database(),'N8_F04B_OWNED_LOCAL_SOFTWARE_FIXTURE') \gexec
SQL
