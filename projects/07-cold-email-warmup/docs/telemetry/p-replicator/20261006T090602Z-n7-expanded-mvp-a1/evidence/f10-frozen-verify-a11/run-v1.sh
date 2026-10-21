#!/bin/bash
set -u
cd /tmp/n7-f10-implement-20261006/projects/07-cold-email-warmup
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export NODE_OPTIONS='--import /tmp/n7-f10-frozen-verify-a11/guard.mjs'
exec 9>/tmp/codex-heavy-build.lock
flock -w 30 9 || exit 1
if [ "$(cat /tmp/n7-f10-frozen-verify-a11/guard-negative-v1.exit)" != 0 ] || [ "$(cat /tmp/n7-f10-frozen-verify-a11/ipc-negative-v1.exit)" != 0 ]; then exit 1; fi
node --input-type=module - <<'JS'
import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {createRequire} from 'node:module';assert.equal(writeFile,createRequire(import.meta.url)('node:fs/promises').writeFile);console.log('canonical output redirect binding confirmed');
JS
node /tmp/n7-f10-frozen-verify-a11/observer.mjs > /tmp/n7-f10-frozen-verify-a11/observer-v1.log 2>&1 &
observer_pid=$!
date -u +'%Y-%m-%dT%H:%M:%S.%NZ' > /tmp/n7-f10-frozen-verify-a11/canonical-v1.started
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 tests/expanded-mvp-04.test.ts > /tmp/n7-f10-frozen-verify-a11/canonical-v1.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/canonical-v1.exit
kill -TERM "$observer_pid"
wait "$observer_pid"
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/observer-v1.exit
npm test > /tmp/n7-f10-frozen-verify-a11/full-unit-v1.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/full-unit-v1.exit
npm run test:integration > /tmp/n7-f10-frozen-verify-a11/full-pg-v1.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/full-pg-v1.exit
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-name-pattern='suspended transport|native ambiguous' tests/f10-runtime-protocol.test.ts > /tmp/n7-f10-frozen-verify-a11/physical-v1.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/physical-v1.exit
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=1 --test-name-pattern='transport grants|final live submission|UID reset|independent capacity|expired slot age' tests/f09-live-transport.test.ts > /tmp/n7-f10-frozen-verify-a11/f09-native-v1.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f10-frozen-verify-a11/f09-native-v1.exit
