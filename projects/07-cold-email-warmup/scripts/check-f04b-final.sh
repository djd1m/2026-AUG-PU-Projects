#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_PROJECT_NAME=n7f04b N7_RUNTIME_DIR=/tmp/n7-f04b-runtime N7_WEB_PORT=18706 N7_APP_ORIGIN=http://127.0.0.1:18706
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'flock -u 9' EXIT
test -f /tmp/n7-f04b-heavy.allowed
python3 scripts/check-f04b-mutation.py
docker compose -p n7f04b exec -T web npm run test:f04b
python3 scripts/check-f04b-secrets.py
python3 scripts/check-f04b-snapshot.py
