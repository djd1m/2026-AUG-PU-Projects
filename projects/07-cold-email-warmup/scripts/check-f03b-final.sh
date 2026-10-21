#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f03b-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f03b N7_RUNTIME_DIR=/tmp/n7-f03b-runtime N7_WEB_PORT=18704 N7_APP_ORIGIN=http://127.0.0.1:18704
export N7_EVIDENCE_PREFIX=sol-b-r1 N7_DISPATCH_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
exec 9>/tmp/codex-heavy-build.lock
flock -w 10 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ"; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ"
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f03b-web .
# Free/check only our own published port before replacing the own source image.
docker compose -p n7f03b stop web
bash ../../scripts/check-port-conflicts.sh .
docker compose -p n7f03b up -d --no-build --wait
docker compose -p n7f03b exec -T web npm test
docker compose -p n7f03b exec -T web npm run test:integration
python3 scripts/check-f03b-r1-clock-mutation.py
docker compose -p n7f03b exec -T web ./node_modules/.bin/tsx --test tests/submission-integration.test.ts
python3 scripts/check-f03b-secrets.py
docker compose -p n7f03b exec -T web node --version
docker image inspect n7f03b-web --format 'IMAGE {{.Id}}'
