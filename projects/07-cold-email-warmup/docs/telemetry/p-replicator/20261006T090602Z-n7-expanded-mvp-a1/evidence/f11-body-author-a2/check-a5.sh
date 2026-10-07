#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a2/guard-a5.mjs"
export N7_GUARD_ROLE=ordinary_affected_regression
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
N7_GUARD_ROLE=negative_guard_probe node /tmp/n7-f11-context-implement-a2/guard-probe-a5.mjs > /tmp/n7-f11-context-implement-a2/guard-probe-a5.log 2>&1
rc=$?; echo "guardprobe:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 --test-name-pattern='IMAP|fragmented literals|same UID coverage|receive line bound|transport secrets' tests/f09-live-protocol.test.ts > /tmp/n7-f11-context-implement-a2/f09-a5.log 2>&1
rc=$?; echo "f09:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a2/preflight-a2.mjs > /tmp/n7-f11-context-implement-a2/preflight-a5.log 2>&1
rc=$?; echo "preflight:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/replies-integration.test.ts > /tmp/n7-f11-context-implement-a2/replies-a5.log 2>&1
rc=$?; echo "reply:$rc"; exit "$rc"
