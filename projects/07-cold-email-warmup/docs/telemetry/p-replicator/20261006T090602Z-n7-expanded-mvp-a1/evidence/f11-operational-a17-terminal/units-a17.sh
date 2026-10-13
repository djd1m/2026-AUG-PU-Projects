#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import /tmp/n7-f11-context-verify-a17/guard-a17.mjs --import /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/node_modules/tsx/dist/loader.mjs"
unset PGOPTIONS N7_TEST_SCHEMA
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 73
date -u +%Y-%m-%dT%H:%M:%S.%NZ > /tmp/n7-f11-context-verify-a17/units-start.txt
timeout --signal=TERM --kill-after=5s 90s node --test --test-concurrency=1 tests/auth-script-unit.test.ts tests/auth-unit.test.ts tests/billing-unit.test.ts tests/capacity-unit.test.ts tests/diagnostics-deadline-unit.test.ts tests/diagnostics-unit.test.ts tests/dispatch-unit.test.ts tests/evidence-unit.test.ts tests/f09-transport-unit.test.ts tests/f10-runtime-unit.test.ts tests/f11-context-unit.test.ts tests/mailboxes-unit.test.ts tests/replies-unit.test.ts tests/submission-unit.test.ts tests/suppression-unit.test.ts tests/web-unit.test.ts tests/f11-body-protocol.test.ts > /tmp/n7-f11-context-verify-a17/units-native.log 2>&1
unit_code=$?
printf '%s\n' "$unit_code" > /tmp/n7-f11-context-verify-a17/units-native-exit.txt
date -u +%Y-%m-%dT%H:%M:%S.%NZ > /tmp/n7-f11-context-verify-a17/units-joined.txt
flock -u 9
exit "$unit_code"
