#!/usr/bin/env python3
"""New-image source gate, read-only READY, nonblocking UI flock, own attach cleanup."""
from pathlib import Path
import subprocess, json, datetime, fcntl, hashlib
root = Path(__file__).resolve().parent.parent
e = root/'docs/telemetry/features/20261003T023900Z-f06'
def call(args):
    return subprocess.run(args, cwd=root, check=True, capture_output=True, timeout=45)
lock = open('/tmp/codex-ui-e2e.lock', 'a')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
dest = e/'sol-b-r1-native'; dest.mkdir(exist_ok=False)
remote = '/opt/browser/n7-f06b-r1-native-20261003T023900Z'
added = False
result = 1
try:
    with (dest/'mutex.log').open('a') as f: f.write('UI_ACQUIRED '+now+'\n')
    # Read-only companion preflight: exact host + own running image source/JS.
    call(['python3', 'scripts/check-f06b-r1-snapshot.py', 'verify'])
    receipt = json.loads((e/'sol-b-r1-image-receipt.json').read_text())
    ui = json.loads(call(['docker', 'inspect', 'codex-ui-playwright']).stdout)[0]
    assert ui['State']['Running']
    if 'n7f06a_network' not in ui['NetworkSettings']['Networks']:
        call(['docker', 'network', 'connect', 'n7f06a_network', 'codex-ui-playwright']); added = True
    call(['docker', 'exec', 'codex-ui-playwright', 'mkdir', '-p', remote])
    script = root/'scripts/check-f06b-r1-native.mjs'
    call(['docker', 'cp', str(script), 'codex-ui-playwright:'+remote+'/native.mjs'])
    preflight = {**receipt, 'status': 'ready', 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'environment_available': True, 'environment': 'existing shared Playwright1.63.0 Chromium; own loopback18709/privateDB/CPU2', 'inputs': ['fresh exact source/build/image receipt', 'random TEST account credentials held only in browser memory'], 'script_sha256': hashlib.sha256(script.read_bytes()).hexdigest(), 'test_command': 'docker exec codex-ui-playwright node '+remote+'/native.mjs', 'expected_effects': ['own TEST registration; actual native direct and SessionClient GET /api/app'], 'external_actions_executed': False, 'e2e_claim': None, 'evidence_root': str(dest)}
    (dest/'preflight.json').write_text(json.dumps(preflight, indent=2)+'\n')
    call(['docker', 'cp', str(dest/'preflight.json'), 'codex-ui-playwright:'+remote+'/preflight.json'])
    r = subprocess.run(['docker', 'exec', '-e', 'N7_UI_EVIDENCE='+remote, 'codex-ui-playwright', 'node', remote+'/native.mjs'], cwd=root, capture_output=True, timeout=60)
    result = r.returncode
    (dest/'stdout.log').write_bytes(r.stdout)  # summary contains booleans/status only
finally:
    subprocess.run(['docker', 'cp', 'codex-ui-playwright:'+remote+'/.', str(dest)], capture_output=True, timeout=15)
    if added:
        call(['docker', 'network', 'disconnect', 'n7f06a_network', 'codex-ui-playwright'])
    (dest/'exit.json').write_text(json.dumps({'exit': result, 'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'own_network_detached': added})+'\n')
    with (dest/'mutex.log').open('a') as f: f.write('UI_RELEASED '+datetime.datetime.now(datetime.timezone.utc).isoformat()+'\n')
    fcntl.flock(lock, fcntl.LOCK_UN)
raise SystemExit(result)
