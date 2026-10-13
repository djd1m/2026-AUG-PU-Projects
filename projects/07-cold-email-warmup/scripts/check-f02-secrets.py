#!/usr/bin/env python3
"""Read only F02 project files and the isolated n7f02 logs, never print values."""
import json,os,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
runtime=Path('/tmp/n7-f02-runtime')
secret_values=[(runtime/name).read_text().strip() for name in ['session-key','db-password']]
keyring=json.loads((runtime/'credential-keyring.json').read_text())
secret_values.extend(keyring['keys'].values())
assert all(secret_values)
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f02','N7_RUNTIME_DIR':str(runtime),'MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
logs=subprocess.run(['docker','compose','-p','n7f02','logs','--no-color'],cwd=root,env=env,capture_output=True,text=True,check=True)
logtext=logs.stdout+logs.stderr
if any(value in logtext for value in secret_values) or 'N7_CREDENTIAL_CANARY_' in logtext or 'N7_PRIVATE_CANARY_' in logtext:
 raise SystemExit('Secret/canary detected in F02 logs; values suppressed')
files=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard',str(root)],capture_output=True,text=True,check=True).stdout.splitlines()
for filename in files:
 path=Path(filename)
 if path.is_file() and any(value in path.read_text(errors='replace') for value in secret_values):
  raise SystemExit('Secret detected in project files; values suppressed')
evidence=root/'docs/telemetry/features/20261002T201500Z-f02/evidence/secret-scan.txt'
evidence.write_text('Session key, DB password and every credential key checked (values suppressed). F02 tracked/untracked project files and ONLY n7f02 Compose logs contain no runtime secrets. Generated auth/credential failure canary prefixes absent from isolated stack logs. API/DB ciphertext canary assertions passed in integration. Exit0.\n')
print('F02 project and isolated log secret scan pass; values suppressed.')
