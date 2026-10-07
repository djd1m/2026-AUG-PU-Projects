#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a2/guard-a5.mjs"
export N7_GUARD_ROLE=ordinary_final_suite
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
npm run typecheck > /tmp/n7-f11-context-implement-a2/typecheck-a7.log 2>&1
rc=$?; echo "typecheck:$rc"; [ "$rc" = 0 ] || exit "$rc"
npm test > /tmp/n7-f11-context-implement-a2/all-unit-a7.log 2>&1
rc=$?; echo "allunit:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a2/preflight-a2.mjs > /tmp/n7-f11-context-implement-a2/preflight-a7.log 2>&1
rc=$?; echo "preflight:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/expanded-mvp-05.test.ts > /tmp/n7-f11-context-implement-a2/parent-a7.log 2>&1
rc=$?; echo "parent:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a2/preflight-a2.mjs > /tmp/n7-f11-context-implement-a2/final-db-quiescence.log 2>&1
rc=$?; echo "quiescence:$rc"; exit "$rc"
