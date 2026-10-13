#!/bin/bash
set -u
python3 - <<'MARK'
import os,json,pathlib,datetime
pid=os.getppid();pathlib.Path('/tmp/n7-f11-context-implement-a6/owned-checks-final.json').write_text(json.dumps({'pid':pid,'startticks':pathlib.Path(f'/proc/{pid}/stat').read_text().split()[21],'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
MARK
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a6/guard-a6.mjs"
export N7_GUARD_ROLE=ordinary_a6_focused
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
node --import tsx /tmp/n7-f11-context-implement-a6/preflight-a6.mjs > /tmp/n7-f11-context-implement-a6/preflight-final.log 2>&1
rc=$?; echo "preflight:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a6/setup-a6.mjs > /tmp/n7-f11-context-implement-a6/setup-final.log 2>&1
rc=$?; echo "setup:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/f11-context-integration.test.ts tests/f11-body-protocol.test.ts > /tmp/n7-f11-context-implement-a6/focused-final.log 2>&1
rc=$?; echo "focused:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a6/preflight-a6.mjs > /tmp/n7-f11-context-implement-a6/quiescence-focused-final.log 2>&1
rc=$?; echo "quiescence-focused:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/f10-runtime-integration.test.ts > /tmp/n7-f11-context-implement-a6/runtime-pg-final.log 2>&1
rc=$?; echo "runtime-pg:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a6/preflight-a6.mjs > /tmp/n7-f11-context-implement-a6/quiescence-runtime-final.log 2>&1
rc=$?; echo "quiescence-runtime:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/expanded-mvp-05.test.ts > /tmp/n7-f11-context-implement-a6/parent-final.log 2>&1
rc=$?; echo "parent:$rc"; [ "$rc" = 0 ] || exit "$rc"
npm test > /tmp/n7-f11-context-implement-a6/unit-final.log 2>&1
rc=$?; echo "unit:$rc"
node --import tsx /tmp/n7-f11-context-implement-a6/preflight-a6.mjs > /tmp/n7-f11-context-implement-a6/quiescence-final.log 2>&1
qc=$?; echo "quiescence:$qc"; [ "$qc" = 0 ] || exit "$qc"; exit "$rc"
