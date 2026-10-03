#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f05b-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f05b N7_RUNTIME_DIR=/tmp/n7-f05b-runtime N7_WEB_PORT=18708 N7_APP_ORIGIN=http://127.0.0.1:18708
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
bash scripts/local-runtime.sh
bash ../../scripts/check-port-conflicts.sh .
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f05b-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f05b-run/progress.md
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
test "$(cat docs/telemetry/features/20261003T010600Z-f05/sol-b-type.exit)" = 0
test "$(cat docs/telemetry/features/20261003T010600Z-f05/sol-b-lint.exit)" = 0
test "$(cat docs/telemetry/features/20261003T010600Z-f05/sol-b-unit.exit)" = 0
taskset -c "$N7_TASK_CPUS" npm run build
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f05b-web .
docker compose -p n7f05b up -d --no-build --wait
python3 - <<'PY'
import json,subprocess,hashlib,datetime
from pathlib import Path
r=Path('.');e=r/'docs/telemetry/features/20261003T010600Z-f05'
data={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'ready','source_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'image_id':subprocess.check_output(['docker','image','inspect','n7f05b-web','--format','{{.Id}}'],text=True).strip(),'environment':'n7f05b loopback18708 privatePG','inputs':['local_test provider','own random runtime secrets','migration011'],'test_command':'docker compose -p n7f05b exec -T web npm run test:integration','environment_available':True,'evidence_root':str(e.resolve()),'expected_effects':['local fixture payments and entitlements only','test tenant resets'],'external_actions_executed':False,'e2e_claim':None}
(e/'sol-b-preflight.json').write_text(json.dumps(data,indent=2)+'\n')
PY
docker compose -p n7f05b exec -T web npm run test:integration
python3 scripts/check-f05b-mutation.py
docker compose -p n7f05b exec -T web npx tsx --test --test-concurrency=1 tests/evidence-integration.test.ts
python3 scripts/check-f05b-secrets.py
python3 scripts/check-f05b-snapshot.py
