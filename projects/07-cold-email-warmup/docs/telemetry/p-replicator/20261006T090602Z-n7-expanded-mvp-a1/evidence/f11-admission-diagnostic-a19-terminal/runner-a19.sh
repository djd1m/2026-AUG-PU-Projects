#!/bin/bash
set -u
mode="$1"
case "$mode" in
unusedshort) schema=n7_a19_short_261007025228; title='^F11 short compiled worker SIGTERM while native BODY physically claimed$'; bound=60s;;
fault) schema=n7_a19_fault_261007025228; title='^F11 ALL30 finite native BODY fault recovers both2800ms phases full300s$'; bound=390s;;
*) exit 64;;
esac
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8
export N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-verify-a11/database-ownership-lease.json
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export N7_TEST_SCHEMA="$schema"
export PGOPTIONS="-c search_path=$schema"
export F10_EVIDENCE_DIR="/tmp/n7-f11-context-verify-a19/$mode"
export NODE_OPTIONS="--import /tmp/n7-f11-context-verify-a19/guard-a19.mjs --import /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/node_modules/tsx/dist/loader.mjs"
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 73
cat /proc/$$/stat > "$F10_EVIDENCE_DIR/runner-proc-stat.txt"
date -u +%Y-%m-%dT%H:%M:%S.%NZ > "$F10_EVIDENCE_DIR/launcher-start.txt"
timeout --signal=TERM --kill-after=5s "$bound" node --test --test-name-pattern "$title" tests/f10-runtime-protocol.test.ts > "$F10_EVIDENCE_DIR/native.log" 2>&1
native_code=$?
printf '%s\n' "$native_code" > "$F10_EVIDENCE_DIR/native-exit.txt"
date -u +%Y-%m-%dT%H:%M:%S.%NZ > "$F10_EVIDENCE_DIR/actual-joined.txt"
flock -u 9
exit "$native_code"
