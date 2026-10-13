#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f06a-r1-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f06a N7_RUNTIME_DIR=/tmp/n7-f06a-runtime N7_WEB_PORT=18709 N7_APP_ORIGIN=http://127.0.0.1:18709
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
test -s "$N7_RUNTIME_DIR/session-key"
test -s "$N7_RUNTIME_DIR/db-password"
cat /tmp/n7-f06a-r1-run/control.md
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2000000
exec 9>/tmp/codex-heavy-build.lock
flock -n 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f06a-r1-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f06a-r1-run/progress.md
# The already verified own web holds 18709; stop only that service before the mandatory port check.
docker compose -p n7f06a stop web
bash ../../scripts/check-port-conflicts.sh .
for gate in typecheck lint build test; do
  set +e
  npm run "$gate" > "docs/telemetry/features/20261003T023900Z-f06/sol-a-r1-$gate.log" 2>&1
  result=$?
  set -e
  printf '%s\n' "$result" > "docs/telemetry/features/20261003T023900Z-f06/sol-a-r1-$gate.exit"
  test "$result" -eq 0
done
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f06a-web . > docs/telemetry/features/20261003T023900Z-f06/sol-a-r1-docker.log 2>&1
# Source is frozen before image build; readiness immediately precedes actual runtime.
python3 scripts/check-f06a-r1-snapshot.py preflight
docker compose -p n7f06a up -d --no-build --wait
python3 scripts/check-f06a-r1-snapshot.py ready
set +e
docker compose -p n7f06a exec -T web npm run test:integration > docs/telemetry/features/20261003T023900Z-f06/sol-a-r1-pg.log 2>&1
pg_exit=$?
printf '%s\n' "$pg_exit" > docs/telemetry/features/20261003T023900Z-f06/sol-a-r1-pg.exit
set -e
python3 scripts/check-f06a-r1-snapshot.py final
exit "$pg_exit"
