#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f03a-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f03a N7_RUNTIME_DIR=/tmp/n7-f03a-runtime
export N7_WEB_PORT="${N7_WEB_PORT:-18703}" N7_APP_ORIGIN="http://127.0.0.1:${N7_WEB_PORT:-18703}"
export MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
bash ../../scripts/check-port-conflicts.sh .
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ"; flock -u 9' EXIT
date -u +"HEAVY_STARTED %Y-%m-%dT%H:%M:%SZ"
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
test "$available" -ge 2500000
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm ci --no-audit --no-fund
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03a-web .
docker compose -p n7f03a up -d --no-build --wait
docker compose -p n7f03a exec -T web npm test
docker compose -p n7f03a exec -T web npm run test:integration
docker image inspect n7f03a-web --format 'IMAGE {{.Id}}'
