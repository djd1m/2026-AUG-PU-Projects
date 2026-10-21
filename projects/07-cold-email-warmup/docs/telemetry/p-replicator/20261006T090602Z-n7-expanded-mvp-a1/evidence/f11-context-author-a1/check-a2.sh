#!/bin/bash
set -u
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a1/guard-a1.mjs"
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
node --import tsx --input-type=module -e 'import {loadConfig} from "./src/config.ts"; import {createPool} from "./src/db.ts"; const p=createPool(loadConfig().databaseUrl);try {const d=(await p.query("SELECT current_database() AS db")).rows[0].db;if(d!=="n7f10_a2")throw Error("fixture_database_denied");const n=(await p.query("SELECT count(*)::integer AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")).rows[0].n;const occupied=Number((await p.query("SELECT count(*) AS n FROM transport_operation WHERE operation IS NOT NULL")).rows[0].n),claims=Number((await p.query("SELECT count(*) AS n FROM runtime_due WHERE state='claimed'")).rows[0].n);if(occupied||claims)throw Error("fixture_slots_not_quiescent");console.log(JSON.stringify({db:d,otherSessions:n,occupied,claims}));if(n!==0)throw Error("fixture_not_quiescent");} finally {await p.end();}' > /tmp/n7-f11-context-implement-a1/preflight.log 2>&1
rc=$?; echo "preflight:$rc"; [ "$rc" = 0 ] || exit "$rc"
for check in typecheck lint; do
 npm run "$check" > "/tmp/n7-f11-context-implement-a1/$check.log" 2>&1
 rc=$?; echo "$check:$rc"; [ "$rc" = 0 ] || exit "$rc"
done
node --import tsx --test --test-concurrency=1 tests/f11-context-unit.test.ts > /tmp/n7-f11-context-implement-a1/unit-a2.log 2>&1
rc=$?; echo "unit:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/f11-context-integration.test.ts > /tmp/n7-f11-context-implement-a1/pg-a2.log 2>&1
rc=$?; echo "pg:$rc"; exit "$rc"
