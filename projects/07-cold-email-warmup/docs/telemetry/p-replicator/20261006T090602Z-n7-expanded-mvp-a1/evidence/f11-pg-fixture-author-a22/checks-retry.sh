#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f11_a8 N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-verify-a11/database-ownership-lease.json
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS='--import /tmp/n7-f11-pg-fixture-author-a22/guard-a22.mjs --import /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup/node_modules/tsx/dist/loader.mjs'
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 73
node node_modules/typescript/bin/tsc --noEmit > /tmp/n7-f11-pg-fixture-author-a22/types-retry.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f11-pg-fixture-author-a22/types-retry-exit.txt
node node_modules/eslint/bin/eslint.js tests/capacity-integration.test.ts tests/f10-runtime-protocol.test.ts > /tmp/n7-f11-pg-fixture-author-a22/lint-retry.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f11-pg-fixture-author-a22/lint-retry-exit.txt
node /tmp/n7-f11-pg-fixture-author-a22/schema-retry-setup.mjs > /tmp/n7-f11-pg-fixture-author-a22/schema-retry-setup.log 2>&1
code=$?; printf '%s\n' "$code" > /tmp/n7-f11-pg-fixture-author-a22/setup-retry-exit.txt
if [ "$code" != 0 ]; then exit "$code"; fi
export N7_TEST_SCHEMA=n7_a22_checks_261007032256 PGOPTIONS='-c search_path=n7_a22_checks_261007032256'
node --test --test-name-pattern '^F07 real PostgreSQL capacity boundaries and atomic safety$' tests/capacity-integration.test.ts > /tmp/n7-f11-pg-fixture-author-a22/capacity-retry.log 2>&1
code=$?; printf '%s\n' "$code" > /tmp/n7-f11-pg-fixture-author-a22/capacity-retry-exit.txt
node /tmp/n7-f11-pg-fixture-author-a22/terminal-retry-db-readonly.mjs > /tmp/n7-f11-pg-fixture-author-a22/terminal-retry.log 2>&1
printf '%s\n' "$?" > /tmp/n7-f11-pg-fixture-author-a22/terminal-retry-exit.txt
date -u +%Y-%m-%dT%H:%M:%S.%NZ > /tmp/n7-f11-pg-fixture-author-a22/checks-retry-joined.txt
exit "$code"
