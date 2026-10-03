#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f04a-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f04a N7_RUNTIME_DIR=/tmp/n7-f04a-runtime N7_WEB_PORT=18705 N7_APP_ORIGIN=http://127.0.0.1:18705
export N7_DISPATCH_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
if ! bash ../../scripts/check-port-conflicts.sh .; then
 # Explicit caller authorization permits reusing only this existing stack/port.
 test "$(docker ps --filter publish=18705 --format '{{.Names}}')" = n7f04a-web-1
 test "$(docker port n7f04a-web-1 3000/tcp)" = 127.0.0.1:18705
 echo 'PORT_REUSE: existing own n7f04a-web-1 exclusively owns 127.0.0.1:18705'
fi
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
date -u +"HEAVY_READY %Y-%m-%dT%H:%M:%SZ" | tee -a /tmp/n7-f04a-r1-run/progress.md
test ! -f /tmp/n7-f04a-r1-run/control.md || cat /tmp/n7-f04a-r1-run/control.md
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" | tee -a /tmp/n7-f04a-r1-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" | tee -a /tmp/n7-f04a-r1-run/progress.md
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f04a-web .
docker compose -p n7f04a up -d --no-build --wait
docker compose -p n7f04a exec -T web npm test
# Unmodified F01 harness must start early in a UTC minute.
second=$(date -u +%S);second=$((10#$second))
if [ "$second" -ge 15 ]; then sleep "$((60-second))"; fi
docker compose -p n7f04a exec -T web npm run test:integration
python3 scripts/check-f04a-r1-mutation.py
docker compose -p n7f04a exec -T web ./node_modules/.bin/tsx --test tests/replies-integration.test.ts
python3 scripts/check-f04a-r1-secrets.py
taskset -c "$N7_TASK_CPUS" npm audit --audit-level=high
python3 scripts/check-f04a-r1-snapshot.py
docker image inspect n7f04a-web --format 'IMAGE {{.Id}}'
docker compose -p n7f04a exec -T web node --version
