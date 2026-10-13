#!/usr/bin/env python3
"""Exact R1 checks on the owned stack; preserve historical evidence and bytes."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parent.parent
evidence = root / 'docs/telemetry/features/20261002T211800Z-f03/r1-a'
progress = Path('/tmp/n7-f03a-r1-run/progress.md')
env = {**os.environ, 'COMPOSE_PROJECT_NAME': 'n7f03a',
       'N7_RUNTIME_DIR': '/tmp/n7-f03a-runtime', 'N7_WEB_PORT': '18703',
       'N7_APP_ORIGIN': 'http://127.0.0.1:18703',
       'MAIL_PROVIDER_ALLOWLIST': '{"smtp.gmail.com":30,"imap.gmail.com":30}'}
checks = []
resume = '--resume' in sys.argv
def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()
def run(name, args, expected=0):
    if resume:
        name += '-correction'
    started = stamp()
    result = subprocess.run(args, cwd=root, env=env, capture_output=True, text=True, timeout=180)
    (evidence / (name + '.txt')).write_text(result.stdout + result.stderr + f'\nExit: {result.returncode}\n')
    checks.append({'name': name, 'command': args, 'exit_code': result.returncode,
                   'started_at': started, 'finished_at': stamp()})
    (evidence / ('checks-correction.json' if resume else 'checks.json')).write_text(json.dumps(checks, indent=2) + '\n')
    print(f'{name}: exit {result.returncode}', flush=True)
    assert result.returncode == expected, name
    return result.stdout
compose = ['docker', 'compose', '-p', 'n7f03a']
assert Path('/tmp/n7-f03a-heavy.allowed').is_file()
if Path('/tmp/n7-f03a-r1-run/control.md').exists():
    raise SystemExit('Control file appeared: coordinator must read before continuing.')
# Inspect only own services; occupied18703 must be the existing own local web.
web = json.loads(subprocess.check_output(['docker', 'inspect', 'n7f03a-web-1'], text=True))[0]
db = json.loads(subprocess.check_output(['docker', 'inspect', 'n7f03a-db-1'], text=True))[0]
assert web['Config']['Labels']['com.docker.compose.project'] == 'n7f03a'
assert db['Config']['Labels']['com.docker.compose.project'] == 'n7f03a'
assert web['HostConfig']['PortBindings'] == {'3000/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '18703'}]}
assert not db['HostConfig']['PortBindings']
(evidence / 'ports.json').write_text(json.dumps({'own_project': 'n7f03a', 'web_binding': web['HostConfig']['PortBindings'], 'db_binding': db['HostConfig']['PortBindings']}, indent=2) + '\n')
if not resume:
    port_output = run('port-conflicts-own-reuse', ['bash', '../../scripts/check-port-conflicts.sh', '.'], expected=1)
    assert 'порт 18703 уже занят: контейнер n7f03a-web-1' in port_output
assert (root / 'package-lock.json').read_bytes() == Path('/tmp/n7-f03a-sol/projects/07-cold-email-warmup/package-lock.json').read_bytes()
cpus = ','.join(map(str, sorted(os.sched_getaffinity(0))[:2]))
available = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')))
assert available >= 2500000
with open('/tmp/codex-heavy-build.lock', 'w') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    with progress.open('a') as out:
        out.write(f'\nBefore heavy: {stamp()}; RAM available={available}KiB; CPU={cpus}; own local18703/no DB ports verified.\n')
    try:
        for name in (['typecheck', 'lint'] if resume else ['typecheck', 'lint', 'build']):
            run(name, ['taskset', '-c', cpus, 'npm', 'run', name])
        run('image-build', ['docker', 'build', '--cpu-period', '100000', '--cpu-quota', '200000', '-t', 'n7f03a-web', '.'])
        run('own-stack-up', compose + ['up', '-d', '--no-build', '--wait'])
        if not resume:
            run('unit', compose + ['exec', '-T', 'web', 'npm', 'test'])
        # Reuse the documented unchanged F01 minute-bucket harness.
        second = datetime.datetime.now(datetime.timezone.utc).second
        if second >= 50:
            time.sleep(60 - second)
        run('full-pg', compose + ['exec', '-T', 'web', 'npm', 'run', 'test:integration'])
        source = root / 'src/dispatch/store.ts'
        original = source.read_bytes()
        mutant = original.replace(b'max(q.claim_order)', b'max(q.claimed_at)', 1)
        assert mutant != original
        def copy_source():
            subprocess.run(compose + ['cp', str(source), 'web:/app/src/dispatch/store.ts'], cwd=root, env=env, check=True, capture_output=True)
        try:
            source.write_bytes(mutant)
            copy_source()
            output = run('old-order-mutation', compose + ['exec', '-T', 'web', './node_modules/.bin/tsx', '--test', 'tests/dispatch-integration.test.ts'], expected=1)
            assert 'equal-clock claims must continue alternating after both senders have history' in output and 'ERR_ASSERTION' in output
        finally:
            source.write_bytes(original)
            copy_source()
            assert source.read_bytes() == original
        run('restored-dispatch-pg', compose + ['exec', '-T', 'web', './node_modules/.bin/tsx', '--test', 'tests/dispatch-integration.test.ts'])
        (evidence / 'mutation-restore.json').write_text(json.dumps({'restored_exact_bytes': True, 'sha256': hashlib.sha256(original).hexdigest(), 'mutation': 'Only max(q.claim_order) reverted to historical max(q.claimed_at)'}, indent=2) + '\n')
    finally:
        with progress.open('a') as out:
            out.write(f'After heavy: {stamp()}; completed checks recorded in r1-a/checks.json; lock released.\n')
        fcntl.flock(lock, fcntl.LOCK_UN)
# Fresh source/build hashes after tests AND exact mutation restoration.
paths = sorted([p for folder in ['src', 'db', 'tests'] for p in (root / folder).rglob('*') if p.is_file()])
paths += [root / name for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.build.json', 'eslint.config.js']]
snapshot = [{'path': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
image = subprocess.check_output(['docker', 'image', 'inspect', 'n7f03a-web', '--format', '{{.Id}}'], text=True).strip()
script = "const fs=require('fs'),crypto=require('crypto');const paths=" + json.dumps([item['path'] for item in snapshot]) + ";process.stdout.write(JSON.stringify(paths.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')}))))"
image_files = json.loads(subprocess.check_output(compose + ['exec', '-T', 'web', 'node', '-e', script], cwd=root, env=env, text=True))
assert image_files == snapshot
snapshot += [{'path': name, 'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()} for name in ['Dockerfile', 'docker-compose.yml']]
(evidence / 'source-snapshot.json').write_text(json.dumps(snapshot, indent=2) + '\n')
(evidence / 'image-check.json').write_text(json.dumps({'image': image, 'source_image_matches': len(image_files), 'mismatches': 0, 'checked_at': stamp(), 'mutation_restored': True}, indent=2) + '\n')
# Reuse existing scanner while redirecting ONLY its evidence destination.
scanner = root / 'scripts/check-f03a-secrets.py'
code = scanner.read_text().replace('sol-a-secret-scan.txt', 'r1-a/secret-scan.txt')
exec(compile(code, str(scanner), 'exec'), {'__file__': str(scanner), '__name__': '__main__'})
print('R1 checks, exact-byte restore, source/image binding and secret scan passed.', flush=True)
