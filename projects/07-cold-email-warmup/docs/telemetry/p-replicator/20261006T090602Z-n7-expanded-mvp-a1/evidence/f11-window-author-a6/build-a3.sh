#!/bin/bash
set -u
python3 - <<'MARK'
import os,json,pathlib,datetime
pid=os.getppid();pathlib.Path('/tmp/n7-f11-context-implement-a6/owned-build-a3.json').write_text(json.dumps({'pid':pid,'startticks':pathlib.Path(f'/proc/{pid}/stat').read_text().split()[21],'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
MARK
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
export NODE_OPTIONS="--import=/tmp/n7-f11-context-implement-a6/guard-a6.mjs"
export N7_GUARD_ROLE=ordinary_a4_build_corrected
cd /tmp/n7-f11-context-20261006-a1/projects/07-cold-email-warmup
exec 9>/tmp/codex-heavy-build.lock
flock -n 9 || exit 79
for step in typecheck lint build; do
 npm run "$step" > "/tmp/n7-f11-context-implement-a6/$step-a3.log" 2>&1
 rc=$?; echo "$step:$rc"; [ "$rc" = 0 ] || exit "$rc"
done
