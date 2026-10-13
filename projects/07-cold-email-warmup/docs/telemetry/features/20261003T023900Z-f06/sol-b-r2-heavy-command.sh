#!/usr/bin/env bash
set -euo pipefail
cd /tmp/n7-f06b-r2/projects/07-cold-email-warmup
test -f /tmp/n7-f06b-r2-heavy.allowed
exec 9>/tmp/codex-heavy-build.lock
flock -n 9
export COMPOSE_PROJECT_NAME=n7f06a N7_RUNTIME_DIR=/tmp/n7-f06a-runtime N7_WEB_PORT=18709 N7_APP_ORIGIN=http://127.0.0.1:18709
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}' N7_F06_BINDING_PREFIX=sol-b-r2
EVIDENCE=docs/telemetry/features/20261003T023900Z-f06
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f06b-r2-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f06b-r2-run/progress.md
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 2000000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2000000
for gate in typecheck lint build test; do
 timeout 80s npm run "$gate" > "$EVIDENCE/sol-b-r2-$gate.log" 2>&1
 echo 0 > "$EVIDENCE/sol-b-r2-$gate.exit"
done
python3 scripts/check-f06b-r1-snapshot.py freeze
python3 scripts/check-f06b-r1-snapshot.py check
timeout 30s docker compose -p n7f06a stop web
bash ../../scripts/check-port-conflicts.sh . > "$EVIDENCE/sol-b-r2-ports.log" 2>&1
 timeout 240s env DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f06a-web . > "$EVIDENCE/sol-b-r2-docker.log" 2>&1
python3 scripts/check-f06b-r1-snapshot.py preflight
timeout 90s docker compose -p n7f06a up -d --no-build --wait db web > "$EVIDENCE/sol-b-r2-start.log" 2>&1
python3 scripts/check-f06b-r1-snapshot.py receipt
