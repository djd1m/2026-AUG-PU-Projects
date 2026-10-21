#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a4/guard-a4.mjs"
export N7_GUARD_ROLE=ordinary_a4_checks
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
node --import tsx /tmp/n7-f11-context-implement-a4/preflight-a4.mjs > /tmp/n7-f11-context-implement-a4/preflight-a1.log 2>&1
rc=$?; echo "preflight:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/f11-context-unit.test.ts tests/f10-runtime-unit.test.ts > /tmp/n7-f11-context-implement-a4/unit-a1.log 2>&1
rc=$?; echo "unit:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/expanded-mvp-05.test.ts > /tmp/n7-f11-context-implement-a4/parent-a1.log 2>&1
rc=$?; echo "parent:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/f10-runtime-integration.test.ts > /tmp/n7-f11-context-implement-a4/runtime-pg-a1.log 2>&1
rc=$?; echo "runtime-pg:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a4/preflight-a4.mjs > /tmp/n7-f11-context-implement-a4/quiescence-a1.log 2>&1
rc=$?; echo "quiescence:$rc"; exit "$rc"
