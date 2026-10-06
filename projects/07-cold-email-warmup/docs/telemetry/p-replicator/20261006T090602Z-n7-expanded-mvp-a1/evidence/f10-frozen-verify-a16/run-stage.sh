#!/usr/bin/env bash
set -uo pipefail
source /tmp/n7-f09-verify-a2/env.sh
export DATABASE_NAME=n7f10_a2 TMPDIR=/tmp/n7-f10-frozen-verify-a16 F10_EVIDENCE_DIR=/tmp/n7-f10-frozen-verify-a16 NODE_OPTIONS='--import /tmp/n7-f10-frozen-verify-a16/guard-v3.mjs --import /tmp/n7-f10-frozen-verify-a16/suite-output.mjs'
export PATH=/tmp/n7-expanded-runtime-20261006/bin:$PATH
stage=$1
shift
cd /tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup
node /tmp/n7-f10-frozen-verify-a16/db-assert.mjs || exit $?
python3 /tmp/n7-f10-frozen-verify-a16/preflight.py "$stage" "$@" || exit $?
exec 9>/tmp/codex-heavy-build.lock
flock -w 30 9 || exit $?
python3 - "$stage" <<'PY2'
from pathlib import Path
import os,json,datetime,sys
r=Path('/tmp/n7-f10-frozen-verify-a16');p=os.getppid();st=Path('/proc/'+str(p)+'/stat').read_text().split(') ')[1].split()[19];(r/(sys.argv[1]+'-pid.json')).write_text(json.dumps({'pid':p,'startticks':st,'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mutex':'held'})+'\n')
PY2
"$@" >"/tmp/n7-f10-frozen-verify-a16/$stage.tap" 2>"/tmp/n7-f10-frozen-verify-a16/$stage.stderr"
code=$?
printf '%s\n' "$code" >"/tmp/n7-f10-frozen-verify-a16/$stage.exit"
flock -u 9
python3 - "$stage" "$code" <<'PY2'
from pathlib import Path
import json,datetime,sys
r=Path('/tmp/n7-f10-frozen-verify-a16');(r/(sys.argv[1]+'-terminal.json')).write_text(json.dumps({'ended':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':int(sys.argv[2]),'mutex':'released'})+'\n')
PY2
exit "$code"
