#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f05a-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f05a N7_RUNTIME_DIR=/tmp/n7-f05a-runtime N7_WEB_PORT=18707 N7_APP_ORIGIN=http://127.0.0.1:18707
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
bash ../../scripts/check-port-conflicts.sh .
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f05a-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f05a-run/progress.md
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
taskset -c "$N7_TASK_CPUS" npm run typecheck
taskset -c "$N7_TASK_CPUS" npm run lint
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f05a-web .
docker compose -p n7f05a up -d --no-build --wait
python3 - <<'PY'
import json,subprocess,hashlib,datetime
from pathlib import Path
r=Path('.');e=r/'docs/telemetry/features/20261003T010600Z-f05'
data={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'ready','source_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'image_id':subprocess.check_output(['docker','image','inspect','n7f05a-web','--format','{{.Id}}'],text=True).strip(),'environment':'n7f05a loopback18707 privatePG','inputs':['local_test provider','own random runtime secrets','migration010'],'test_command':'docker compose -p n7f05a exec -T web npm run test:integration','environment_available':True,'expected_effects':['local fixture payments and entitlements only','test tenant resets'],'external_actions_executed':False,'e2e_claim':None}
(e/'sol-a-preflight.json').write_text(json.dumps(data,indent=2)+'\n')
PY
docker compose -p n7f05a exec -T web npm test
docker compose -p n7f05a exec -T web npm run test:integration
python3 scripts/check-f05a-mutation.py
docker compose -p n7f05a exec -T web npm run test:f05a
python3 scripts/check-f05a-secrets.py
python3 scripts/check-f05a-snapshot.py
