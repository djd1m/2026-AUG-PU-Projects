#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a2/guard-a2.mjs"
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
for check in typecheck lint build; do
 python3 -c 'import os; s=os.statvfs("/tmp"); assert s.f_bavail*s.f_frsize>=2147483648' || exit 78
 npm run "$check" > "/tmp/n7-f11-context-implement-a2/$check-a1.log" 2>&1
 rc=$?; echo "$check:$rc"; [ "$rc" = 0 ] || exit "$rc"
done
node --import tsx --test --test-concurrency=1 tests/f11-context-unit.test.ts tests/f11-body-protocol.test.ts > /tmp/n7-f11-context-implement-a2/unit-a1.log 2>&1
rc=$?; echo "unit:$rc"; exit "$rc"
