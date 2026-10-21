#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8 N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-verify-a11/database-ownership-lease.json
export N7_TEST_SCHEMA=$(cat /tmp/n7-f11-restart-post-ready-author-a40/schema-name)
export PGOPTIONS="-c search_path=$N7_TEST_SCHEMA"
export F10_EVIDENCE_DIR=/tmp/n7-f11-restart-post-ready-author-a40/$1
export NODE_OPTIONS='--import /tmp/n7-f11-restart-post-ready-author-a40/guard-a40.mjs --import /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/node_modules/tsx/dist/loader.mjs'
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec node --test --test-concurrency=1 --test-name-pattern="${N7_TARGET_PATTERN:-F11 A40}" tests/f10-runtime-protocol.test.ts
