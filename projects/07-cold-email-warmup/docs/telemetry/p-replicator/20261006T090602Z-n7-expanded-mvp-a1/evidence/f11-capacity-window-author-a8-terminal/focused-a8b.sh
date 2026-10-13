#!/usr/bin/env bash
set -uo pipefail
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8 N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-implement-a8/database-ownership-lease.json
export NODE_OPTIONS='--import /tmp/n7-f11-context-implement-a8/guard-a8.mjs'
export F10_EVIDENCE_DIR=/tmp/n7-f11-context-implement-a8
node22=/tmp/n7-expanded-runtime-20261006/bin/node
"$node22" --import ./node_modules/tsx/dist/loader.mjs /tmp/n7-f11-context-implement-a8/preflight-new-a8.mjs > /tmp/n7-f11-context-implement-a8/preflight-new.log 2>&1
code=$?; echo "preflight_new=$code"; if [ "$code" -ne 0 ]; then exit "$code"; fi
"$node22" --import ./node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 tests/f11-body-protocol.test.ts tests/f11-context-integration.test.ts > /tmp/n7-f11-context-implement-a8/focused-a8b.log 2>&1
code=$?; echo "focused=$code"; exit "$code"
