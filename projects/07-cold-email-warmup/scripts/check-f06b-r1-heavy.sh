#!/usr/bin/env bash
# Bounded coordinator command; does not wait for permission or heavy/UI mutexes.
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f06b-r1-heavy.allowed
exec 9>/tmp/codex-heavy-build.lock
flock -n 9
export COMPOSE_PROJECT_NAME=n7f06a N7_RUNTIME_DIR=/tmp/n7-f06a-runtime N7_WEB_PORT=18709 N7_APP_ORIGIN=http://127.0.0.1:18709
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
evidence=docs/telemetry/features/20261003T023900Z-f06
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> "$evidence/sol-b-r1-heavy-progress.log"; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> "$evidence/sol-b-r1-heavy-progress.log"
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2000000
for name in session-key db-password recipient-hash-key operator-token credential-keyring.json; do test -s "$N7_RUNTIME_DIR/$name"; done
python3 scripts/check-f06b-r1-snapshot.py check
# Only the already owned web is stopped; mandatory port check follows.
timeout 30s docker compose -p n7f06a stop web
bash ../../scripts/check-port-conflicts.sh .
# Existing tag; no backend rerun and no new containers/browser/host DB ports.
timeout 240s env DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f06a-web . > "$evidence/sol-b-r1-docker.log" 2>&1
python3 scripts/check-f06b-r1-snapshot.py preflight
timeout 90s docker compose -p n7f06a up -d --no-build --wait db web
python3 scripts/check-f06b-r1-snapshot.py receipt
python3 scripts/check-f06b-r1-secrets.py
# Read-only exact source/image gate runs again immediately before actual browser.
timeout 80s python3 scripts/check-f06b-r1-native.py
