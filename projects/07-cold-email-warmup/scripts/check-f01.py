#!/usr/bin/env python3
"""Sequential F01 checks; run only after the parent's heavy-test grant."""
import datetime
import json
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parent.parent
if not Path('/tmp/n7-heavy-tests.allowed').is_file():
    raise SystemExit('Heavy-test grant absent; no runner started.')
evidence = root / 'docs/telemetry/features/20261002T192500Z-f01/evidence'
evidence.mkdir(exist_ok=True)
checks = []
for name, args in [
    ('node22', ['node', '--version']),
    ('typecheck', ['npm', 'run', 'typecheck']),
    ('lint', ['npm', 'run', 'lint']),
    ('unit', ['npm', 'test']),
    ('integration', ['npm', 'run', 'test:integration']),
]:
    command = ['docker', 'compose', 'exec', '-T', 'web', *args]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=180)
    (evidence / (name + '.txt')).write_text(result.stdout + result.stderr)
    checks.append({'name':name, 'command':command, 'exit_code':result.returncode, 'started_at':started, 'finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
    (evidence / 'checks.json').write_text(json.dumps(checks, indent=2) + '\n')
    print(name + ': exit ' + str(result.returncode), flush=True)
    if result.returncode:
        print('See sanitized evidence file for failure.', flush=True)
        raise SystemExit(result.returncode)
