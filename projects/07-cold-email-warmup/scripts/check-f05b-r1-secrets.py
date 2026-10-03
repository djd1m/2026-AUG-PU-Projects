#!/usr/bin/env python3
"""Check real isolated runtime logs and reply persistence for fixture secret/header/body canaries."""
import json, os, subprocess
from pathlib import Path
root=Path(__file__).resolve().parent.parent
env={**os.environ,'COMPOSE_PROJECT_NAME':'n7f05b','N7_RUNTIME_DIR':'/tmp/n7-f05b-runtime','N7_WEB_PORT':'18708','N7_APP_ORIGIN':'http://127.0.0.1:18708','MAIL_PROVIDER_ALLOWLIST':'{"smtp.gmail.com":30,"imap.gmail.com":30}'}
def run(args):
 return subprocess.run(['docker','compose','-p','n7f05b',*args],cwd=root,env=env,check=True,capture_output=True,text=True).stdout
logs=run(['logs','--no-color'])
reply=run(['exec','-T','db','psql','-U','n7','-d','n7','-Atc',"SELECT row_to_json(r) FROM billing_intent r UNION ALL SELECT row_to_json(r) FROM billing_entitlement r UNION ALL SELECT row_to_json(r) FROM partner_conversion r"])
for value in ['N7_F05_SECRET_CANARY']:
 assert value not in logs and value not in reply,value
secrets=[(Path('/tmp/n7-f05b-runtime')/filename).read_text().strip() for filename in ['session-key','db-password','recipient-hash-key','operator-token','credential-keyring.json']]
secrets.extend(json.loads(secrets[-1])['keys'].values())
assert all(secrets)
files=subprocess.run(['git','ls-files','--cached','--others','--exclude-standard',str(root)],cwd=root,check=True,capture_output=True,text=True).stdout.splitlines()
for secret in secrets:
 assert secret not in logs and secret not in reply,'runtime secret leak (value suppressed)'
 for filename in files:
  path=Path(filename)
  if not path.is_absolute():path=root/path
  if path.is_file():assert secret not in path.read_text(errors='replace'),'project secret leak (value suppressed)'
public=run(['exec','-T','db','psql','-U','n7','-d','n7','-Atc',"SELECT snapshot::text FROM evidence_report"])
for value in ['PII_EMAIL_CANARY','PII_CREDENTIAL_CANARY','PII_TENANT_CANARY','PII_MAILBOX_CANARY']:
 assert value not in logs and value not in public,'private evidence leak (value suppressed)'
print('PASS: own project files/logs/reply data contain no runtime secret values; logs/reply data contain no credential/header-display/body canaries.')
