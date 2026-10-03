#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f04b-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f04b N7_RUNTIME_DIR=/tmp/n7-f04b-runtime N7_WEB_PORT=18706 N7_APP_ORIGIN=http://127.0.0.1:18706
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
bash ../../scripts/check-port-conflicts.sh .
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f04b-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f04b-run/progress.md
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f04b-web .
docker compose -p n7f04b up -d --no-build --wait
docker compose -p n7f04b exec -T web npm test
second=$(date -u +%S);second=$((10#$second))
if [ "$second" -ge 15 ]; then sleep "$((60-second))"; fi
docker compose -p n7f04b exec -T web npm run test:integration
python3 scripts/check-f04b-mutation.py
docker compose -p n7f04b exec -T web npm run test:f04b
python3 scripts/check-f04b-secrets.py
python3 scripts/check-f04b-snapshot.py
