#!/usr/bin/env bash
set -uo pipefail
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
source /tmp/n7-f09-verify-a2/env.sh
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export DATABASE_NAME=n7f11_a8 N7_DB_OWNERSHIP_LEASE=/tmp/n7-f11-context-verify-a9/database-ownership-lease.json
export F10_EVIDENCE_DIR=/tmp/n7-f11-context-verify-a9 NODE_OPTIONS='--import /tmp/n7-f11-context-verify-a9/guard-a9.mjs'
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 73
node --import ./node_modules/tsx/dist/loader.mjs /tmp/n7-f11-context-verify-a9/preflight-a9.mjs > /tmp/n7-f11-context-verify-a9/preflight-native.log 2>&1
code=$?
if [ "$code" -ne 0 ]; then echo "preflight_exit=$code"; exit "$code"; fi
node -e "require('fs').writeFileSync('/tmp/n7-f11-context-verify-a9/load-start.json',JSON.stringify({utc:new Date().toISOString(),wrapperPid:process.ppid,node:process.version})+'\n')"
timeout --signal=TERM --kill-after=20s 390s node --import ./node_modules/tsx/dist/loader.mjs --test --test-concurrency=1 --test-name-pattern='^F11 ALL30 both2800ms phases preserve complete headers and existing fleet lanes full300s$' tests/f10-runtime-protocol.test.ts > /tmp/n7-f11-context-verify-a9/load-native.log 2>&1
code=$?
node -e "require('fs').writeFileSync('/tmp/n7-f11-context-verify-a9/load-exit.json',JSON.stringify({utc:new Date().toISOString(),exit:Number(process.argv[1])})+'\n')" "$code"
echo "load_native_exit=$code"
exit "$code"
