#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f03a-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f03a N7_RUNTIME_DIR=/tmp/n7-f03a-runtime N7_WEB_PORT=18703 N7_APP_ORIGIN=http://127.0.0.1:18703
export MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ"; flock -u 9' EXIT
date -u +"HEAVY_STARTED %Y-%m-%dT%H:%M:%SZ"
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03a-web .
docker compose -p n7f03a up -d --no-build --wait
# The unchanged F01 minute-bucket test needs its full ten-attempt interval within one minute.
# Wait only for this known failed test, at most10seconds; no auth behavior is changed.
second=$(date -u +%S);second=$((10#$second))
if [ "$second" -ge 50 ]; then sleep "$((60-second))"; fi
docker compose -p n7f03a exec -T web npm run test:integration
python3 scripts/check-f03a-mutation.py
docker compose -p n7f03a exec -T web ./node_modules/.bin/tsx --test tests/dispatch-integration.test.ts
taskset -c "$N7_TASK_CPUS" npm audit --audit-level=high
docker image inspect n7f03a-web --format 'IMAGE {{.Id}}'
