#!/usr/bin/env bash
set -uo pipefail
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
source /tmp/n7-f09-verify-a2/env.sh
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export DATABASE_NAME=n7f11_a8 N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-fleet-seed-author-a10/database-ownership-lease.json F10_EVIDENCE_DIR=/tmp/n7-f11-fleet-seed-author-a10 NODE_OPTIONS='--import /tmp/n7-f11-fleet-seed-author-a10/guard-a10.mjs'
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 73
node --import ./node_modules/tsx/dist/loader.mjs /tmp/n7-f11-fleet-seed-author-a10/seed-proof-a10.mjs > /tmp/n7-f11-fleet-seed-author-a10/seed-native.log 2>&1
code=$?
node -e "require('fs').writeFileSync('/tmp/n7-f11-fleet-seed-author-a10/native-exit.json',JSON.stringify({utc:new Date().toISOString(),exit:Number(process.argv[1])})+'\n')" "$code"
echo "seed_native_exit=$code"
exit "$code"
