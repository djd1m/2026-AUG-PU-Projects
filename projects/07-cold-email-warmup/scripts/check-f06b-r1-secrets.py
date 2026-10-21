#!/usr/bin/env python3
"""Own project/runtime-value scan; emits counts and booleans only."""
from pathlib import Path
import subprocess, json, datetime
root = Path(__file__).resolve().parent.parent
runtime = Path('/tmp/n7-f06a-runtime')
e = root/'docs/telemetry/features/20261003T023900Z-f06'
secrets = [(runtime/n).read_text().strip().encode() for n in ['session-key', 'db-password', 'recipient-hash-key', 'operator-token']]
secrets.extend(v.encode() for v in json.loads((runtime/'credential-keyring.json').read_text())['keys'].values())
assert all(secrets)
files = [p for folder in ['src', 'tests', 'scripts', 'docs'] for p in (root/folder).rglob('*') if p.is_file() and not p.is_symlink() and '__pycache__' not in p.parts]
project_clean = not any(s in p.read_bytes() for p in files for s in secrets)
logs = subprocess.check_output(['docker', 'logs', 'n7f06a-web-1'], stderr=subprocess.STDOUT)
logs_clean = not any(s in logs for s in secrets)
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'secret_values_suppressed': True, 'project_files': len(files), 'runtime_secret_count': len(secrets), 'project_clean': project_clean, 'own_web_logs_clean': logs_clean, 'credential_canary_logs_absent': b'N7_F06B_CREDENTIAL_CANARY' not in logs, 'runtime_scope': 'current own web; no new image claim'}
(e/'sol-b-r1-secrets.json').write_text(json.dumps(result, indent=2)+'\n')
assert project_clean and logs_clean and result['credential_canary_logs_absent']
print('Own project and web logs secret scan pass; values suppressed')
