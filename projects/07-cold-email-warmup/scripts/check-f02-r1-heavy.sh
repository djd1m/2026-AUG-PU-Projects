#!/usr/bin/env bash
# Same heavy commands as check-f02-heavy.sh; verify the already-owned n7f02 port.
set -euo pipefail
cd "$(dirname "$0")/.."
evidence=docs/telemetry/features/20261002T201500Z-f02/evidence/r1
run() { printf 'Command:'; printf ' %q' "$@"; printf '\n'; local result=0; "$@" || result=$?; printf 'Exit: %s\n' "$result"; return "$result"; }
test -f /tmp/n7-f02-heavy.allowed
export COMPOSE_PROJECT_NAME=n7f02 N7_RUNTIME_DIR=/tmp/n7-f02-runtime N7_WEB_PORT=18702 N7_APP_ORIGIN=http://127.0.0.1:18702
export MAIL_PROVIDER_ALLOWLIST='{"smtp.gmail.com":30,"imap.gmail.com":30}'
for filename in session-key db-password credential-keyring.json; do test -r "$N7_RUNTIME_DIR/$filename"; done
port_exit=0
bash ../../scripts/check-port-conflicts.sh . > "$evidence/port-check.txt" 2>&1 || port_exit=$?
printf 'Generic port check exit: %s\n' "$port_exit"
test "$port_exit" -eq 1
python3 - <<'PY'
import json,subprocess
from pathlib import Path
config=json.loads(subprocess.check_output(['docker','compose','-p','n7f02','config','--format','json']))
services=config['services']
assert not services['db'].get('ports')
assert float(services['web']['cpus'])==float(services['db']['cpus'])==2
ports=services['web']['ports']
assert len(ports)==1 and str(ports[0]['published'])=='18702' and ports[0]['host_ip']=='127.0.0.1' and ports[0]['target']==3000
assert set(services)=={'db','web'}
assert config['networks']['n7']['name']=='n7f02_network' and config['volumes']['n7_pg']['name']=='n7f02_pg'
ids=subprocess.check_output(['docker','ps','--filter','publish=18702','--format','{{.ID}}'],text=True).split()
assert len(ids)==1
container=json.loads(subprocess.check_output(['docker','inspect',ids[0]]))[0]
labels=container['Config']['Labels']; binding=container['HostConfig']['PortBindings']['3000/tcp']
assert labels['com.docker.compose.project']=='n7f02' and labels['com.docker.compose.service']=='web'
assert binding==[{'HostIp':'127.0.0.1','HostPort':'18702'}]
assert container['HostConfig']['NanoCpus']==2000000000
check=Path('docs/telemetry/features/20261002T201500Z-f02/evidence/r1/port-check.txt').read_text()
assert '18702' in check and 'n7f02-web-1' in check and 'ни одно хранилище' in check
Path('docs/telemetry/features/20261002T201500Z-f02/evidence/r1/preflight.json').write_text(json.dumps({'status':'ready','source':'immutable R1 source-snapshot.json','environment':'n7f02 only; synthetic local fixtures; tests own reset','input':'external existing runtime files; values suppressed','expected_effects':'rebuild/recreate own web; full F01/F02 isolated realPG tests','port_owner':{'container':container['Id'],'project':'n7f02','service':'web','bindings':binding},'db_host_ports':[], 'cpus_per_service':2,'generic_port_exit':1,'ownership_equivalent_exit':0,'external_actions_executed':False,'ui_e2e':'not_applicable: full mailbox UI is F06'},indent=2)+'\n')
print('Port18702 owner n7f02/web confirmed; loopback binding, CPU2, own network/volume, DB unexposed.')
PY
printf '\nStage: before heavy checks; ownership preflight ready; acquiring actual-check lock. UTC: ' >> /tmp/n7-f02-r1-run/progress.md
date -u +%FT%TZ >> /tmp/n7-f02-r1-run/progress.md
exec 9>/tmp/codex-heavy-build.lock
flock -w 45 9
trap 'flock -u 9' EXIT
run free -m
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
printf 'MemAvailable-kB: %s\n' "$available"
test "$available" -ge 2500000
N7_TASK_CPUS=$(python3 -c 'import os;print(",".join(map(str,sorted(os.sched_getaffinity(0))[:2])))')
printf 'CPU affinity: %s\n' "$N7_TASK_CPUS"
run taskset -c "$N7_TASK_CPUS" npm run build
run env DOCKER_BUILDKIT=0 docker build --cpu-period 100000 --cpu-quota 200000 -t n7f02-web .
run docker compose -p n7f02 up -d --no-build --wait
run docker compose -p n7f02 exec -T web npm run typecheck
run docker compose -p n7f02 exec -T web npm run lint
run docker compose -p n7f02 exec -T web npm test
run docker compose -p n7f02 exec -T web npm run test:integration
flock -u 9
trap - EXIT
printf '\nStage: after heavy checks; all passed; lock released. UTC: ' >> /tmp/n7-f02-r1-run/progress.md
date -u +%FT%TZ >> /tmp/n7-f02-r1-run/progress.md
