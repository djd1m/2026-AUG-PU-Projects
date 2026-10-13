#!/bin/bash
set -u
python3 - <<'MARK'
import os,json,pathlib,datetime
pid=os.getppid();pathlib.Path('/tmp/n7-f11-context-implement-a4/owned-checks-a2.json').write_text(json.dumps({'pid':pid,'startticks':pathlib.Path(f'/proc/{pid}/stat').read_text().split()[21],'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
MARK
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a4/guard-a4.mjs"
export N7_GUARD_ROLE=ordinary_a4_checks_corrected
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
node --import tsx /tmp/n7-f11-context-implement-a4/preflight-a4.mjs > /tmp/n7-f11-context-implement-a4/preflight-a2.log 2>&1
rc=$?; echo "preflight:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/f11-context-unit.test.ts > /tmp/n7-f11-context-implement-a4/unit-a2.log 2>&1
rc=$?; echo "unit:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx --test --test-concurrency=1 tests/expanded-mvp-05.test.ts > /tmp/n7-f11-context-implement-a4/parent-a2.log 2>&1
rc=$?; echo "parent:$rc"; [ "$rc" = 0 ] || exit "$rc"
node --import tsx /tmp/n7-f11-context-implement-a4/preflight-a4.mjs > /tmp/n7-f11-context-implement-a4/quiescence-a2.log 2>&1
rc=$?; echo "quiescence:$rc"; exit "$rc"
