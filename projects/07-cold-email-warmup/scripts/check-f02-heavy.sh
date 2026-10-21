#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f02-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f02 N7_RUNTIME_DIR=/tmp/n7-f02-runtime N7_WEB_PORT=18702 N7_APP_ORIGIN=http://127.0.0.1:18702
export MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
bash ../../scripts/check-port-conflicts.sh .
# Restrict actual heavy commands only; release before returning to code/review.
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
free -m
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
test "$available" -ge 2500000
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f02-web .
docker compose -p n7f02 up -d --no-build --wait
# Dockerfile retains locked dev deps; CPU2 service and Node22 actual runtime.
docker compose -p n7f02 exec -T web npm run typecheck
docker compose -p n7f02 exec -T web npm run lint
docker compose -p n7f02 exec -T web npm test
docker compose -p n7f02 exec -T web npm run test:integration
flock -u 9
