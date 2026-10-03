#!/usr/bin/env bash
set -euo pipefail
cd "${1:?Pass absolute project root}"
artifact="$PWD/tests/artifacts/release-gate"
project="n6b-f16-pg-$(date -u +%H%M%S)-$$"
private=$(mktemp -d /tmp/n6b-f16-pg.XXXXXX)
chmod 700 "$private"
compose=(docker compose --env-file "$private/test.env" -p "$project" -f compose.test.yml -f "$private/override.yml")
acquired=false
cleanup() {
  result=$?
  trap - EXIT
  if "$acquired"; then
    "${compose[@]}" down --volumes --remove-orphans > "$artifact/pg-cleanup.txt" 2>&1 || result=1
    docker ps -aq --filter "label=com.docker.compose.project=$project" > "$artifact/pg-remaining-containers.txt"
    docker network ls -q --filter "label=com.docker.compose.project=$project" > "$artifact/pg-remaining-networks.txt"
    docker volume ls -q --filter "label=com.docker.compose.project=$project" > "$artifact/pg-remaining-volumes.txt"
    for kind in containers networks volumes; do [ ! -s "$artifact/pg-remaining-$kind.txt" ] || result=1; done
  fi
  rm -rf -- "$private"
  [ ! -e "$private" ] || result=1
  printf 'private_env_removed=true\nproject=%s\n' "$project" >> "$artifact/pg-cleanup.txt"
  if "$acquired"; then
    flock -u 9
    date -u +%FT%TZ > "$artifact/pg-lock-released.txt"
  fi
  date -u +%FT%TZ > "$artifact/pg-finished-at.txt"
  printf '%s\n' "$result" > "$artifact/pg-driver-exit.txt"
  exit "$result"
}
trap cleanup EXIT
for name in TEST_DB_PASSWORD TEST_TENANT_PASSWORD TEST_SERVICE_PASSWORD; do
  printf '%s=%s\n' "$name" "$(openssl rand -hex 24)" >> "$private/test.env"
done
chmod 600 "$private/test.env"
export PG_VALIDATION_ROOT="$PWD" PG_VALIDATION_PRIVATE="$private"
python3 - <<'PY'
import os,pathlib,json
p=pathlib.Path(os.environ['PG_VALIDATION_ROOT']); d=pathlib.Path(os.environ['PG_VALIDATION_PRIVATE'])
mounts=['packages/db/src','packages/db/migrations','packages/db/tests','packages/rag/src','packages/rag/tests','scripts/calibration','scripts/calibrate.ts','scripts/check-cjm.ts','tests/calibration','vitest.config.ts','vitest.int.config.ts','tsconfig.json','tsconfig.base.json','compose.test.yml']
volumes=[f'{p/x}:/app/{x}:ro' for x in mounts]
volumes += [f'{p}/tests/artifacts/release-gate/pg-source-hashes.json:/tmp/pg-source-hashes.json:ro',f'{d}/verify.cjs:/tmp/pg-verify.cjs:ro']
config={'services':{'db':{'cpus':1},'tests':{'image':'n6b-f15-source-management-runner:corrected','cpus':1,'volumes':volumes,'command':['sh','-c','node /tmp/pg-verify.cjs && npm run pretest && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && npm run test:int -- packages/rag/tests/int/release-gate.int.test.ts']}}}
(d/'override.yml').write_text(json.dumps(config))
(d/'verify.cjs').write_text("const fs=require('fs'),crypto=require('crypto'); const m=JSON.parse(fs.readFileSync('/tmp/pg-source-hashes.json')); for(const [p,h] of Object.entries(m.files)){const actual=crypto.createHash('sha256').update(fs.readFileSync('/app/'+p)).digest('hex'); if(actual!==h)throw Error('overlay mismatch: '+p); } console.log('Overlay SHA256 verified: '+Object.keys(m.files).length+' files; source '+m.source_revision); ")
os.chmod(d,0o700);os.chmod(d/'verify.cjs',0o644)
PY
exec 9>/tmp/codex-heavy-build.lock
date -u +%FT%TZ > "$artifact/pg-lock-requested.txt"
if ! flock -w 30 9; then
  printf 'Mutex unavailable within 30 seconds; runner prepared, validation not executed\n' > "$artifact/pg-blocker.txt"
  exit 75
fi
acquired=true
date -u +%FT%TZ > "$artifact/pg-lock-acquired.txt"
docker image inspect n6b-f15-source-management-runner:corrected --format '{{.Id}}' > "$artifact/pg-image-id.txt"
bash ../../scripts/check-port-conflicts.sh compose.test.yml > "$artifact/pg-port-conflicts.txt" 2>&1
"${compose[@]}" config --format json | python3 -c 'import sys,json; x=json.load(sys.stdin); assert all(not v.get("ports") for v in x["services"].values()); assert all(v.get("internal") for v in x["networks"].values()); assert sum(float(v["cpus"]) for v in x["services"].values()) == 2; print("No ports; internal network; total CPU=2, DB=1 runner=1")' > "$artifact/pg-compose-preflight.txt"
python3 - <<'PY'
import json,os,pathlib,datetime
p=pathlib.Path(os.environ['PG_VALIDATION_ROOT']); a=p/'tests/artifacts/release-gate'
(a/'pg-preflight.json').write_text(json.dumps({'status':'ready','source_revision':'e5672838a107c2cafc616600a4cb00de7d5895b8','build_revision':(a/'pg-image-id.txt').read_text().strip(),'environment':'unique isolated compose PG16/pgvector; internal network; no published ports; random private credentials','inputs':'pg-source-hashes.json; explicit source/test overlays; cached dependencies','command':'npm run pretest && tsc --noEmit -p tsconfig.json && npm run test:int -- packages/rag/tests/int/release-gate.int.test.ts','expected_effects':'new ephemeral test DB/roles/rows only; fake provider no network calls','evidence_root':str(a),'external_actions_executed':False,'e2e_claim':None,'recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
PY
timeout --signal=TERM 300 "${compose[@]}" up --no-build --pull never --abort-on-container-exit --exit-code-from tests > "$artifact/pg-validation.txt" 2>&1 &
compose_pid=$!
for check in {1..30}; do
  [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=tests")" ] && break
  sleep 1
done
"${compose[@]}" ps -aq | xargs -r docker inspect --format '{{.Name}} image={{.Image}} cpu={{.HostConfig.NanoCpus}} ports={{json .HostConfig.PortBindings}} mounts={{json .Mounts}}' > "$artifact/pg-container-bindings.txt"
set +e
wait "$compose_pid"
result=$?
set -e
printf '%s\n' "$result" > "$artifact/pg-validation-exit.txt"
exit "$result"
