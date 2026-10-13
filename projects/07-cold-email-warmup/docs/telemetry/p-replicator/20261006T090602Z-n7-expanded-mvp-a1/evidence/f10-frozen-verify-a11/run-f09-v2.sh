#!/bin/bash
set -u
cd /tmp/n7-f10-implement-20261006/projects/07-cold-email-warmup
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export NODE_OPTIONS='--import /tmp/n7-f10-frozen-verify-a11/guard-v2.mjs'
exec 9>/tmp/codex-heavy-build.lock
flock -w 20 9 || exit 1
date -u +'%Y-%m-%dT%H:%M:%S.%NZ' > /tmp/n7-f10-frozen-verify-a11/f09-native-v2.started
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-name-pattern='transport grants|final live submission|UID reset|independent capacity|expired slot age' tests/f09-live-transport.test.ts > /tmp/n7-f10-frozen-verify-a11/f09-native-v2.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/f09-native-v2.exit
