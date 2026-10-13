#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f03b-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f03b N7_RUNTIME_DIR=/tmp/n7-f03b-runtime N7_WEB_PORT=18704 N7_APP_ORIGIN=http://127.0.0.1:18704
export N7_DISPATCH_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
bash ../../scripts/check-port-conflicts.sh .
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ"; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ"
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
if [ ! -d node_modules ]; then taskset -c "$N7_TASK_CPUS" npm ci --no-audit --no-fund; fi
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03b-web .
docker compose -p n7f03b up -d --no-build --wait
docker compose -p n7f03b exec -T web npm test
# Existing F01 fixed minute bucket: unchanged assertions and auth algorithm.
second=$(date -u +%S);second=$((10#$second))
if [ "$second" -ge 50 ]; then sleep "$((60-second))"; fi
docker compose -p n7f03b exec -T web npm run test:integration
python3 scripts/check-f03b-mutation.py
docker compose -p n7f03b exec -T web ./node_modules/.bin/tsx --test tests/submission-integration.test.ts
python3 scripts/check-f03b-secrets.py
taskset -c "$N7_TASK_CPUS" npm audit --audit-level=high
docker image inspect n7f03b-web --format 'IMAGE {{.Id}}'
