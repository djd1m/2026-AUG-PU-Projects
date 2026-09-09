#!/bin/sh
set -eu
# Compose file secrets keep host permissions; prepare a private in-container copy
# for the unprivileged postgres initialization script. Never relax host modes.
install -o postgres -g postgres -m 600 /run/secrets/n3_db_app_password /tmp/n3-app-password
exec /usr/local/bin/docker-entrypoint.sh "$@"
