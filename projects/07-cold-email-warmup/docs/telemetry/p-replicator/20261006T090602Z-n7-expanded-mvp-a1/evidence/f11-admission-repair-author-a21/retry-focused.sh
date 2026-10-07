#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8 N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-verify-a11/database-ownership-lease.json
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS='--import /tmp/n7-f11-admission-repair-author-a21/guard-a21.mjs --import /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/node_modules/tsx/dist/loader.mjs'
export N7_TEST_SCHEMA=n7_a21_checks_261007032200 PGOPTIONS='-c search_path=n7_a21_checks_261007032200'
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
node /tmp/n7-f11-admission-repair-author-a21/migrate.mjs > /tmp/n7-f11-admission-repair-author-a21/migrate.log 2>&1
code=$?; printf '%s\n' "$code" > /tmp/n7-f11-admission-repair-author-a21/migrate-exit.txt
if [ "$code" != 0 ]; then exit "$code"; fi
node --test --test-name-pattern '^F11 durable purpose admission' tests/f10-runtime-protocol.test.ts > /tmp/n7-f11-admission-repair-author-a21/focused-retry.log 2>&1
code=$?; printf '%s\n' "$code" > /tmp/n7-f11-admission-repair-author-a21/focused-retry-exit.txt
date -u +%Y-%m-%dT%H:%M:%S.%NZ > /tmp/n7-f11-admission-repair-author-a21/focused-retry-joined.txt
exit "$code"
