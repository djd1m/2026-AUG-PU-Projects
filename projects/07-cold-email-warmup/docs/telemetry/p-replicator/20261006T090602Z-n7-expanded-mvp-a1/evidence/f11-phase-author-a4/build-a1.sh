#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a4/guard-a4.mjs"
export N7_GUARD_ROLE=ordinary_a4_build
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
for step in typecheck lint build; do
 npm run "$step" > "/tmp/n7-f11-context-implement-a4/$step-a1.log" 2>&1
 rc=$?; echo "$step:$rc"; [ "$rc" = 0 ] || exit "$rc"
done
