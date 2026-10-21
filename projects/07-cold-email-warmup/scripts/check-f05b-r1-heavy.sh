#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f /tmp/n7-f05b-r1-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f05b N7_RUNTIME_DIR=/tmp/n7-f05b-runtime N7_WEB_PORT=18708 N7_APP_ORIGIN=http://127.0.0.1:18708
export N7_DISPATCH_MODE=local_test N7_POLL_MODE=local_test N7_BILLING_MODE=local_test MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
EVIDENCE=docs/telemetry/features/20261003T010600Z-f05
# Inspect only the existing owned stack and verify its immutable donor inputs before rebuilding.
python3 - <<'PY'
import json,subprocess
from pathlib import Path
run=lambda a:subprocess.check_output(a,text=True).strip()
ids=run(['docker','ps','-q','--filter','label=com.docker.compose.project=n7f05b']).splitlines()
assert len(ids)==2,'expected own web/db only'
containers=json.loads(run(['docker','inspect',*ids]));proof=[]
for c in containers:
 labels=c['Config']['Labels'];assert labels['com.docker.compose.project']=='n7f05b'
 service=labels['com.docker.compose.service'];assert service in ['web','db']
 if service=='db':assert not c['HostConfig']['PortBindings'],'DB must have no host port'
 else:
  assert c['HostConfig']['PortBindings']=={'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'18708'}]}
  expected=json.loads(Path('docs/telemetry/features/20261003T010600Z-f05/sol-b-source-image.json').read_text())
  assert c['Image']==expected['image_id']
  copied=run(['docker','exec',c['Id'],'sha256sum',*expected['source_files']])
  assert {line.split()[1]:line.split()[0] for line in copied.splitlines()}==expected['source_files'],'old donor source drift'
 proof.append({'id':c['Id'],'service':service,'image':c['Image'],'ports':c['HostConfig']['PortBindings']})
Path('docs/telemetry/features/20261003T010600Z-f05/sol-b-r1-ownstack-before.json').write_text(json.dumps(proof,indent=2)+'\n')
PY
bash ../../scripts/check-port-conflicts.sh . > "$EVIDENCE/sol-b-r1-port.txt" 2>&1 || {
 # The pre-existing own web is the only allowed conflict; validate the host port owner.
 python3 - <<'PY'
import json,subprocess
ids=subprocess.check_output(['docker','ps','-q','--filter','publish=18708'],text=True).split()
assert len(ids)==1
c=json.loads(subprocess.check_output(['docker','inspect',ids[0]],text=True))[0]
assert c['Config']['Labels']['com.docker.compose.project']=='n7f05b'
assert c['Config']['Labels']['com.docker.compose.service']=='web'
PY
}
test "$(df -Pk . | awk 'NR==2 {print $4}')" -ge 1500000
test "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" -ge 2500000
exec 9>/tmp/codex-heavy-build.lock
flock -w 1 9
trap 'date -u +"HEAVY_RELEASED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f05b-r1-run/progress.md; flock -u 9' EXIT
date -u +"HEAVY_ACQUIRED %Y-%m-%dT%H:%M:%SZ" >> /tmp/n7-f05b-r1-run/progress.md
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
for check in type lint unit; do test "$(cat "$EVIDENCE/sol-b-r1-$check.exit")" = 0; done
taskset -c "$N7_TASK_CPUS" npm run build > "$EVIDENCE/sol-b-r1-build.txt" 2>&1
printf '0\n' > "$EVIDENCE/sol-b-r1-build.exit"
DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f05b-web .
docker compose -p n7f05b up -d --no-build --wait
python3 - <<'PY'
import json,subprocess,hashlib,datetime
from pathlib import Path
r=Path('.');e=r/'docs/telemetry/features/20261003T010600Z-f05'
source=json.loads((e/'sol-b-r1-frozen-source.json').read_text())
data={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'ready','source_revision':source['source_revision'],'build_revision':source['source_revision'],'source_sha256':source['source_sha256'],'image_id':subprocess.check_output(['docker','image','inspect','n7f05b-web','--format','{{.Id}}'],text=True).strip(),'environment':'n7f05b loopback18708 privatePG','inputs':[{'name':'local_test provider','available':True},{'name':'own existing random runtime secrets','available':True},{'name':'migration011','available':True}],'test_command':'docker compose -p n7f05b exec -T web npm run test:integration','environment_available':True,'evidence_root':{'root':'project','path':'docs/telemetry/features/20261003T010600Z-f05'},'expected_effects':['local fixture payments and entitlements only','test tenant resets'],'external_actions_executed':False,'e2e_claim':None}
data['build_sha256']=hashlib.sha256(json.dumps({str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(r.glob('dist/**/*.js'))},sort_keys=True).encode()).hexdigest()
(e/'sol-b-r1-preflight-full.json').write_text(json.dumps(data,indent=2)+'\n')
PY
date -u +"ACTUAL_READY %Y-%m-%dT%H:%M:%SZ fullPG exact preflight ready" >> /tmp/n7-f05b-r1-run/progress.md
docker compose -p n7f05b exec -T web npm run test:integration > "$EVIDENCE/sol-b-r1-full-pg.txt" 2>&1
printf '0\n' > "$EVIDENCE/sol-b-r1-full-pg.exit"
python3 - <<'PY'
import json,datetime
from pathlib import Path
e=Path('docs/telemetry/features/20261003T010600Z-f05');p=json.loads((e/'sol-b-r1-preflight-full.json').read_text());p['at']=datetime.datetime.now(datetime.timezone.utc).isoformat();p['test_command']='docker compose -p n7f05b exec -T web npx tsx --test --test-concurrency=1 tests/evidence-integration.test.ts';p['expected_effects']=['three temporary F1/F2 source mutants in own container, test tenant reset, byte restore; final affected green'];(e/'sol-b-r1-preflight-targeted.json').write_text(json.dumps(p,indent=2)+'\n')
PY
python3 scripts/check-f05b-r1-mutation.py
docker compose -p n7f05b exec -T web npx tsx --test --test-concurrency=1 tests/evidence-integration.test.ts > "$EVIDENCE/sol-b-r1-restored-green.txt" 2>&1
printf '0\n' > "$EVIDENCE/sol-b-r1-restored-green.exit"
python3 scripts/check-f05b-r1-secrets.py
python3 scripts/check-f05b-r1-snapshot.py
