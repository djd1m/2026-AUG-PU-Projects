#!/bin/bash
set -u
cd /tmp/n7-f10-implement-20261006/projects/07-cold-email-warmup
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export NODE_OPTIONS='--import /tmp/n7-f10-frozen-verify-a11/guard-v2.mjs'
exec 9>/tmp/codex-heavy-build.lock
flock -w 30 9 || exit 1
for check in guard-negative-v3 ipc-negative-v2 positive-tls-v2; do test "$(cat /tmp/n7-f10-frozen-verify-a11/$check.exit)" = 0 || exit 1; done
node /tmp/n7-f10-frozen-verify-a11/observer-v2.mjs > /tmp/n7-f10-frozen-verify-a11/observer-v2.log 2>&1 &
observer_pid=$!
date -u +'%Y-%m-%dT%H:%M:%S.%NZ' > /tmp/n7-f10-frozen-verify-a11/canonical-v2.started
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/expanded-mvp-04.test.ts > /tmp/n7-f10-frozen-verify-a11/canonical-v2.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/canonical-v2.exit
kill -TERM "$observer_pid"
wait "$observer_pid"
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/observer-v2.exit
npm test > /tmp/n7-f10-frozen-verify-a11/full-unit-v2.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/full-unit-v2.exit
