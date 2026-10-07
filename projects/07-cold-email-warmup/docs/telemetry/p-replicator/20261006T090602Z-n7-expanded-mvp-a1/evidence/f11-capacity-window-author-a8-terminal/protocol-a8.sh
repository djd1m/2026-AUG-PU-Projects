#!/usr/bin/env bash
set -uo pipefail
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
export NODE_OPTIONS='--import /tmp/n7-f11-context-implement-a8/guard-a8.mjs'
/tmp/n7-expanded-runtime-20261006/bin/node --import ./node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 tests/f11-body-protocol.test.ts > /tmp/n7-f11-context-implement-a8/protocol-a8.log 2>&1
code=$?; echo "protocol=$code"; exit "$code"
