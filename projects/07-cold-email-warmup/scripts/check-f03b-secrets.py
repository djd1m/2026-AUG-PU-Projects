#!/usr/bin/env python3
"""Own-project/own-stack scan; never expose runtime secret contents."""
import json,os,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
runtime=Path('/tmp/n7-f03b-runtime')
values=[(runtime/name).read_text().strip() for name in ['session-key','db-password','recipient-hash-key']]
values.extend(json.loads((runtime/'credential-keyring.json').read_text())['keys'].values())
assert all(values)
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f03b','N7_RUNTIME_DIR':str(runtime),'MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
logs=subprocess.run(['docker','compose','-p','n7f03b','logs','--no-color'],cwd=root,env=env,capture_output=True,text=True,check=True)
text=logs.stdout+logs.stderr
assert not any(value in text for value in values), 'Runtime secret found; contents suppressed'
assert not re.search(r'N7_(?:PRIVATE|CREDENTIAL)_CANARY_|private(?:-b-)?\d+@example\.test',text), 'Private fixture/canary found; contents suppressed'
paths=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard',str(root)],cwd=root,capture_output=True,text=True,check=True).stdout.splitlines()
for name in paths:
 path=Path(name)
 if not path.is_absolute(): path=root/name
 if path.is_file(): assert not any(value in path.read_text(errors='replace') for value in values), 'Secret found in project file; contents suppressed'
(root/('docs/telemetry/features/20261002T211800Z-f03/'+os.environ.get('N7_EVIDENCE_PREFIX','sol-b')+'-secret-scan.txt')).write_text('Runtime session/credential/recipient-hash/DB keys checked; no values in project tracked/untracked files or isolated n7f03b logs. Private contact/credential canaries absent from isolated service logs. No other stack inspected. Exit0.\n')
print('F03b secret/contact canary scan passed; values suppressed.')
