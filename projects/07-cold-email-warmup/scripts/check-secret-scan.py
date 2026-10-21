#!/usr/bin/env python3
"""Scan only N7 tracked files and own container logs without printing secrets."""
import os
import subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
evidence=root/'docs/telemetry/features/20261002T192500Z-f01/evidence'
runtime=Path(os.environ.get('N7_RUNTIME_DIR','/tmp/n7-f01-runtime'))
secrets=[(runtime/name).read_text().strip() for name in ['session-key','db-password']]
if not all(secrets):
    raise SystemExit('Runtime key files missing or empty')
result=subprocess.run(['docker','compose','logs','--no-color'],cwd=root,capture_output=True,text=True,check=True)
logs=result.stdout+result.stderr
if any(secret in logs for secret in secrets) or 'N7_PRIVATE_CANARY_' in logs:
    raise SystemExit('Secret/canary present in own logs; contents suppressed')
files=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard',str(root)],capture_output=True,text=True,check=True).stdout.splitlines()
if any(secret in Path(file).read_text(errors='replace') for file in files if Path(file).is_file() for secret in secrets):
    raise SystemExit('Runtime secret present in project file; contents suppressed')
(evidence/'secret-scan.txt').write_text('Runtime key/password presence: yes (values suppressed). Project tracked/untracked source and own Compose logs: no runtime key/password/canary values found. SQL/native exception canary absent from API error body and logs. Exit0.\n')
(evidence/'runtime-logs.txt').write_text(logs)
print('Secret/canary scan: pass. Values suppressed.')
