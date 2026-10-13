#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f04b-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f04b N7_RUNTIME_DIR=/tmp/n7-f04b-runtime N7_WEB_PORT=18706 N7_APP_ORIGIN=http://127.0.0.1:18706
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
cat /tmp/n7-f04b-r1-run/control.md
if ! bash ../../scripts/check-port-conflicts.sh .; then
 test "$(docker ps --filter publish=18706 --format '{{.Names}}')" = n7f04b-web-1
 test "$(docker port n7f04b-web-1 3000/tcp)" = 127.0.0.1:18706
 echo 'PORT_REUSE own n7f04b-web-1 exclusively owns 127.0.0.1:18706'
fi
test "$(docker inspect n7f04b-web-1 --format '{{index .Config.Labels "com.docker.compose.project"}}')" = n7f04b
test "$(docker inspect n7f04b-db-1 --format '{{index .Config.Labels "com.docker.compose.project"}}')" = n7f04b
test "$(sha256sum package-lock.json | cut -d' ' -f1)" = "$(sha256sum /tmp/n7-f03b-sol/projects/07-cold-email-warmup/package-lock.json | cut -d' ' -f1)"
test "$(readlink -f node_modules)" = /tmp/n7-f03b-sol/projects/07-cold-email-warmup/node_modules
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
date -u +"HEAVY_READY %Y-%m-%dT%H:%M:%SZ" | tee -a /tmp/n7-f04b-r1-run/progress.md
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" | tee -a /tmp/n7-f04b-r1-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" | tee -a /tmp/n7-f04b-r1-run/progress.md
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
check() { echo "COMMAND: $*"; "$@"; echo 'EXIT: 0'; }
check taskset -c "$N7_TASK_CPUS" npm run typecheck
check taskset -c "$N7_TASK_CPUS" npm run lint
check taskset -c "$N7_TASK_CPUS" npm run build
check env DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f04b-web .
check docker compose -p n7f04b up -d --no-build --wait
printf 'E2E_PREFLIGHT ready: exact committed source plus build; own n7f04b PG16/Node22; no external provider; seed/poll local durable effects; commands below; evidence sol-b-r1-heavy.txt\n'
check docker compose -p n7f04b exec -T web npm test
second=$(date -u +%S);second=$((10#$second))
if [ "$second" -ge 15 ]; then sleep "$((60-second))"; fi
check docker compose -p n7f04b exec -T web npm run test:integration
check python3 scripts/check-f04b-r1-mutation.py
check docker compose -p n7f04b exec -T web ./node_modules/.bin/tsx --test tests/suppression-owner-integration.test.ts
check python3 scripts/check-f04b-r1-secrets.py
check python3 scripts/check-f04b-r1-snapshot.py
check docker compose -p n7f04b exec -T db psql -U n7 -d n7 -Atc 'SELECT version FROM schema_migration ORDER BY version'
check docker compose -p n7f04b exec -T web node --version
