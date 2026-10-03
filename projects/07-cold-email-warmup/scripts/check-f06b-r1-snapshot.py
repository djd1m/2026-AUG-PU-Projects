#!/usr/bin/env python3
"""Exact frozen source/build and own image binding; verify is read-only."""
from pathlib import Path
import hashlib, json, subprocess, datetime, sys, os
root = Path(__file__).resolve().parent.parent
e = root / 'docs/telemetry/features/20261003T023900Z-f06'
prefix = os.environ.get('N7_F06_BINDING_PREFIX', 'sol-b-r1')
assert prefix in ['sol-b-r1', 'sol-b-r2', 'sol-b-r3', 'sol-b-r3-readable']
def command(*args):
    return subprocess.check_output(args, cwd=root, text=True).strip()
def digest(paths):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths) if p.is_file()}
def sha(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
source = digest([*root.glob('src/**/*.ts'), *root.glob('tests/*.ts'), root/'package-lock.json', root/'package.json', root/'Dockerfile', root/'tsconfig.build.json', root/'tsconfig.json', root/'eslint.config.js', *root.glob('db/**/*.sql')])
build = digest(root.glob('dist/**/*.js'))
mode = sys.argv[1]
frozen_path = e / (prefix+'-frozen-source.json')
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
if mode == 'freeze':
    assert build, 'build missing'
    assert not frozen_path.exists(), 'freeze already allocated'
    frozen_path.write_text(json.dumps({'at': now, 'source_revision': command('git', 'rev-parse', 'HEAD'), 'source_sha256': sha(source), 'files': source, 'build_sha256': sha(build), 'build_files': build}, indent=2)+'\n')
    print(sha(source))
    sys.exit(0)
frozen = json.loads(frozen_path.read_text())
assert source == frozen['files'], 'source drift after freeze'
assert build == frozen['build_files'], 'compiled JS drift after freeze'
if mode == 'check':
    sys.exit(0)
image = command('docker', 'image', 'inspect', 'n7f06a-web', '--format', '{{.Id}}')
assert image != 'sha256:a65867e3f1af46b3f4d8a4894a002397ce4a84f890b22b6d0d10d44d1eaa2f7f', 'old image still tagged'
if mode == 'preflight':
    data = {'at': now, 'status': 'ready', 'source_revision': frozen['source_revision'], 'source_sha256': sha(source), 'build_sha256': sha(build), 'image_id': image, 'environment': 'own n7f06a loopback18709 privatePG CPU2; existing runtime files present', 'environment_available': True, 'inputs': ['frozen source and compiled JS', 'existing external random runtime files', 'new image tag'], 'test_command': ('python3 scripts/ui/f06-run.py r3-report-layout-3 '+str(e/(prefix+'-image-receipt.json'))) if prefix.startswith('sol-b-r3') else ('python3 scripts/ui/f06-run.py r2-unsubscribe-probe-2 '+str(e/(prefix+'-image-receipt.json'))) if prefix=='sol-b-r2' else 'python3 scripts/check-f06b-r1-native.py', 'expected_effects': ['own stack web replacement', 'own TEST local fixture and unsubscribe native form'] if prefix=='sol-b-r2' else ['own stack web replacement', 'own TEST account registration and native fetch only'], 'evidence_root': str(e), 'external_actions_executed': False, 'e2e_claim': None, 'exact_image_contents': 'pending live-container comparison before browser'}
    (e/(prefix+'-preflight-runtime.json')).write_text(json.dumps(data, indent=2)+'\n')
    sys.exit(0)
assert mode in ['receipt', 'verify']
web, db = json.loads(command('docker', 'inspect', 'n7f06a-web-1', 'n7f06a-db-1'))
assert web['Image'] == image
assert web['NetworkSettings']['Ports']['3000/tcp'] == [{'HostIp': '127.0.0.1', 'HostPort': '18709'}]
assert not any(db['NetworkSettings']['Ports'].values())
assert web['HostConfig']['NanoCpus'] == 2000000000
for relative, expected in {**source, **build}.items():
    if relative == 'Dockerfile':
        continue  # existing Dockerfile is a build input, not copied into image
    actual = command('docker', 'exec', 'n7f06a-web-1', 'sha256sum', '/app/'+relative).split()[0]
    assert actual == expected, relative
receipt_path = e/(prefix+'-image-receipt.json')
if mode == 'receipt':
    assert not receipt_path.exists(), 'receipt already allocated'
    receipt_path.write_text(json.dumps({'at': now, 'source_revision': frozen['source_revision'], 'source_sha256': sha(source), 'source_record': frozen_path.name, 'image_id': image, 'build_sha256': sha(build), 'exact_source_and_build_files': True, 'image_matches_container': True, 'db_no_ports': True, 'loopback18709': True, 'cpu_limit': 2, 'dockerfile_build_input_sha256': source['Dockerfile']}, indent=2)+'\n')
else:
    receipt = json.loads(receipt_path.read_text())
    assert receipt['image_id'] == image and receipt['source_sha256'] == sha(source) and receipt['build_sha256'] == sha(build)
    assert receipt['exact_source_and_build_files'] and receipt['image_matches_container']
print(json.dumps({'source_sha256': sha(source), 'build_sha256': sha(build), 'image_id': image, 'mode': mode}))
